const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    const empty = { guilds: {} };
    fs.writeFileSync(DATA_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function getGuild(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      hat: [],
      pendingByUser: {} // userId -> name
    };
  }
  return data.guilds[guildId];
}

module.exports = { loadData, saveData, getGuild };
