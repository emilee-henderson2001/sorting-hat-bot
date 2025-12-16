require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("hat")
    .setDescription("Manage the hat (names list)")
    .addSubcommand(sc =>
      sc.setName("set")
        .setDescription("Replace the hat with a comma-separated list of names")
        .addStringOption(o => o.setName("names").setDescription("e.g. Alice, Bob, Charlie").setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName("add")
        .setDescription("Add a single name to the hat")
        .addStringOption(o => o.setName("name").setDescription("Name to add").setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName("remove")
        .setDescription("Remove a single name from the hat")
        .addStringOption(o => o.setName("name").setDescription("Name to remove").setRequired(true))
    )
    .addSubcommand(sc =>
      sc.setName("list")
        .setDescription("List current hat names")
    ),

  new SlashCommandBuilder().setName("draw").setDescription("Draw a name from the hat (private)"),
  new SlashCommandBuilder().setName("redraw").setDescription("Put your current draw back and draw again (private)"),
  new SlashCommandBuilder().setName("keep").setDescription("Keep your current draw (finalize)"),
  new SlashCommandBuilder().setName("reset").setDescription("Admin: reset hat + pending draws"),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log("✅ Commands deployed");
})();
