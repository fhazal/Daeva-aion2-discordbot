import "dotenv/config";
import { createClient } from "./client.js";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { closeDatabase } from "./persistence/db.js";
import { initGuildStore } from "./persistence/store.js";
import { startWebServer } from "./web/server.js";
import { startRosterRefresh } from "./services/legion.js";
import { startGamingToolsMirror } from "./services/gaming-tools-mirror.js";

async function main(): Promise<void> {
  const env = loadEnv();
  initGuildStore(env.DATABASE_PATH);
  const stopWeb = startWebServer();
  const stopMirror = startGamingToolsMirror();
  let stopRoster: (() => void) | null = null;

  const { client, startBackgroundJobs } = await createClient();
  let stoppers: ReturnType<typeof startBackgroundJobs> | null = null;

  client.once("clientReady", () => {
    stoppers = startBackgroundJobs();
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    stoppers?.stopPanels();
    stoppers?.stopAlerts();
    stoppers?.stopServers();
    stoppers?.stopServerStatusCleanup();
    stopWeb();
    stopMirror();
    stopRoster?.();
    client.destroy();
    closeDatabase();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  client.once("clientReady", () => {
    stopRoster = startRosterRefresh(client);
  });

  await client.login(env.DISCORD_TOKEN);
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Fatal startup error");
  closeDatabase();
  process.exit(1);
});
