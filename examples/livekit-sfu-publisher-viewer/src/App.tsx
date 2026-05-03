import { useState } from "react";
import { useSfuPublisher, useSfuViewer, useUserMedia, VideoView } from "@forinda/video-sdk-react";

const LK_URL = (import.meta.env.VITE_LK_URL as string) ?? "wss://your-project.livekit.cloud";
const ROOM = "sfu-demo";

export function App(): JSX.Element {
  const [role, setRole] = useState<"publisher" | "viewer" | null>(null);
  const [token, setToken] = useState("");
  const [pubId, setPubId] = useState("");

  return (
    <main style={style.main}>
      <h1>LiveKit SFU publisher / viewer</h1>
      <p style={style.note}>
        This example needs a LiveKit token (mint server-side; see{" "}
        <code>docs/sfu-integration.md</code>). Paste it below.
      </p>
      <textarea
        rows={3}
        cols={80}
        placeholder="Paste your LiveKit JWT here"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={style.token}
      />
      <div style={style.row}>
        <button onClick={() => setRole("publisher")} disabled={!token}>
          Publish
        </button>
        <input
          placeholder="publisher peerId"
          value={pubId}
          onChange={(e) => setPubId(e.target.value)}
        />
        <button onClick={() => setRole("viewer")} disabled={!token || !pubId}>
          View
        </button>
      </div>
      {role === "publisher" && <Publisher token={token} />}
      {role === "viewer" && <Viewer token={token} publisherId={pubId} />}
    </main>
  );
}

function Publisher({ token }: { token: string }): JSX.Element {
  const { stream } = useUserMedia({ audio: true, video: true });
  const { state, viewers, publisher } = useSfuPublisher({
    url: LK_URL,
    token,
    room: ROOM,
    peerId: "host-" + Date.now(),
    stream,
  });
  return (
    <section>
      <h2>Publisher</h2>
      <VideoView stream={stream} muted autoPlay playsInline mirror style={style.video} />
      <p>state: {state}</p>
      <p>viewers: {viewers.length}</p>
      <p>
        peerId: <code>{publisher?.peerId ?? "—"}</code>
      </p>
    </section>
  );
}

function Viewer({ token, publisherId }: { token: string; publisherId: string }): JSX.Element {
  const { state, stream } = useSfuViewer({
    url: LK_URL,
    token,
    room: ROOM,
    peerId: "viewer-" + Date.now(),
    publisherId,
  });
  return (
    <section>
      <h2>Viewer</h2>
      <VideoView stream={stream} autoPlay playsInline style={style.video} />
      <p>state: {state}</p>
    </section>
  );
}

const style = {
  main: { fontFamily: "system-ui", margin: "2rem" } as const,
  row: { display: "flex", gap: "0.5rem", margin: "1rem 0" } as const,
  video: { width: 480, maxWidth: "100%", background: "#111", borderRadius: 8 } as const,
  token: { fontFamily: "monospace", fontSize: 12, marginBottom: "1rem" } as const,
  note: { color: "#666", fontSize: 14 } as const,
};
