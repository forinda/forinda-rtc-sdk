import { useState } from "react";
import {
  VideoSdkProvider,
  VideoView,
  usePublisher,
  useUserMedia,
  useViewer,
} from "@forinda/video-sdk-react";
import { defineWebSocketSignaling } from "@forinda/video-sdk-signaling-ws";

const SIGNALING_URL = "ws://127.0.0.1:8787";
const ROOM = "demo";

function Publisher(): JSX.Element {
  const { stream, error: mediaError } = useUserMedia({ audio: true, video: true });
  const { state, viewers, publisher } = usePublisher({ room: ROOM, stream });

  return (
    <section>
      <h2>Publisher</h2>
      <VideoView stream={stream} muted autoPlay playsInline mirror style={style.video} />
      <p>state: {state}</p>
      <p>viewers: {viewers.length}</p>
      <p>peerId: <code>{publisher?.peerId ?? "—"}</code></p>
      {mediaError && <p style={style.err}>media error: {mediaError.message}</p>}
    </section>
  );
}

function Viewer({ publisherId }: { publisherId: string }): JSX.Element {
  const { state, stream, error } = useViewer({ room: ROOM, publisherId });
  return (
    <section>
      <h2>Viewer</h2>
      <VideoView stream={stream} autoPlay playsInline style={style.video} />
      <p>state: {state}</p>
      {error && <p style={style.err}>error: {error.message}</p>}
    </section>
  );
}

export function App(): JSX.Element {
  const [role, setRole] = useState<"publisher" | "viewer" | null>(null);
  const [pubId, setPubId] = useState<string>("");

  return (
    <VideoSdkProvider signaling={() => defineWebSocketSignaling({ url: SIGNALING_URL })}>
      <main style={style.main}>
        <h1>React publisher / viewer</h1>
        <div style={style.row}>
          <button type="button" onClick={() => setRole("publisher")}>Publish</button>
          <input
            type="text"
            placeholder="publisher peerId"
            value={pubId}
            onChange={(e) => setPubId(e.target.value)}
          />
          <button type="button" disabled={!pubId} onClick={() => setRole("viewer")}>
            View
          </button>
        </div>
        {role === "publisher" && <Publisher />}
        {role === "viewer" && <Viewer publisherId={pubId} />}
      </main>
    </VideoSdkProvider>
  );
}

const style = {
  main: { fontFamily: "system-ui", margin: "2rem" } as const,
  row: { display: "flex", gap: "0.5rem", marginBottom: "1rem" } as const,
  video: { width: 480, maxWidth: "100%", background: "#111", borderRadius: 8 } as const,
  err: { color: "crimson" } as const,
};
