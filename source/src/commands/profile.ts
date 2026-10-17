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
  characterRef,
  getRosterEntry,
  isValidCharacterName,
  officialProfileUrl,
  parseProfileUrl,
  removeRosterEntry,
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
import { displayLegion, isLegionMember, legionLine, syncRoles } from "../services/legion.js";
import type { Command } from "./types.js";

const SITE = "https://aion2.bajubesi.org/#players";
const PICK_TIMEOUT_MS = 60_000;
const FACTION: Record<number, string> = { 1: "Elyos", 2: "Asmodian" };

type Found = { serverId: number; characterId: string; region: string; name: string; level: number | null };

function describe(m: CharacterMatch): string {
  const parts = [m.serverName];
  if (m.level != null) parts.push(`level ${m.level}`);
  const faction = m.race != null ? FACTION[m.race] : undefined;
  if (faction) parts.push(faction);
  return parts.join(", ");
}

const formatNum = (n: number | null) => (n != null ? n.toLocaleString("en-US") : "–");

/** A profile card: portrait, details as fields, and link buttons. */
function profileCard(e: RosterEntry, note?: string) {
  const ours = isLegionMember(e.legion);
  const embed = new EmbedBuilder()
    .setColor(ours ? 0x5fd3c4 : 0x8b939e)
    .setTitle(e.characterName)
    .setURL(e.profileUrl)
    .addFields(
      { name: "Class", value: e.className, inline: true },
      { name: "Level", value: formatNum(e.level), inline: true },
      { name: "Server", value: serverName(e.serverId), inline: true },
      { name: "Combat power", value: formatNum(e.combatPower), inline: true },
      { name: "Item level", value: formatNum(e.itemLevel), inline: true },
      { name: "Legion", value: e.legion ? `${displayLegion(e.legion)}${ours ? " ✓" : ""}` : "–", inline: true },
    )
    .setFooter({ text: "Bajubesi Network legion roster · last updated" })
    .setTimestamp(new Date(e.updatedAt));
  if (note) embed.setDescription(note);
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
    .setDescription("Add your AION 2 character to the legion roster on aion2.bajubesi.org")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Add or refresh your character on the roster")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Your character name").setRequired(true).setMinLength(2).setMaxLength(24),
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
    .addSubcommand((sub) => sub.setName("show").setDescription("Show your roster entry"))
    .addSubcommand((sub) => sub.setName("remove").setDescription("Remove your character from the roster")),

  async execute(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: "Use this command in the server.", ephemeral: true });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === "show") {
      const e = getRosterEntry(guildId, userId);
      if (!e) {
        await interaction.reply({ content: "You're not on the roster yet. Add yourself with `/profile set`.", ephemeral: true });
        return;
      }
      await interaction.reply({ ...profileCard(e), ephemeral: true });
      return;
    }

    if (sub === "remove") {
      const removed = removeRosterEntry(guildId, userId);
      if (removed && interaction.guild) await syncRoles(interaction.guild, userId, null, false);
      await interaction.reply({
        content: removed ? "Removed. Your character no longer appears on the roster." : "You weren't on the roster.",
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
      const info = await fetchCharacterInfo(found.serverId, found.characterId, found.region);
      const previous = getRosterEntry(guildId, userId);
      const entry = upsertRosterEntry({
        guildId,
        userId,
        characterName: info?.name ?? found.name,
        className: info?.className ?? "Unknown",
        serverId: found.serverId,
        region: found.region,
        profileUrl: officialProfileUrl(found.serverId, found.characterId, found.region),
        level: info?.level ?? found.level,
        combatPower: info?.combatPower ?? null,
        itemLevel: info?.itemLevel ?? null,
        legion: info?.legion ?? null,
        imageUrl: info?.imageUrl ?? null,
      });
      const roles = interaction.guild
        ? await syncRoles(interaction.guild, userId, entry.legion, true)
        : ({ legion: "not-configured", player: "not-configured" } as const);
      const note = info
        ? legionLine(entry.legion, roles)
        : "Couldn't read your official details just now; they'll fill in during the daily refresh.";
      return {
        content: previous ? "✅ Your roster entry is up to date." : "✅ You're on the roster.",
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
