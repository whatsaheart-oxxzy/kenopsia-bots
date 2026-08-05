'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

// KALLEN's own token and application id, the shared server id.
const own = path.join(__dirname, '.env');
if (fs.existsSync(own)) process.loadEnvFile(own);
const parent = path.join(__dirname, '..', '.env');
if (fs.existsSync(parent)) process.loadEnvFile(parent);

const token = process.env.SHOP_TOKEN;
const clientId = process.env.SHOP_CLIENT_ID;
const guildId = process.env.GUILD_ID;

for (const [key, value] of Object.entries({ SHOP_TOKEN: token, SHOP_CLIENT_ID: clientId })) {
  if (!value) {
    console.error(`${key} is missing. Copy "Shop Bot/.env.example" to "Shop Bot/.env" and fill it in.`);
    process.exit(1);
  }
}

const dir = path.join(__dirname, 'commands');
const commands = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => require(path.join(dir, f)).data.toJSON());

const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

new REST()
  .setToken(token)
  .put(route, { body: commands })
  .then((data) => console.log(`Registered ${data.length} KALLEN commands ${guildId ? `to guild ${guildId}` : 'globally'}.`))
  .catch((err) => {
    console.error('Registration failed:', err);
    process.exit(1);
  });
