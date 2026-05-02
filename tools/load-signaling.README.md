# load:signaling

Generates synthetic chat traffic against a running signaling server and reports throughput + latency percentiles.

## Run

```bash
# Terminal 1
pnpm dev:server

# Terminal 2
pnpm load:signaling --url ws://127.0.0.1:8787 --rooms 100 --peers 10 --chatPerSec 1 --duration 30
```

## Output

```
[load] sent=30000 received=29985 elapsed=30.1s
[load] throughput: sent=997/s received=995/s
[load] latency ms: p50=2.1 p95=8.3 p99=15.7 max=42.0
```

## Knobs

| Flag           | Default               | Meaning                     |
| -------------- | --------------------- | --------------------------- |
| `--url`        | `ws://127.0.0.1:8787` | Signaling server URL        |
| `--rooms`      | `10`                  | Number of distinct rooms    |
| `--peers`      | `5`                   | Peers per room              |
| `--chatPerSec` | `1`                   | Chats per peer per second   |
| `--duration`   | `10`                  | How long to run, in seconds |

Total simulated peers = `rooms × peers`. Total send rate = `rooms × peers × chatPerSec`.
