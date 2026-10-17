import { promises as fs } from "node:fs";
import path from "node:path";
import type { Client } from "discord.js";
import { logger } from "../lib/logger.js";

/** /next replies waiting to be deleted (event end + 30 min). Survives restarts. */
type Pending = { channelId: string; messageId: string; deleteAt: string; tries?: number };

const STATE_DIR = process.env.STATE_DIR ?? "/state";
const FILE = path.join(STATE_DIR, "next-cleanup.json");
const INTERVAL_MS = 30_000;

let pending: Pending[] = [];
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const data = JSON.parse(await fs.readFile(FILE, "utf8"));
    pending = Array.isArray(data) ? (data as Pending[]) : [];
  } catch {
    pending = [];
  }
}

async function save(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(FILE + ".tmp", JSON.stringify(pending));
    await fs.rename(FILE + ".tmp", FILE);
  } catch (err) {
    logger.warn({ err }, "Could not save /next cleanup list");
  }
}

export async function scheduleNextCleanup(channelId: string, messageId: string, deleteAt: Date): Promise<void> {
  await load();
  pending.push({ channelId, messageId, deleteAt: deleteAt.toISOString() });
  await save();
}

export function startNextCleanup(client: Client): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await load();
      const now = Date.now();
      const due = pending.filter((p) => Date.parse(p.deleteAt) <= now);
      if (due.length === 0) return;
      const removed = new Set<Pending>();
      for (const p of due) {
        let done = false;
        try {
          const channel = await client.channels.fetch(p.channelId);
          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            done = true;
          } else {
            await channel.messages.delete(p.messageId);
            done = true;
          }
        } catch (error: unknown) {
          const code = (error as { code?: number } | null)?.code;
          if (code === 10008 || code === 10003 || code === 50001) {
            done = true;
          } else {
            p.tries = (p.tries ?? 0) + 1;
            if (p.tries >= 20) {
              logger.error({ err: error, pending: p }, "Giving up deleting /next reply after 20 attempts");
              done = true;
            } else {
              logger.warn({ err: error, pending: p }, "Could not delete /next reply, will retry");
            }
          }
        }
        if (done) removed.add(p);
      }
      pending = pending.filter((p) => !removed.has(p));
      await save();
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(() => void tick(), INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}
