require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { loadData, saveData, getGuild } = require("./data");

// Party Planner role ID from Discord
const PARTY_PLANNER_ROLE_ID = "1353222780883177512";

// Extra admins by user ID (add IDs here if you want)
// We also treat username 'delnevodan' as an extra admin.
const EXTRA_ADMINS = [
  // "123456789012345678", // example – put real user IDs here if you want
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Pick random index (supports duplicates)
function randomIndex(arr) {
  return Math.floor(Math.random() * arr.length);
}

// Post a visible action log to the channel (for moderator visibility)
// Note: This still uses channel.send and may fail if the bot has no send permission.
// It's "nice to have", not required for the game to work.
async function announceAction(interaction, message) {
  try {
    await interaction.channel?.send(message);
  } catch (err) {
    console.error("Failed to announce action:", err);
  }
}

client.once("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) {
    return interaction.reply({ content: "Use these commands in a server.", ephemeral: true });
  }

  const data = loadData();
  const g = getGuild(data, interaction.guildId);

  // Helper: who counts as admin for hat/reset?
  const isPartyPlanner =
    interaction.member?.roles?.cache?.has(PARTY_PLANNER_ROLE_ID) ?? false;

  const isExtraAdmin =
    EXTRA_ADMINS.includes(interaction.user.id) ||
    interaction.user.username === "delnevodan";

  const hasManageServer =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;

  const isHatAdmin = hasManageServer || isPartyPlanner || isExtraAdmin;

  // =========================
  // /hat
  // =========================
  if (interaction.commandName === "hat") {
    const sub = interaction.options.getSubcommand();

    // Admin-only subcommands
    if (!isHatAdmin && (sub === "set" || sub === "remove" || sub === "list")) {
      return interaction.reply({
        content:
          "Only **Party Planner**, server admins, or approved admins can use that. You *can* use **/hat add** 🙂",
        ephemeral: true,
      });
    }

    if (sub === "set") {
      const namesRaw = interaction.options.getString("names");
      g.hat = namesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      g.pendingByUser = {};
      saveData(data);

      await announceAction(
        interaction,
        `🪄 ${interaction.user} reset the hat with **${g.hat.length}** entries.`
      );

      return interaction.reply({
        content: `✅ Hat set with **${g.hat.length}** entries.`,
        ephemeral: true,
      });
    }

    if (sub === "add") {
      console.log(
        `[${new Date().toISOString()}] ${interaction.user.tag} ran /${interaction.commandName} with`,
        interaction.options?.data ?? []
      );

      const name = interaction.options.getString("name").trim();
      if (!name) {
        return interaction.reply({ content: "Name can’t be empty.", ephemeral: true });
      }

      // Duplicates allowed
      g.hat.push(name);
      saveData(data);

      await announceAction(interaction, `➕ ${interaction.user} added an entry to the hat.`);

      return interaction.reply({
        content: `✅ Added **${name}** to the hat.`,
        ephemeral: true,
      });
    }

    if (sub === "remove") {
      const name = interaction.options.getString("name").trim();
      const index = g.hat.indexOf(name);

      if (index === -1) {
        return interaction.reply({
          content: `⚠️ **${name}** wasn’t found in the hat.`,
          ephemeral: true,
        });
      }

      // Remove ONE instance
      g.hat.splice(index, 1);

      // Clear pending if someone had it
      for (const [uid, pending] of Object.entries(g.pendingByUser)) {
        if (pending === name) delete g.pendingByUser[uid];
      }

      saveData(data);

      await announceAction(
        interaction,
        `➖ ${interaction.user} removed an entry from the hat.`
      );

      return interaction.reply({
        content: `✅ Removed one instance of **${name}**.`,
        ephemeral: true,
      });
    }

    if (sub === "list") {
      const list = g.hat.length ? g.hat.join(", ") : "(empty)";
      return interaction.reply({
        content: `🎩 Hat (${g.hat.length} entries): ${list}`,
        ephemeral: true,
      });
    }
  }

  // =========================
  // /draw
  // =========================
  if (interaction.commandName === "draw") {
    const userId = interaction.user.id;
    console.log(
      `[${new Date().toISOString()}] ${interaction.user.tag} ran /${interaction.commandName} with`,
      interaction.options?.data ?? []
    );

    if (g.pendingByUser[userId]) {
      return interaction.reply({
        content: `⚠️ You already drew **${g.pendingByUser[userId]}**.\nUse **/keep** or **/redraw** (in this channel).`,
        ephemeral: true,
      });
    }

    if (g.hat.length === 0) {
      return interaction.reply({ content: "🎩 The hat is empty.", ephemeral: true });
    }

    const index = randomIndex(g.hat);
    const pick = g.hat.splice(index, 1)[0];

    g.pendingByUser[userId] = pick;
    saveData(data);

    try {
      // DM the result
      await interaction.user.send(
        `🎩 Your draw: **${pick}**\nUse **/keep** to lock it in, or **/redraw** to swap.\n(Use these commands back in the server, not in DMs.)`
      );

      // Public reply in the channel
      await interaction.reply({
        content: `🎩 ${interaction.user} drew from the hat. Check your DMs, then do **/keep** or **/redraw** here in this channel.`,
        ephemeral: false,
      });
    } catch (err) {
      console.error("Failed to DM user draw result:", err);
      // Fallback: show result privately if DMs are blocked
      await interaction.reply({
        content: `🎩 ${interaction.user}, your draw: **${pick}**\nUse **/keep** or **/redraw** here in this channel.\n(Your DMs are closed, so I couldn’t message you.)`,
        ephemeral: true,
      });
    }
  }

  // =========================
  // /redraw
  // =========================
  if (interaction.commandName === "redraw") {
    console.log(
      `[${new Date().toISOString()}] ${interaction.user.tag} ran /${interaction.commandName} with`,
      interaction.options?.data ?? []
    );

    const userId = interaction.user.id;
    const current = g.pendingByUser[userId];

    if (!current) {
      return interaction.reply({
        content: "You don’t have a current draw. Use **/draw** first.",
        ephemeral: true,
      });
    }

    // Put back old draw
    g.hat.push(current);

    const index = randomIndex(g.hat);
    const pick = g.hat.splice(index, 1)[0];

    g.pendingByUser[userId] = pick;
    saveData(data);

    try {
      // DM the new result
      await interaction.user.send(
        `🔄 Redraw! New draw: **${pick}**\nUse **/keep** to lock it in, or **/redraw** again.\n(Use these commands back in the server, not in DMs.)`
      );

      // Public reply (visible to everyone)
      await interaction.reply({
        content: `🔄 ${interaction.user} redrew from the hat. Check your DMs, then do **/keep** or **/redraw** here in this channel.`,
        ephemeral: false,
      });
    } catch (err) {
      console.error("Failed to DM user redraw result:", err);
      // Fallback: private in-channel
      await interaction.reply({
        content: `🔄 ${interaction.user}, your new draw: **${pick}**\nUse **/keep** or **/redraw** here in this channel.\n(Your DMs are closed, so I couldn’t message you.)`,
        ephemeral: true,
      });
    }
  }

  // =========================
  // /keep
  // =========================
  if (interaction.commandName === "keep") {
    const userId = interaction.user.id;
    const current = g.pendingByUser[userId];

    if (!current) {
      return interaction.reply({
        content: "You don’t have a current draw. Use **/draw** first.",
        ephemeral: true,
      });
    }

    delete g.pendingByUser[userId];
    saveData(data);

    try {
      // DM confirmation
      await interaction.user.send(
        `✅ Kept: **${current}**\nThat entry is now permanently removed from the hat.`
      );

      // Public reply (everyone can see they locked in a draw)
      await interaction.reply({
        content: `✅ ${interaction.user} kept their draw.`,
        ephemeral: false,
      });
    } catch (err) {
      console.error("Failed to DM user keep result:", err);
      await interaction.reply({
        content: `✅ ${interaction.user} kept: **${current}**\n(Your DMs are closed, so I couldn’t message you.)`,
        ephemeral: true,
      });
    }
  }

  // =========================
  // /reset (admins only)
  // =========================
  if (interaction.commandName === "reset") {
    if (!isHatAdmin) {
      return interaction.reply({
        content: "You need **Party Planner**, **Manage Server**, or to be an approved admin to reset.",
        ephemeral: true,
      });
    }

    g.hat = [];
    g.pendingByUser = {};
    saveData(data);

    await announceAction(
      interaction,
      `🧹 ${interaction.user} reset the hat and cleared all pending draws.`
    );

    return interaction.reply({
      content: "🧹 Reset complete: hat cleared and pending draws cleared.",
      ephemeral: true,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);