import { parsePairings, type Faction, type Pairings } from "./pairings.js";

/**
 * Reads NCSOFT's "Server Matchmaking" notice (HTML from the community API)
 * into pairings. The notice has an "Abyss Server Pairings" part and a
 * "Rift Server Pairings" part, each with one table per region under a
 * region heading. Abyss tables: Pair #, Server 1, Server 2, Server 1
 * Faction, Server 2 Faction. Rift tables: Pair #, Elyos Server, Asmodian
 * Server. Anything else throws with a reason short enough for a DM.
 */

/** NCSOFT spellings that differ from the game's server names. */
const ALIASES: Record<string, string> = { fergion: "Fregion" };

export function isMatchmakingTitle(title: string): boolean {
  return /server\s*matchmaking/i.test(title);
}

/** "[Notice] Server Matchmaking | October 28" → "Server Matchmaking | October 28". */
export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, " ").replace(/^\[notice\]\s*/i, "").trim();
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

function text(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cells(row: string): string[] {
  return [...row.matchAll(/<t([dh])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((m) => text(m[2]!));
}

function serverName(raw: string, known: Map<string, string>): string {
  const key = raw.trim().toLowerCase();
  const name = ALIASES[key] ?? known.get(key) ?? raw.trim();
  if (!known.has(name.toLowerCase())) throw new Error(`unknown server "${raw.trim()}"`);
  return name;
}

function faction(raw: string): Faction {
  if (/^elyos$/i.test(raw)) return "Elyos";
  if (/^asmodians?$/i.test(raw)) return "Asmodian";
  throw new Error(`unknown faction "${raw}"`);
}

type Table = { mode: "abyss" | "rift"; region: string; rows: string[][] };

/** Every table with the part (Abyss/Rift) and region heading it sits under. */
function tables(html: string): Table[] {
  const out: Table[] = [];
  let mode: Table["mode"] | null = null;
  let last = 0;
  for (const m of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const before = html.slice(last, m.index);
    last = m.index! + m[0].length;
    const beforeText = text(before);
    if (/rift\s+server\s+pairings/i.test(beforeText)) mode = "rift";
    else if (/abyss\s+server\s+pairings/i.test(beforeText)) mode = "abyss";
    const headings = [...before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
      .map((h) => text(h[1]!))
      .filter(Boolean);
    const region = headings.at(-1) ?? "";
    const rows = [...m[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r) => cells(r[0]));
    if (mode) out.push({ mode, region, rows });
  }
  return out;
}

function column(header: string[], test: RegExp, what: string): number {
  const i = header.findIndex((h) => test.test(h));
  if (i < 0) throw new Error(`no "${what}" column`);
  return i;
}

/**
 * Pairings for one region from the notice HTML. `knownServers` are the names
 * we accept (the current pairings plus the live server list), any case.
 */
export function parseMatchmakingHtml(
  html: string,
  meta: { id: string; title: string; postedAt: string },
  knownServers: Iterable<string>,
  region = "Asia",
): Pairings {
  const known = new Map([...knownServers].map((s) => [s.toLowerCase(), s]));
  const factions: Record<string, Faction> = {};
  const setFaction = (name: string, f: Faction, where: string) => {
    if (factions[name] && factions[name] !== f) throw new Error(`${name} is both factions (${where})`);
    factions[name] = f;
  };
  const found: Partial<Record<Table["mode"], [string, string][]>> = {};

  for (const t of tables(html)) {
    if (t.region.toLowerCase() !== region.toLowerCase()) continue;
    const where = `${region} ${t.mode === "abyss" ? "Abyss" : "Rift"} table`;
    if (found[t.mode]) throw new Error(`two ${where}s`);
    const [header, ...body] = t.rows;
    if (!header) throw new Error(`empty ${where}`);
    const pairCol = column(header, /pair/i, "Pair #");
    const pairs: { n: number; pair: [string, string] }[] = [];
    try {
      if (t.mode === "abyss") {
        const s1 = column(header, /^server 1$/i, "Server 1");
        const s2 = column(header, /^server 2$/i, "Server 2");
        const f1 = column(header, /server 1\s*faction/i, "Server 1 Faction");
        const f2 = column(header, /server 2\s*faction/i, "Server 2 Faction");
        for (const row of body) {
          if (!row.some(Boolean)) continue;
          const a = serverName(row[s1] ?? "", known);
          const b = serverName(row[s2] ?? "", known);
          setFaction(a, faction(row[f1] ?? ""), where);
          setFaction(b, faction(row[f2] ?? ""), where);
          pairs.push({ n: Number(row[pairCol]), pair: [a, b] });
        }
      } else {
        const el = column(header, /elyos/i, "Elyos Server");
        const as = column(header, /asmodian/i, "Asmodian Server");
        for (const row of body) {
          if (!row.some(Boolean)) continue;
          const a = serverName(row[el] ?? "", known);
          const b = serverName(row[as] ?? "", known);
          setFaction(a, "Elyos", where);
          setFaction(b, "Asmodian", where);
          pairs.push({ n: Number(row[pairCol]), pair: [a, b] });
        }
      }
    } catch (err) {
      throw new Error(`${(err as Error).message} in the ${where}`);
    }
    if (pairs.some((p) => !Number.isInteger(p.n))) throw new Error(`a pair number isn't a number in the ${where}`);
    found[t.mode] = pairs.sort((x, y) => x.n - y.n).map((p) => p.pair);
  }

  if (!found.abyss) throw new Error(`no ${region} Abyss table`);
  if (!found.rift) throw new Error(`no ${region} Rift table`);
  return parsePairings({
    region,
    since: meta.postedAt.slice(0, 10),
    noticeId: meta.id,
    notice: {
      title: cleanTitle(meta.title),
      url: `https://aion2.plaync.com/en-us/board/notice/view?articleId=${meta.id}`,
    },
    factions,
    abyss: found.abyss,
    rift: found.rift,
  });
}
