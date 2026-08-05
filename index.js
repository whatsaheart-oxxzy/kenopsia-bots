'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, Partials } = require('discord.js');
const { registerKenopsia } = require('./lib/kenopsia/runtime');
const { lockToGuild } = require('./lib/guild-lock');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Privileged — enable both under Bot > Privileged Gateway Intents.
    GatewayIntentBits.GuildMembers, // onboarding, level roles, booster role
    GatewayIntentBits.MessageContent, // attachments, for the media quest
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates, // voice coins and temporary rooms
    GatewayIntentBits.GuildInvites, // who invited whom
  ],
  // Reactions on messages sent before the bot started arrive as partials.
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});
client.commands = new Collection();

// Wired before the command loader so a foreign server is refused first.
const lock = lockToGuild(client, process.env.GUILD_ID, 'C.C');

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[warn] commands/${file} has no "data" or "execute" export — skipped.`);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} — ${client.commands.size} commands loaded.`);
});

// Levels, coins, quests, onboarding, voice rooms and the scheduler.
registerKenopsia(client);

// Suzaku, the pet bot. Its own Discord application and its own name, but the
// same process: it spends Kenopsia coins, and one file needs one writer.
const petEnv = path.join(__dirname, 'Virtual Pet', '.env');
if (fs.existsSync(petEnv)) process.loadEnvFile(petEnv);
if (process.env.PET_TOKEN) {
  require('./Virtual Pet/client').startPetBot(process.env.PET_TOKEN);
} else {
  console.log('Pet bot skipped — no PET_TOKEN in "Virtual Pet/.env".');
}

// The voice bot. Same arrangement: own application, shared process, because it
// pays out of the same wallet.
const voiceEnv = path.join(__dirname, 'Voice Bot', '.env');
if (fs.existsSync(voiceEnv)) process.loadEnvFile(voiceEnv);
if (process.env.VOICE_TOKEN) {
  require('./Voice Bot/client').startVoiceBot(process.env.VOICE_TOKEN);
} else {
  console.log('Voice bot skipped — no VOICE_TOKEN in "Voice Bot/.env".');
}

// KALLEN, the shop. Same arrangement again: its own application, this process,
// because every price it charges comes out of the one shared wallet.
const shopEnv = path.join(__dirname, 'Shop Bot', '.env');
if (fs.existsSync(shopEnv)) process.loadEnvFile(shopEnv);
if (process.env.SHOP_TOKEN) {
  require('./Shop Bot/client').startShopBot(process.env.SHOP_TOKEN);
} else {
  console.log('Shop bot skipped — no SHOP_TOKEN in "Shop Bot/.env".');
}

// TAMEM, the Markov chat bot. Same process again — it pays coins for talking to
// it. Wrapped, unlike the others, because it is the only bot here that opens a
// database at startup: if node:sqlite or the file were unavailable this would
// throw, and taking C.C down with it would stop the whole server's economy over
// a chat toy.
const tamemEnv = path.join(__dirname, 'Tamem', '.env');
if (fs.existsSync(tamemEnv)) process.loadEnvFile(tamemEnv);
if (process.env.TAMEM_TOKEN) {
  try {
    require('./Tamem/client').startTamemBot(process.env.TAMEM_TOKEN);
  } catch (err) {
    console.error('Tamem failed to start, everything else is unaffected:', err.message);
  }
} else {
  console.log('Tamem skipped — no TAMEM_TOKEN in "Tamem/.env".');
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!lock.isAllowed(interaction.guildId)) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Command /${interaction.commandName} failed:`, err);
    const payload = { content: `Command failed: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.login(token);
