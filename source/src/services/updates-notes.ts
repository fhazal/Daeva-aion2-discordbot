/** Release highlights for the Daeva Meter announcement (no Discord code, so it's testable). */
export type Highlights = { tagline: string; added: string[]; fixed: string[] };

/**
 * The short release notes in the meter repo's .github/announce.md:
 *   version: 0.3.7
 *   tagline: One sentence.
 *   ## New
 *   - 📈 **Live numbers** that count up
 *   ## Fixed
 *   - Thamon's self-heals counted as damage
 */
export function parseAnnounce(md: string, version: string): Highlights | null {
  const v = md.match(/^version:\s*v?([\w.]+)/im)?.[1];
  if (!v || v !== version.replace(/^v/, "")) return null;
  const tagline = md.match(/^tagline:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const section = (name: string) => {
    const m = md.match(new RegExp(`^##\\s*${name}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "im"));
    return (m?.[1] ?? "").split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());
  };
  return { tagline, added: section("New"), fixed: section("Fixed") };
}

/** Fallback: the bold lead of each bullet in CHANGELOG.md's section for the version. */
export function parseChangelog(md: string, version: string): Highlights {
  const v = version.replace(/^v/, "").replace(/\./g, "\\.");
  const sec = md.match(new RegExp(`^##\\s*${v}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s)`, "m"))?.[1] ?? "";
  const added = sec
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.match(/^- \*\*([^*]+?):?\*\*/)?.[1])
    .filter((x): x is string => !!x)
    .map((t) => `**${t.replace(/:$/, "")}**`);
  return { tagline: "", added, fixed: [] };
}

