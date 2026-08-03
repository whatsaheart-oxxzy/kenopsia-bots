'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const { DISCORD_TOKEN: token, CLIENT_ID: clientId, GUILD_ID: guildId } = process.env;

for (const [key, value] of Object.entries({ DISCORD_TOKEN: token, CLIENT_ID: clientId })) {
  if (!value) {
    console.error(`${key} is missing. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

const commandsPath = path.join(__dirname, 'commands');
const commands = fs
  .readdirSync(commandsPath)
  .filter((f) => f.endsWith('.js'))
  .map((f) => require(path.join(commandsPath, f)).data.toJSON());

const rest = new REST().setToken(token);

// Guild-scoped commands appear instantly; global ones can take up to an hour.
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

rest
  .put(route, { body: commands })
  .then((data) =>
    console.log(
      `Registered ${data.length} commands ${guildId ? `to guild ${guildId}` : 'globally'}.`,
    ),
  )
  .catch((err) => {
    console.error('Registration failed:', err);
    process.exit(1);
  });
