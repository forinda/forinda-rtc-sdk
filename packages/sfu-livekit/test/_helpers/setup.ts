/**
 * Vitest setup — polyfills MediaStream for jsdom (which doesn't ship it).
 * Minimal implementation covering only the surface our adapter exercises:
 * `addTrack`, `removeTrack`, `getTracks`, `getVideoTracks`, `getAudioTracks`.
 */

if (typeof globalThis.MediaStream === "undefined") {
  class MinimalMediaStream {
    private readonly tracks: MediaStreamTrack[] = [];
    addTrack(track: MediaStreamTrack): void {
      this.tracks.push(track);
    }
    removeTrack(track: MediaStreamTrack): void {
      const idx = this.tracks.indexOf(track);
      if (idx >= 0) this.tracks.splice(idx, 1);
    }
    getTracks(): MediaStreamTrack[] {
      return [...this.tracks];
    }
    getVideoTracks(): MediaStreamTrack[] {
      return this.tracks.filter((t) => t.kind === "video");
    }
    getAudioTracks(): MediaStreamTrack[] {
      return this.tracks.filter((t) => t.kind === "audio");
    }
  }
  (globalThis as unknown as { MediaStream: typeof MediaStream }).MediaStream =
    MinimalMediaStream as unknown as typeof MediaStream;
}
