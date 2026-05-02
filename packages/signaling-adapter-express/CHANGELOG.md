# @forinda/video-sdk-signaling-adapter-express

## 0.1.0

### Minor Changes

Initial public release.

- `defineExpressSignalingMiddleware({ path, ...wsOptions })` — mounts a WebSocket signaling endpoint inside an existing Express HTTP server via the `upgrade` event. Reuses your existing auth middleware via the request object passed through.
- Ships **dual ESM + CJS** to support CJS-first Express consumers.
