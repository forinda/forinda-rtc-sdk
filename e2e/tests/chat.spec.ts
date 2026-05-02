import { test } from "@playwright/test";

// Chat e2e is deferred: the React example doesn't yet expose a chat input.
// Tracked in the EPIC-8 follow-up. Once the example gets a minimal
// `<input> + <button>Send</button>` wired through useChat, replace this
// skip with a real two-tab send/receive assertion.
test.skip("alice sends chat → bob receives it", async () => {});
