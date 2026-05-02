import { describe, expect, it } from "vitest";
import { defineDevServer } from "@/dev-server.ts";
import { WebSocket } from "ws";

describe("defineDevServer", () => {
  it("binds to an OS-assigned port and returns the actual port + url", async () => {
    const server = await defineDevServer();
    try {
      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toBe(`ws://127.0.0.1:${server.port}`);
    } finally {
      await server.close();
    }
  });

  it("the server actually accepts WebSocket connections", async () => {
    const server = await defineDevServer();
    try {
      const ws = new WebSocket(server.url);
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      ws.close();
    } finally {
      await server.close();
    }
  });

  it("close() releases the port", async () => {
    const server = await defineDevServer();
    const port = server.port;
    await server.close();

    // Re-binding the same port should succeed if it was released.
    const next = await defineDevServer({ port });
    try {
      expect(next.port).toBe(port);
    } finally {
      await next.close();
    }
  });

  it("respects an explicit port", async () => {
    const first = await defineDevServer();
    const reservedPort = first.port;
    await first.close();

    const server = await defineDevServer({ port: reservedPort });
    try {
      expect(server.port).toBe(reservedPort);
    } finally {
      await server.close();
    }
  });
});
