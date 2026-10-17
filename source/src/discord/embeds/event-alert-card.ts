import sharp from "sharp";
import { resolve } from "node:path";
import type { EventMeta, Region } from "../../core/types.js";

const BACKGROUND = resolve(process.cwd(), "assets/daeva-event-background.webp");
const MASCOT = resolve(process.cwd(), "assets/shugo-mascot.png");

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function countdown(startsAt: Date): string {
  const seconds = Math.max(
    0,
    Math.floor((startsAt.getTime() - Date.now()) / 1000),
  );

  if (seconds < 60) return "less than a minute";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes
      ? `${hours}h ${remainingMinutes}m`
      : `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours
    ? `${days}d ${remainingHours}h`
    : `${days} day${days === 1 ? "" : "s"}`;
}

function formatStart(startsAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(startsAt);
}

export async function renderEventAlertCard(params: {
  meta: EventMeta;
  region: Region;
  startsAt: Date;
  leadMinutes: number;
  showRegion: boolean;
}): Promise<Buffer> {
  const { meta, region, startsAt, leadMinutes, showRegion } = params;

  const title = escapeXml(meta.name);
  const remaining = escapeXml(countdown(startsAt));
  const startText = escapeXml(formatStart(startsAt));
  const footer = escapeXml(
    showRegion ? `T-${leadMinutes}m  ·  ${region.label}` : `T-${leadMinutes}m`,
  );

  const svg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg"
       width="1200" height="440" viewBox="0 0 1200 440">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#080b1b" stop-opacity=".97"/>
        <stop offset="46%" stop-color="#0b1025" stop-opacity=".90"/>
        <stop offset="72%" stop-color="#10132b" stop-opacity=".40"/>
        <stop offset="100%" stop-color="#11152d" stop-opacity=".12"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c4a0ff"/>
        <stop offset="100%" stop-color="#7652ff"/>
      </linearGradient>
      <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#8b63ff"/>
        <stop offset="55%" stop-color="#c7a5ff"/>
        <stop offset="100%" stop-color="#7152f5" stop-opacity=".25"/>
      </linearGradient>
      <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="card">
        <rect x="1" y="1" width="1198" height="438" rx="25"/>
      </clipPath>
    </defs>

    <g clip-path="url(#card)">
      <rect width="1200" height="440" fill="url(#shade)"/>
      <rect width="11" height="440" fill="url(#edge)"/>

      <!-- Decorative star -->
      <g transform="translate(88 61)" fill="#b58aff" filter="url(#glow)">
        <path d="M0 -25 L7 -7 L25 0 L7 7 L0 25 L-7 7 L-25 0 L-7 -7 Z"/>
        <path d="M-17 -18 L-11 -15 L-14 -9 Z"/>
        <path d="M17 -18 L11 -15 L14 -9 Z"/>
        <path d="M-17 18 L-11 15 L-14 9 Z"/>
        <path d="M17 18 L11 15 L14 9 Z"/>
      </g>

      <text x="128" y="68" fill="#c8a5ff"
        font-family="Georgia, serif" font-size="25"
        letter-spacing="5" font-weight="bold">GLOBAL EVENT ALERT</text>
      <path d="M465 61 H1135" stroke="url(#line)" stroke-width="2"/>

      <!-- Main title -->
      <text x="340" y="204" fill="#ffffff"
        font-family="Georgia, 'DejaVu Serif', serif"
        font-size="59" font-weight="bold"
        stroke="#9b7cff" stroke-opacity=".28" stroke-width="1">${title}</text>

      <!-- Clock icon -->
      <g transform="translate(88 278)" fill="none"
         stroke="#cbb4ff" stroke-width="4" stroke-linecap="round"
         stroke-linejoin="round">
        <circle r="21"/>
        <path d="M0 -12 V0 L10 7"/>
      </g>

      <text x="124" y="288" fill="#f4f1ff"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="28">Starts in</text>
      <text x="267" y="288" fill="#aa83ff"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="28" font-weight="bold">${remaining}</text>

      <path d="M466 252 V296" stroke="#b99bff" stroke-width="2"/>

      <!-- Calendar icon -->
      <g transform="translate(500 257)" fill="none"
         stroke="#cbb4ff" stroke-width="3.5"
         stroke-linecap="round" stroke-linejoin="round">
        <rect x="0" y="5" width="31" height="29" rx="4"/>
        <path d="M8 0 V10 M23 0 V10 M0 14 H31"/>
        <path d="M8 21 H8.5 M16 21 H16.5 M8 27 H8.5 M16 27 H16.5 M24 21 H24.5"/>
      </g>

      <text x="552" y="288" fill="#e0e5ff"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="23">${startText}</text>

      <!-- Ornamental divider -->
      <path d="M70 344 H515 M605 344 H1135"
        stroke="url(#line)" stroke-width="2"/>
      <g transform="translate(560 344)" fill="#a780ff" filter="url(#glow)">
        <path d="M0 -22 L7 -7 L22 0 L7 7 L0 22 L-7 7 L-22 0 L-7 -7 Z"/>
        <path d="M-36 0 L-25 -8 L-28 0 L-25 8 Z"/>
        <path d="M36 0 L25 -8 L28 0 L25 8 Z"/>
        <path d="M0 -11 L4 0 L0 11 L-4 0 Z" fill="#e1cfff"/>
      </g>

      <!-- Globe icon -->
      <g transform="translate(87 397)" fill="none"
         stroke="#a980ff" stroke-width="3.5" stroke-linecap="round">
        <circle r="20" fill="#a980ff" fill-opacity=".16"/>
        <circle r="20"/>
        <ellipse rx="9" ry="20"/>
        <path d="M-18 -8 H18 M-20 2 H20 M-14 13 H14"/>
      </g>

      <text x="125" y="407" fill="#d8c9ff"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="25" letter-spacing="1.5">${footer}</text>

      <text x="930" y="412" fill="#b8bfdf" opacity=".85"
        font-family="DejaVu Sans, Arial, sans-serif"
        font-size="14" letter-spacing="2">DAEVA · AION 2</text>
    </g>

    <!-- Rounded violet frame -->
    <rect x="1.5" y="1.5" width="1197" height="437" rx="25"
      fill="none" stroke="#9d7bff" stroke-opacity=".85" stroke-width="2"/>
  </svg>
  `);

  const base = await sharp(BACKGROUND)
    .resize(1200, 440, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const roundedMask = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="440">
      <rect width="1200" height="440" rx="25" fill="#fff"/>
    </svg>
  `);

  // Round the background first, before adding transparent artwork.
  const roundedBase = await sharp(base)
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Preserve the mascot's alpha channel when resizing.
  const mascot = await sharp(MASCOT)
    .ensureAlpha()
    .resize(250, 160, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp(roundedBase)
    .composite([
      { input: svg, blend: "over" },
      { input: mascot, left: 78, top: 100, blend: "over" },
    ])
    .png()
    .toBuffer();
}
