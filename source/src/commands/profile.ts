import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  armoryUrl,
  characterOwner,
  characterRef,
  isValidCharacterName,
  listMemberCharacters,
  MAX_CHARACTERS,
  officialProfileUrl,
  parseProfileUrl,
  removeMemberCharacters,
  removeRosterCharacter,
  serverName,
  upsertRosterEntry,
  type RosterEntry,
} from "../persistence/roster.js";
import {
  fetchCharacterInfo,
  findCharacters,
  lookupCooldown,
  SEARCH_REGIONS,
  type CharacterMatch,
} from "../services/character-search.js";
import { displayLegion, isLegionMember, legionLine, memberLegion, syncRoles } from "../services/legion.js";
import { classColor, classEmoji, factionEmoji, factionName } from "../discord/class-style.js";
import type { Command } from "./types.js";

const SITE = "https://aion2.bajubesi.org/#players";
const PICK_TIMEOUT_MS = 60_000;
const FACTION: Record<number, string> = { 1: "Elyos", 2: "Asmodian" };

type Found = { serverId: number; characterId: string; region: string; name: string; level: number | null; race?: number | null };

function describe(m: CharacterMatch): string {
  const parts = [m.serverName];
  if (m.level != null) parts.push(`level ${m.level}`);
  const faction = m.race != null ? FACTION[m.race] : undefined;
  if (faction) parts.push(faction);
  return parts.join(", ");
}

const formatNum = (n: number | null) => (n != null ? n.toLocaleString("en-US") : "–");

/** A profile card: portrait, details as fields with icons, class colour, and its own link buttons. */
function profileCard(e: RosterEntry, note?: string) {
  const ours = isLegionMember(e.legion);
  const embed = new EmbedBuilder()
    .setColor(classColor(e.className, ours ? 0x5fd3c4 : 0x8b939e))
    .setTitle(e.characterName)
    .setURL(e.profileUrl)
    .addFields(
      { name: `${classEmoji(e.className)} Class`, value: e.className, inline: true },
      { name: "🎚️ Level", value: formatNum(e.level), inline: true },
      { name: "🌐 Server", value: serverName(e.serverId), inline: true },
      { name: "📈 Combat power", value: formatNum(e.combatPower), inline: true },
      { name: "🛡️ Item level", value: formatNum(e.itemLevel), inline: true },
      { name: "🏰 Legion", value: e.legion ? `${displayLegion(e.legion)}${ours ? " ✓" : ""}` : "–", inline: true },
    )
    .setFooter({ text: "Bajubesi Network legion roster · last updated" })
    .setTimestamp(new Date(e.updatedAt));
  // Faction under the name (custom emojis show in the description, not the author line).
  const lines = [e.faction ? `${factionEmoji(e.faction)} **${e.faction}**` : "", note ?? ""].filter(Boolean);
  if (lines.length) embed.setDescription(lines.join("\n"));
  if (e.imageUrl) embed.setThumbnail(e.imageUrl);

  const buttons = [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Official profile").setURL(e.profileUrl)];
  const armory = armoryUrl(e.profileUrl);
  if (armory) buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Armory").setURL(armory));
  buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Legion roster").setURL(SITE));

  return { embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)] };
}

export const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Add your AION 2 characters (up to 5) to the legion roster on aion2.bajubesi.org")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Add a character (up to 5, alts welcome) or refresh one already on the roster")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("The character's name").setRequired(true).setMinLength(2).setMaxLength(24),
        )
        .addStringOption((opt) =>
          opt
            .setName("region")
            .setDescription("Your game region (default: Asia)")
            .setRequired(false)
            .addChoices(...SEARCH_REGIONS.map((r) => ({ name: r.name, value: r.value }))),
        )
        .addStringOption((opt) =>
          opt
            .setName("link")
            .setDescription("Optional: your character page link, if the search can't find you")
            .setRequired(false)
            .setMaxLength(300),
        ),
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Show your characters on the roster"))
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a character from the roster (leave the name empty to remove all of yours)")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Which character (empty = all of them)").setRequired(false).setAutocomplete(true),
        ),
    ),

  // Suggests the member's own characters for /profile remove.
  async autocomplete(interaction) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const typed = String(interaction.options.getFocused()).toLowerCase();
    const names = listMemberCharacters(interaction.guildId, interaction.user.id)
      .map((e) => e.characterName)
      .filter((n) => n.toLowerCase().includes(typed))
      .slice(0, 25);
    await interaction.respond(names.map((n) => ({ name: n, value: n })));
  },

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Use this command in the server.", ephemeral: true });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    /** Re-applies the member's roles from all their remaining characters. */
    const resync = async () => {
      if (!interaction.guild) return null;
      const chars = listMemberCharacters(guildId, userId);
      return syncRoles(interaction.guild, userId, memberLegion(chars.map((c) => c.legion)), chars.length > 0);
    };

    if (sub === "show") {
      const chars = listMemberCharacters(guildId, userId);
      if (chars.length === 0) {
        await interaction.reply({ content: "You're not on the roster yet. Add a character with `/profile set`.", ephemeral: true });
        return;
      }
      // One private message per character, so each card has its own buttons right under it.
      const [first, ...rest] = chars.slice(0, MAX_CHARACTERS);
      await interaction.reply({
        content: `Your characters on the roster (${chars.length} of ${MAX_CHARACTERS}):`,
        ...profileCard(first!),
        ephemeral: true,
      });
      for (const e of rest) await interaction.followUp({ ...profileCard(e), ephemeral: true });
      return;
    }

    if (sub === "remove") {
      const name = interaction.options.getString("name")?.trim();
      if (name) {
        const removed = removeRosterCharacter(guildId, userId, name);
        if (removed) await resync();
        const left = listMemberCharacters(guildId, userId).length;
        await interaction.reply({
          content: removed
            ? `Removed **${name}**. ${left ? `You have ${left} character${left === 1 ? "" : "s"} left on the roster.` : "You have no characters on the roster now."}`
            : `**${name}** isn't one of your characters on the roster. \`/profile show\` lists them.`,
          ephemeral: true,
        });
        return;
      }
      const count = removeMemberCharacters(guildId, userId);
      if (count && interaction.guild) await syncRoles(interaction.guild, userId, null, false);
      await interaction.reply({
        content: count
          ? `Removed all ${count} of your character${count === 1 ? "" : "s"}. You no longer appear on the roster.`
          : "You weren't on the roster.",
        ephemeral: true,
      });
      return;
    }

    if (sub !== "set") {
      await interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
      return;
    }

    const name = interaction.options.getString("name", true).trim();
    const region = interaction.options.getString("region") ?? "as";
    const rawLink = interaction.options.getString("link");

    if (!isValidCharacterName(name)) {
      await interaction.reply({
        content: "Character names can only contain letters and numbers, 2 to 24 characters long.",
        ephemeral: true,
      });
      return;
    }

    /** Reads official details, saves the entry, syncs the legion role and builds the reply. */
    const finish = async (found: Found) => {
      const profileUrl = officialProfileUrl(found.serverId, found.characterId, found.region);
      // Each character belongs to one member, and each member has up to five.
      const owner = characterOwner(guildId, profileUrl);
      if (owner && owner !== userId) {
        return {
          content: `**${found.name}** is already on the roster for another member. If it's yours, ask an officer to sort it out.`,
          embeds: [],
          components: [],
        };
      }
      const existing = owner === userId;
      if (!existing && listMemberCharacters(guildId, userId).length >= MAX_CHARACTERS) {
        return {
          content: `You already have ${MAX_CHARACTERS} characters on the roster. Remove one with \`/profile remove\` first.`,
          embeds: [],
          components: [],
        };
      }
      const info = await fetchCharacterInfo(found.serverId, found.characterId, found.region);
      const entry = upsertRosterEntry({
        guildId,
        userId,
        characterName: info?.name ?? found.name,
        className: info?.className ?? "Unknown",
        serverId: found.serverId,
        region: found.region,
        profileUrl,
        level: info?.level ?? found.level,
        combatPower: info?.combatPower ?? null,
        itemLevel: info?.itemLevel ?? null,
        legion: info?.legion ?? null,
        imageUrl: info?.imageUrl ?? null,
        faction: factionName(info?.raceId ?? found.race ?? null),
      });
      const roles = (await resync()) ?? ({ legion: "not-configured", player: "not-configured" } as const);
      const note = info
        ? legionLine(entry.legion, roles)
        : "Couldn't read your official details just now; they'll fill in during the daily refresh.";
      const total = listMemberCharacters(guildId, userId).length;
      return {
        content: existing
          ? `✅ **${entry.characterName}** is up to date.`
          : `✅ **${entry.characterName}** is on the roster (${total} of ${MAX_CHARACTERS} characters).`,
        ...profileCard(entry, note),
      };
    };

    // Fallback: the member supplied their own link, so no name search is needed.
    if (rawLink) {
      const link = parseProfileUrl(rawLink);
      const ref = link ? characterRef(link.url) : null;
      if (!link || !ref) {
        await interaction.reply({
          content:
            "That link isn't a character page. Leave **link** empty and Daeva will find you by name, " +
            "or paste a link from `aion2timers.com/armory` or `aion2.plaync.com/…/characters/…`.",
          ephemeral: true,
        });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply(await finish({ ...ref, name, level: null }));
      return;
    }

    const wait = lookupCooldown(userId);
    if (wait > 0) {
      await interaction.reply({ content: `One moment: you can search again in ${wait} seconds.`, ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const matches = await findCharacters(name, region, userId);

    if (matches === null) {
      await interaction.editReply({
        content:
          "The character search isn't responding right now. Try again in a few minutes, or run `/profile set` " +
          `with your character page link in **link** (find it via **Search players** at <${SITE}>).`,
      });
      return;
    }

    if (matches.length === 0) {
      await interaction.editReply({
        content:
          `No character called **${name}** was found. Check the spelling, or run \`/profile set\` with your ` +
          `character page link in **link** (find it via **Search players** at <${SITE}>).`,
      });
      return;
    }

    const toFound = (m: CharacterMatch): Found => ({
      serverId: m.serverId,
      characterId: m.characterId,
      region: m.region,
      name: m.name,
      level: m.level,
      race: m.race,
    });

    const only = matches.length === 1 ? matches[0] : undefined;
    if (only) {
      await interaction.editReply(await finish(toFound(only)));
      return;
    }

    // Same name on several servers: let the member choose.
    const options = matches.slice(0, 25);
    const customId = `profile-pick:${interaction.id}`;
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder("Choose your character")
      .addOptions(options.map((m, i) => ({ label: `${m.name} on ${m.serverName}`, description: describe(m), value: String(i) })));

    await interaction.editReply({
      content: `Found **${options.length}** characters called **${name}**. Which one is yours?`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });

    try {
      const message = await interaction.fetchReply();
      const pick = await message.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: PICK_TIMEOUT_MS,
        filter: (i) => i.user.id === userId && i.customId === customId,
      });
      const chosen = options[Number(pick.values[0])];
      await pick.deferUpdate();
      if (!chosen) {
        await interaction.editReply({ content: "That choice wasn't recognised. Run `/profile set` again.", components: [] });
        return;
      }
      await interaction.editReply(await finish(toFound(chosen)));
    } catch {
      await interaction.editReply({
        content: "No character was chosen. Run `/profile set` again when you're ready.",
        components: [],
      });
    }
  },
};

export default profileCommand;
