import net from "node:net";
import { logger } from "../lib/logger.js";

/** Measures TCP connect time from this host to the AION 2 game server (Beritra). */
const HOST = process.env.GAME_PING_HOST ?? "48.218.102.133";
const PORT = Number(process.env.GAME_PING_PORT ?? "13328");
const INTERVAL_MS = 60_000;
const TIMEOUT_MS = 3_000;
const SAMPLES = 3;

let latestMs: number | null = null;
let lastOk = true;

function probeOnce(): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = net.connect({ host: HOST, port: PORT });
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once("connect", () => finish(Math.round(performance.now() - start)));
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

async function measure(): Promise<void> {
  const results: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const ms = await probeOnce();
    if (ms !== null) results.push(ms);
  }
  latestMs = results.length ? Math.min(...results) : null;
  const ok = latestMs !== null;
  if (ok !== lastOk) {
    if (ok) logger.info({ host: HOST, port: PORT, ms: latestMs }, "Game server ping recovered");
    else logger.warn({ host: HOST, port: PORT }, "Game server ping failed");
    lastOk = ok;
  }
}

/** Latest measured ping in ms, or null if unreachable / not measured yet. */
export function getGamePing(): number | null {
  return latestMs;
}

export function startGamePing(): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await measure();
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(() => void tick(), INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}
