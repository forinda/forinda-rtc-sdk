# Integrating with Flask or Django

The Forinda SDK ships a Node-only signaling server (`@forinda/video-sdk-signaling-server`). When your application backend is Python — Flask, FastAPI, Django, anything else — the recommended pattern is **sidecar deployment**: the Node signaling process runs alongside the Python web app and shares an authentication boundary via JWT.

```
   browser
      │
      │ HTTPS  ┌────────────────────┐
      ├──────►│ nginx              │
      │       │  /api/* → Python   │
      │       │  /ws    → Node     │
      │ WSS   └────────────────────┘
      ▼              │
   ws://signal/ws    ▼                        ▼
                Node signaling-server   Python (Flask / Django)
                  port 8787              port 8000
                                                │
                                                ▼
                                          App database
```

**Why sidecar instead of a Python adapter?** The wire protocol (`@forinda/video-sdk-signaling-protocol`) is implemented in TypeScript with zod validation. Re-implementing it in Python would mean maintaining two sources of truth. The sidecar pattern keeps the protocol owned by the Node package while letting your Python app stay the system of record for users, rooms, billing, and any business logic — exactly the way it would treat a managed service like Pusher or Ably.

## Architecture

| Process                 | Owns                                                                   | Port (default) |
| ----------------------- | ---------------------------------------------------------------------- | -------------- |
| Python web app          | User accounts, room metadata, chat history persistence, business logic | 8000           |
| Node signaling          | WebRTC offer/answer relay, presence, in-memory chat fan-out            | 8787           |
| nginx / Caddy / similar | TLS termination, path routing, WebSocket upgrade                       | 443            |

The two processes communicate **only** via the browser holding a JWT minted by Python and presented to Node — there is no direct Python ↔ Node call. This keeps the trust boundary clean and means either process can scale (or restart) independently.

## Token contract

Pick a shared HMAC secret (e.g. `RTC_JWT_SECRET=$(openssl rand -hex 32)`) and inject it into both processes via env. The token claims:

| Claim   | Required | Meaning                                                 |
| ------- | -------- | ------------------------------------------------------- |
| `sub`   | yes      | Stable peer identity. Used as `peerId`.                 |
| `room`  | yes      | Room name the bearer may join.                          |
| `exp`   | yes      | Standard JWT expiry. Keep it short (≤ 5 min).           |
| `iat`   | yes      | Standard JWT issued-at.                                 |
| `roles` | optional | Comma-separated capabilities (e.g. `publish,moderate`). |

The browser receives the token via an authenticated HTTP call to the Python app (`POST /api/rtc/token`) and immediately uses it to open the signaling WebSocket. Tokens are single-room and single-session — re-mint per join.

## Python side

### Flask

`app.py`:

```python
import os
import time
import jwt  # PyJWT
from flask import Flask, jsonify, request, abort
from functools import wraps

app = Flask(__name__)
SECRET = os.environ["RTC_JWT_SECRET"]
TTL_SECONDS = 300  # 5 min — short on purpose


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        # however your app authenticates the user — session, header, etc.
        if "user_id" not in request.cookies:
            abort(401)
        return view(*args, **kwargs)
    return wrapped


@app.post("/api/rtc/token")
@login_required
def mint_token():
    body = request.get_json(force=True)
    room = body.get("room")
    if not room:
        abort(400, "missing room")

    user_id = request.cookies["user_id"]
    # enforce your business rules here: is this user allowed in this room?
    # e.g. check membership in DB before issuing the token

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": user_id,
            "room": room,
            "iat": now,
            "exp": now + TTL_SECONDS,
            "roles": "publish,subscribe",
        },
        SECRET,
        algorithm="HS256",
    )
    return jsonify({"token": token, "url": "wss://example.com/ws"})
```

### Django

`urls.py`:

```python
from django.urls import path
from .views import mint_rtc_token

urlpatterns = [
    path("api/rtc/token", mint_rtc_token, name="rtc-token"),
]
```

`views.py`:

```python
import os
import time
import json
import jwt
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.http import require_POST

SECRET = os.environ["RTC_JWT_SECRET"]
TTL_SECONDS = 300


@require_POST
@login_required
def mint_rtc_token(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("invalid json")

    room = body.get("room")
    if not room:
        return HttpResponseBadRequest("missing room")

    # enforce your business rules here: is this user allowed in this room?

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": str(request.user.id),
            "room": room,
            "iat": now,
            "exp": now + TTL_SECONDS,
            "roles": "publish,subscribe",
        },
        SECRET,
        algorithm="HS256",
    )
    return JsonResponse({"token": token, "url": "wss://example.com/ws"})
```

> **Don't put the JWT secret in `settings.py` or `app.py` literals.** Source it from the environment (12-factor) or a secret manager. Rotation is a config flip + restart, not a code change.

## Node side

A small wrapper around `@forinda/video-sdk-signaling-server` that verifies the same JWT before allowing any join.

`signaling.mjs`:

```js
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { defineSignalingServer } from "@forinda/video-sdk-signaling-server";

const SECRET = process.env.RTC_JWT_SECRET;
if (!SECRET) {
  console.error("RTC_JWT_SECRET is required");
  process.exit(1);
}

const server = defineSignalingServer({
  port: Number(process.env.PORT ?? 8787),
  // Called on every join. Returning false (or throwing) rejects the connect.
  authenticate: async (token, room) => {
    if (!token) return false;
    try {
      const claims = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
      if (claims.room !== room) return false;
      return { peerId: claims.sub, roles: (claims.roles ?? "").split(",") };
    } catch {
      return false;
    }
  },
  maxPeersPerRoom: 50,
});

await server.start();
console.log("signaling listening on", server.url);
```

Run it:

```bash
RTC_JWT_SECRET=$RTC_JWT_SECRET node signaling.mjs
```

In production, manage it with the same supervisor that runs your Python app (systemd, supervisord, PM2, k8s sidecar container).

## Browser

Mint the token via your Python app, then open the signaling socket with the token in the URL (or a custom header — pick one and stick to it).

```ts
import { definePublisher, getUserMedia } from "@forinda/video-sdk-core";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const room = "demo-room";

// 1. Ask Python for a fresh token.
const res = await fetch("/api/rtc/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ room }),
});
const { token, url } = await res.json();

// 2. Open the signaling socket with the token as a query string.
const signaling = defineWebSocketSignaling({
  url: `${url}?token=${encodeURIComponent(token)}`,
});

// 3. Publish.
const stream = await getUserMedia({ audio: true, video: true });
const publisher = definePublisher({ signaling, room, stream });
await publisher.start();
```

The Node `authenticate` callback above reads `token` off the WebSocket URL via the standard `URL` constructor; if you'd rather use an `Authorization` header, configure the browser transport's `headers` option and read it from `request.headers` in a custom `verifyClient` hook on the underlying `ws.WebSocketServer`.

## Reverse proxy

nginx 1.25+:

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;

  ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

  # Python app — Flask via gunicorn or Django via uvicorn/daphne, etc.
  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Node signaling — WebSocket upgrade required.
  location /ws {
    proxy_pass         http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_set_header   Host              $host;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;            # long-lived sockets
  }
}
```

Caddy is a one-liner equivalent (it handles WebSocket upgrades automatically):

```text
app.example.com {
  reverse_proxy /ws localhost:8787
  reverse_proxy localhost:8000
}
```

## Chat history persistence (optional)

Node holds chat in memory by default — sufficient for ephemeral rooms. If you want persistence backed by Postgres, MySQL, etc., subscribe to the `chat` event in your Node wrapper and POST it to a Python endpoint:

```js
server.on("chat", async ({ room, peerId, text, ts }) => {
  await fetch("http://127.0.0.1:8000/api/rtc/chat-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ room, peerId, text, ts }),
  });
});
```

Same pattern for presence (`peer-joined` / `peer-left`) if you need a durable audit log.

## Common pitfalls

| Symptom                                                  | Cause                                                                     | Fix                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| WebSocket closes immediately with code 4401              | `authenticate` returned `false` — token bad, expired, or `room` mismatch. | Check token expiry; ensure the browser sends the same `room` string the token was minted for.              |
| 502 Bad Gateway on `/ws`                                 | nginx isn't upgrading the request.                                        | Add `proxy_http_version 1.1` + `Upgrade` / `Connection` headers (see config above).                        |
| Chat works in a tab but not across tabs of the same user | Two tabs hold two `Publisher`s competing for the same `peerId`.           | Mint a per-tab token (e.g. append a tab-id to `sub`), or use `defineRoom` with a single shared `peerId`.   |
| CORS error on `/api/rtc/token` from a different origin   | Browser is hitting Python from a non-same-origin page.                    | Use `flask-cors` / `django-cors-headers` to allow the page's origin, or co-locate everything behind nginx. |
| Token leaks into server logs                             | Logging middleware records the full request URL.                          | Move the token into a header (`Sec-WebSocket-Protocol` is one option) and strip it from log formats.       |

## Deploying as Docker Compose

A minimal layout if you want one-command spin-up:

```yaml
# docker-compose.yml
services:
  python:
    build: ./python
    environment:
      - RTC_JWT_SECRET=${RTC_JWT_SECRET}
    expose: ["8000"]
  signaling:
    image: node:22-alpine
    working_dir: /app
    volumes: ["./node:/app"]
    command: node signaling.mjs
    environment:
      - RTC_JWT_SECRET=${RTC_JWT_SECRET}
      - PORT=8787
    expose: ["8787"]
  nginx:
    image: nginx:1.27-alpine
    volumes: ["./nginx.conf:/etc/nginx/conf.d/default.conf:ro"]
    ports: ["443:443"]
    depends_on: [python, signaling]
```

Both containers receive the same `RTC_JWT_SECRET` from the host environment. Rotate by restarting both with a new value (existing tokens stay valid until `exp`, which is why the TTL is short).

## See also

- [Architecture](/cookbook/architecture) — how `@forinda/video-sdk-signaling-server` fits in the larger graph.
- [Patterns](/cookbook/patterns) — the auth-protected webinar recipe shows the same JWT shape with a Node-only backend.
- [Troubleshooting](/cookbook/troubleshooting) — every typed error code and what causes it.
