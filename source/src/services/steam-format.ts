/** Turns Steam announcement markup into Discord text (no Discord code, so it's testable). */

export type NewsKind = "maintenance" | "patch" | "event" | "news";

export const NEWS_STYLE: Record<NewsKind, { label: string; color: number }> = {
  maintenance: { label: "Maintenance", color: 0xf0a94b },
  patch: { label: "Patch Notes", color: 0x2ecc71 },
  event: { label: "Event", color: 0xa48cf0 },
  news: { label: "News", color: 0x3498db },
};

export function newsKind(title: string): NewsKind {
  if (/maintenance/i.test(title)) return "maintenance";
  if (/patch|update|hotfix|notes/i.test(title)) return "patch";
  if (/event/i.test(title)) return "event";
  return "news";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Steam BBCode (and the odd bit of HTML) to Discord markdown with real line breaks. */
export function steamToDiscord(c: string): string {
  let t = c
    .replace(/\r\n?/g, "\n")
    .replace(/\[img[^\]]*\][^[]*\[\/img\]/gi, "")
    .replace(/\[previewyoutube[^\]]*\][^[]*\[\/previewyoutube\]/gi, "")
    .replace(/\[video[^\]]*\][^[]*\[\/video\]/gi, "")
    .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, "")
    .replace(/\[hr\]\s*\[\/hr\]|\[hr\]/gi, "\n")
    .replace(/\[h[1-6]\]\s*([\s\S]*?)\s*\[\/h[1-6]\]/gi, (_, x: string) => (x.trim() ? `\n**${x.trim()}**\n` : "\n"))
    .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, (_, x: string) => (x.trim() ? `**${x.trim()}**` : x))
    .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, (_, x: string) => (x.trim() ? `*${x.trim()}*` : x))
    .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, (_, x: string) => (x.trim() ? `__${x.trim()}__` : x))
    .replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, (_, x: string) => (x.trim() ? `~~${x.trim()}~~` : x))
    .replace(/\[url=["']?(https?:\/\/[^\]"']+)["']?\]([\s\S]*?)\[\/url\]/gi, (_, u: string, x: string) => (x.trim() ? `[${x.trim()}](${u})` : u))
    .replace(/\[\*\]/g, "\n• ")
    .replace(/\[\/\*\]/g, "")
    .replace(/\[\/?(?:list|olist)[^\]]*\]/gi, "\n")
    .replace(/\[\/p\]/gi, "\n")
    .replace(/\[p[^\]]*\]/gi, "")
    .replace(/\[br\]/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\/?[a-z0-9]+(?:[= ][^\]]*)?\]/gi, "")
    .replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "");
  t = t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, all) => !(l === "•" || (l === "" && all[i - 1] === "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Keep lists tight: no blank line between bullets, or between a heading and its first bullet.
  let prev;
  do {
    prev = t;
    t = t.replace(/(^|\n)(•[^\n]*|\*\*[^\n]*\*\*)\n\n(?=• )/g, "$1$2\n");
  } while (t !== prev);
  return t;
}

/** Shorten at a line or word break, never mid-word. */
export function clip(t: string, max: number): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const line = cut.lastIndexOf("\n");
  const base = line > max * 0.6 ? cut.slice(0, line) : cut.replace(/\s+\S*$/, "");
  return base.replace(/[\s•:,]+$/, "") + " …";
}

export type Maintenance = { start: number; end?: number; hours?: number; affected?: string };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** UTC offsets in hours for the zones Steam notices use. */
const ZONES: Record<string, number> = { PDT: -7, PST: -8, MDT: -6, MST: -7, CDT: -5, CST: -6, EDT: -4, EST: -5, UTC: 0, GMT: 0, BST: 1, CET: 1, CEST: 2, KST: 9, JST: 9, SGT: 8, MYT: 8 };

const plain = (t: string) => t.replace(/\*\*|__|~~/g, "").replace(/\*/g, "");

/** Start, end and affected services from a maintenance notice, or null when no time is given. */
export function parseMaintenance(text: string): Maintenance | null {
  const p = plain(text);
  const m = p.match(
    new RegExp(
      `\\b(${MONTHS.join("|")})\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*(?:at|,|-)?\\s*(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})\\s*(am|pm)?\\s*\\(?(${Object.keys(ZONES).join("|")})\\b`,
      "i",
    ),
  );
  if (!m) return null;
  const [, monthName = "", day = "", year = "", hh = "", mm = "", ampmRaw, zone = ""] = m;
  let hour = Number(hh);
  const ampm = ampmRaw?.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  const offset = ZONES[zone.toUpperCase()];
  if (offset === undefined) return null;
  const start = Date.UTC(Number(year), MONTHS.indexOf(monthName.toLowerCase()), Number(day), hour - offset, Number(mm));
  if (!Number.isFinite(start)) return null;

  const out: Maintenance = { start };
  const d = p.match(/Duration\s*:?\s*(?:approx(?:imately|\.)?\s*|about\s*|~\s*)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b|minutes?|mins?)/i);
  if (d) {
    const n = Number(d[1]);
    const hours = /^m/i.test(d[2] ?? "") ? n / 60 : n;
    out.hours = hours;
    out.end = start + Math.round(hours * 3_600_000);
  }
  const a = p.match(/Affected(?:\s+Services?)?\s*:\s*([^\n]+)/i);
  if (a) {
    const v = (a[1] ?? "").replace(/^[\s•-]+/, "").trim();
    if (v && v.length <= 80) out.affected = v;
  }
  return out;
}

/** Drop the When / Duration / Affected lines (and a bare "Details" heading) once they're shown as fields. */
export function withoutMaintenanceLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => {
      const s = plain(l).replace(/^[\s•-]+/, "").trim();
      if (/^(When|Duration|Affected(\s+Services?)?)\s*:/i.test(s)) return false;
      if (/^Details\s*:?$/i.test(s)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hoursText(h: number): string {
  const r = Math.round(h * 10) / 10;
  return r === 1 ? "about 1 hour" : `about ${r} hours`;
}
