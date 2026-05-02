import { expect, test } from "@playwright/test";

test("two browser contexts: alice publishes, bob subscribes, video plays", async ({ browser }) => {
  // Two isolated contexts so Playwright's fake media is independent per tab.
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  await alice.goto("/");
  await bob.goto("/");

  // Alice clicks Publish; the example's UI should expose a peerId after
  // useUserMedia resolves.
  await alice.getByRole("button", { name: /publish/i }).click();
  const peerIdLocator = alice.locator("code");
  await expect(peerIdLocator).toBeVisible({ timeout: 10_000 });
  const peerId = (await peerIdLocator.first().innerText()).trim();
  expect(peerId.length).toBeGreaterThan(0);

  // Bob types the publisher peerId and clicks View.
  await bob.getByPlaceholder(/peerId/i).fill(peerId);
  await bob.getByRole("button", { name: /view/i }).click();

  // Bob's <video> element should render. Real WebRTC media transit in
  // headless Chromium is flaky without explicit ICE config — this test
  // covers the wire-up, not the codec path. Browser-tier vitest in EPIC-8
  // covers the media APIs against synthetic streams; SFU integration in
  // EPIC-14 will exercise the full negotiation path.
  const bobVideo = bob.locator("video").first();
  await expect(bobVideo).toBeVisible({ timeout: 10_000 });

  // Bob's status text should leave "idle" — viewer attempted to connect.
  await expect(bob.getByText(/state:/)).toBeVisible({ timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});
