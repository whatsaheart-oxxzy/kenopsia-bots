'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const roblox = require('./lib/roblox');
const store = require('./lib/store');
const { lockToGuild } = require('../lib/guild-lock');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const token = process.env.VERIFY_TOKEN;
if (!token) {
  console.error('VERIFY_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// No privileged intents: this bot reads no message content and no member list.
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.commands = new Collection();
const lock = lockToGuild(client, process.env.GUILD_ID, 'LELOUCH');

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (c) => {
  console.log(`Roblox verify bot online as ${c.user.tag} — ${client.commands.size} commands.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!lock.isAllowed(interaction.guildId)) return;
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('verify:')) {
      await client.commands.get('verify').handleButton(interaction);
    }
  } catch (err) {
    console.error(`Interaction ${interaction.commandName ?? interaction.customId} failed:`, err);
    const payload = { content: 'That did not work. Try again in a moment.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// In the marketplace the Roblox name is the whole point of verifying, so it is
// shown under a trade post. Same in looking-for-play, where people are trying to
// find each other in game. Those two channels are exactly what /verify promises
// in roblox-verify/commands/verify.js — nowhere else.
// One line, once per member per ten minutes, per channel.
const SHOW_IN = new Set(['marketplace', 'looking-for-play']);
const lastShown = new Map();

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !SHOW_IN.has(message.channel.name)) return;
  if (!lock.isAllowed(message.guildId)) return;

  // Keyed per channel, so posting a trade and then looking for people does not
  // swallow the second line.
  const key = `${message.guildId}:${message.channelId}:${message.author.id}`;
  if (Date.now() - (lastShown.get(key) ?? 0) < 10 * 60_000) return;

  const link = store.getLink(message.guildId, message.author.id);
  if (!link) return;
  lastShown.set(key, Date.now());

  await message
    .reply({
      content: `Verified Roblox account: **${link.robloxName}** — <${roblox.profileUrl(link.robloxId)}>`,
      allowedMentions: { repliedUser: false },
    })
    .catch(() => {});
});

// LELOUCH is alone in its container, so a bad token means there is nothing to
// keep alive — but it should say so rather than print a stack trace.
client.login(token).catch((err) => {
  console.error(`LELOUCH could not log in: ${err.message}`);
  if (err.code === 'TokenInvalid') {
    console.error('VERIFY_TOKEN is not a valid bot token. Check .env for a truncated value, stray quotes or a line break.');
  }
  process.exit(1);
});
