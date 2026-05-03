---
layout: home

hero:
  name: "Forinda RTC SDK"
  text: "Framework-agnostic WebRTC."
  tagline: "Publish video, view it, chat, raise hands, share screens, and record — from plain TypeScript, React, Vue 3, or Web Components — against any signaling backend you can write."
  actions:
    - theme: brand
      text: Quick start
      link: /get-started/quick-start
    - theme: alt
      text: Browse packages
      link: /packages/
    - theme: alt
      text: Architecture →
      link: /cookbook/architecture

features:
  - title: One-publisher → many-viewers WebRTC
    details: Perfect-negotiation, retry policy, auto-reconnect, stats. Works in any modern browser.
  - title: Four consumer surfaces, one core
    details: Vanilla TS, React 18+ hooks, Vue 3 composables, standards-based Web Components.
  - title: Bring your own backend
    details: WebSocket, BroadcastChannel, Express, or write your own signaling adapter against the typed protocol.
  - title: Mesh by default, SFU when you outgrow it
    details: P2P mesh covers ≤8 viewers per publisher. The opt-in LiveKit adapter swaps in for larger broadcasts with the same Publisher / Viewer surface.
  - title: Presence, chat, and recording
    details: Built on the same signaling transport as media. Raise hand, broadcast / DM messaging, MediaRecorder with chunked uploads.
  - title: Slim bundles
    details: Browser core ~8 KB gzipped; the full publish + chat + recording stack lands under ~16 KB gzipped.
---
