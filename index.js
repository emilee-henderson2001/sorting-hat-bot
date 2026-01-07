require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { loadData, saveData, getGuild } = require("./data");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Pick random index (supports duplicates)
function randomIndex(arr) {
  return Math.floor(Math.random() * arr.length);
}

// Post a visible action log to the channel (for moderator visibility)
async function announceAction(interaction, message) {
  try {
    await interaction.channel?.send(message);
  } catch (err) {
    console.error("Failed to announce action:", err);
  }
}

// Private response in-channel (ephemeral) and DM backup
async function privateSend(interaction, content) {
  await interaction.reply({ content, ephemeral: true });
  try {
    await interaction.user.send(content);
  } catch {
    // DM blocked; ephemeral already sent
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

  // =========================
  // /hat
  // =========================
  if (interaction.commandName === "hat") {
    const sub = interaction.options.getSubcommand();

    // Party Planners role OR Manage Server permission
    const canManage =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.member?.roles?.cache?.some(r => r.name === "Party Planner");

    // Admin-only commands
    if (!canManage && (sub === "set" || sub === "remove" || sub === "list")) {
      return interaction.reply({
        content: "Only **Party Planners** or server admins can use that. You *can* use **/hat add** 🙂",
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
        content: `⚠️ You already drew **${g.pendingByUser[userId]}**.\nUse **/keep** or **/redraw**.`,
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

    await announceAction(interaction, `🎩 ${interaction.user} drew from the hat.`);

    return privateSend(
      interaction,
      `🎩 Your draw: **${pick}**\nUse **/keep** to lock it in, or **/redraw** to swap.`
    );
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

    // put back old draw
    g.hat.push(current);

    const index = randomIndex(g.hat);
    const pick = g.hat.splice(index, 1)[0];

    g.pendingByUser[userId] = pick;
    saveData(data);

    await announceAction(interaction, `🔄 ${interaction.user} redrew from the hat.`);

    return privateSend(
      interaction,
      `🔄 Redraw! New draw: **${pick}**\n`
    );
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

    await announceAction(interaction, `✅ ${interaction.user} kept their draw.`);

    return privateSend(
      interaction,
      `✅ Kept: **${current}**\nThat entry is now permanently removed from the hat.`
    );
  }

  // =========================
  // /reset (admins only)
  // =========================
  if (interaction.commandName === "reset") {
    const canManage =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.member?.roles?.cache?.some(r => r.name === "Party Planner");

    if (!canManage) {
      return interaction.reply({
        content: "You need **Party Planners** or **Manage Server** to reset.",
        ephemeral: true,
      });
    }

    g.hat = [];
    g.pendingByUser = {};
    saveData(data);

    return interaction.reply({
      content: "🧹 Reset complete: hat cleared and pending draws cleared.",
      ephemeral: true,
    });
  }
});

client.login(process.env.DISCORD_TOKEN);