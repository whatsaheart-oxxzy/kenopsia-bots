'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const own = path.join(__dirname, '.env');
if (fs.existsSync(own)) process.loadEnvFile(own);
const parent = path.join(__dirname, '..', '.env');
if (fs.existsSync(parent)) process.loadEnvFile(parent);

const token = process.env.TAMEM_TOKEN;
const clientId = process.env.TAMEM_CLIENT_ID;
const guildId = process.env.GUILD_ID;

for (const [key, value] of Object.entries({ TAMEM_TOKEN: token, TAMEM_CLIENT_ID: clientId })) {
  if (!value) {
    console.error(`${key} is missing. Copy "Tamem/.env.example" to "Tamem/.env" and fill it in.`);
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
  .then((data) => console.log(`Registered ${data.length} Tamem command(s) ${guildId ? `to guild ${guildId}` : 'globally'}.`))
  .catch((err) => {
    console.error('Registration failed:', err);
    process.exit(1);
  });
