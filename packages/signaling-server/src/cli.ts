/**
 * Standalone signaling server CLI.
 *
 * Argv parsing via Commander; colored output via picocolors. Wraps the
 * library factory `defineSignalingServer` and adds graceful shutdown on
 * SIGINT/SIGTERM.
 *
 * Usage:
 *   forinda-signaling [--port 3000] [--max-peers 50]
 */

import { Command } from "commander";
import pc from "picocolors";
import { defineSignalingServer, DEFAULT_PORT } from "./server.ts";

interface CliOptions {
  port: string;
  maxPeers?: string;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("forinda-rtc-signaling")
    .description(
      "Standalone reference signaling server for the Forinda RTC SDK.\n" +
        "Speaks the wire-format protocol from @forinda/video-sdk-signaling-protocol.",
    )
    .version("0.0.0")
    .option("-p, --port <port>", "Bind port (use 0 for OS-assigned)", String(DEFAULT_PORT))
    .option("--max-peers <n>", "Max peers per room", "50")
    .showHelpAfterError();

  program.parse(argv);
  const opts = program.opts<CliOptions>();
  const port = Number.parseInt(opts.port, 10);
  const maxPeers = opts.maxPeers !== undefined ? Number.parseInt(opts.maxPeers, 10) : undefined;

  if (Number.isNaN(port)) {
    process.stderr.write(pc.red(`error: --port must be a number, got "${opts.port}"\n`));
    process.exitCode = 2;
    return;
  }

  const server = defineSignalingServer({
    port,
    ...(maxPeers !== undefined && !Number.isNaN(maxPeers) ? { maxPeersPerRoom: maxPeers } : {}),
  });

  // Resolve OS-assigned port (when port: 0).
  await new Promise((resolve) => setTimeout(resolve, 20));
  const addr = server.wss.address();
  const boundPort = typeof addr === "object" && addr !== null && "port" in addr ? addr.port : port;

  process.stdout.write(
    `${pc.green("forinda-rtc-signaling")} ${pc.dim("listening on")} ${pc.cyan(`ws://0.0.0.0:${boundPort}`)}\n`,
  );
  if (maxPeers !== undefined) {
    process.stdout.write(`${pc.dim("max peers per room:")} ${pc.yellow(String(maxPeers))}\n`);
  }

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`\n${pc.dim(`${signal} received, shutting down…`)}\n`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
