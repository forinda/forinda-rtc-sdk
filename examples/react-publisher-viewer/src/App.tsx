import { useEffect, useRef, useState } from "react";
import {
  VideoSdkProvider,
  VideoView,
  useDisplayMedia,
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
  const screen = useDisplayMedia();
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);

  // Remember the camera video track so we can swap back when sharing ends.
  useEffect(() => {
    cameraTrackRef.current = stream?.getVideoTracks()[0] ?? null;
  }, [stream]);

  // When the user opens or stops the screen-share, swap publisher's video sender.
  useEffect(() => {
    if (!publisher) return;
    if (screen.state === "granted" && screen.stream) {
      const t = screen.stream.getVideoTracks()[0];
      if (t) void publisher.replaceVideoTrack(t);
    } else if (screen.state === "ended" && cameraTrackRef.current) {
      void publisher.replaceVideoTrack(cameraTrackRef.current);
    }
  }, [publisher, screen.state, screen.stream]);

  const previewStream = screen.stream ?? stream;
  const isSharing = screen.state === "granted";

  return (
    <section>
      <h2>Publisher</h2>
      <VideoView
        stream={previewStream}
        muted
        autoPlay
        playsInline
        mirror={!isSharing}
        style={style.video}
      />
      <div style={style.row}>
        {!isSharing ? (
          <button type="button" onClick={() => void screen.start()}>
            Share screen
          </button>
        ) : (
          <button type="button" onClick={() => screen.stop()}>
            Stop sharing
          </button>
        )}
      </div>
      <p>state: {state}</p>
      <p>viewers: {viewers.length}</p>
      <p>
        peerId: <code>{publisher?.peerId ?? "—"}</code>
      </p>
      {mediaError && <p style={style.err}>media error: {mediaError.message}</p>}
      {screen.error && <p style={style.err}>screen error: {screen.error.message}</p>}
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
          <button type="button" onClick={() => setRole("publisher")}>
            Publish
          </button>
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
