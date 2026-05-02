# @forinda/integration-tests

Cross-package integration tests for the Forinda RTC SDK. Private — not published.

## When to add a test here

- The scenario crosses package boundaries (e.g. `core` Publisher + `signaling-server` engine + `signaling-ws` transport in one flow).
- The test needs a real WebSocket round-trip, not the in-memory `defineEngineFixture`.
- The bug only reproduces in the wired-together stack.

If a test exercises one package's surface only, write it in that package's `test/` directory instead.

## Run

```bash
pnpm --filter @forinda/integration-tests test
# or from the root:
pnpm test:integration
```
