'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const pets = require('./lib/pets');
const store = require('./lib/store');
const notify = require('./lib/notify');
const wallet = require('./lib/wallet');
const { lockToGuild } = require('../lib/guild-lock');
const { isGuardedChannel } = require('../lib/kenopsia/command-only');
const { isRoom: isArgueRoom } = require('../lib/kenopsia/argue');

// Daily ceilings, so a pet cannot be maxed out by spamming the chat.
const CAP_HAPPINESS = 20;
const CAP_XP = 20;
const CAP_REACTION_HAPPINESS = 10;
const VOICE_BLOCK_MS = 30 * 60_000;
const SWEEP_MS = 10 * 60_000;

const voiceSince = new Map(); // `${guildId}:${userId}` -> timestamp

function loadCommands() {
  const commands = new Collection();
  const dir = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    if (command?.data && command?.execute) commands.set(command.data.name, command);
  }
  return commands;
}

/** Chat keeps a pet alive: a little happiness, a little xp, both capped. */
function onChat(guildId, userId) {
  const pet = store.getPet(guildId, userId);
  if (!pet) return;

  pets.touch(store.rollDay(pet));
  pet.lastActive = Date.now();
  pet.daily.messages += 1;

  const cap = pet.type === 'cat' ? Math.round(CAP_HAPPINESS * 1.1) : CAP_HAPPINESS;
  if (pet.daily.happiness < cap) {
    pet.daily.happiness += 1;
    pet.happiness = pets.clamp(pet.happiness + 1);
  }

  if (pet.daily.messages % 5 === 0 && pet.daily.xp < CAP_XP) {
    pet.daily.xp += 1;
    pets.addXp(pet, 1, 'chat');
  }
  store.save();
}

function onReaction(guildId, authorId) {
  const pet = store.getPet(guildId, authorId);
  if (!pet) return;

  pets.touch(store.rollDay(pet));
  if (pet.daily.reactions < CAP_REACTION_HAPPINESS) {
    pet.daily.reactions += 1;
    pet.happiness = pets.clamp(pet.happiness + 1);
    // A fox turns attention into money.
    if (pet.type === 'fox') wallet.earn(guildId, authorId, 1);
  }
  store.save();
}

/** Pays out every finished half hour of voice time. */
function settleVoice(guildId, userId, now = Date.now()) {
  const key = `${guildId}:${userId}`;
  const since = voiceSince.get(key);
  if (!since) return;

  const blocks = Math.floor((now - since) / VOICE_BLOCK_MS);
  if (blocks <= 0) return;
  voiceSince.set(key, since + blocks * VOICE_BLOCK_MS);

  const pet = store.getPet(guildId, userId);
  if (!pet) return;

  pets.touch(store.rollDay(pet));
  pet.lastActive = now;
  pet.happiness = pets.clamp(pet.happiness + 5 * blocks);
  if (pet.type === 'dog') pet.energy = pets.clamp(pet.energy + 10 * blocks);
  pets.addXp(pet, 10 * blocks, 'voice');
  store.save();
}

/** Walks every pet, applies decay and sends the warnings that came due. */
async function sweep(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const pet of Object.values(store.allPets(guild.id))) {
      const events = pets.touch(store.rollDay(pet));
      if (!events.length) continue;

      await notify.handleEvents(client, guild, pet, events);
      if (pet.gone) {
        const member = await guild.members.fetch(pet.owner).catch(() => null);
        if (member) await notify.syncRoles(member, null);
      }
    }
    settleAllVoice(guild.id);
  }
  store.save();
}

function settleAllVoice(guildId) {
  for (const key of voiceSince.keys()) {
    if (key.startsWith(`${guildId}:`)) settleVoice(guildId, key.split(':')[1]);
  }
}

/**
 * Suzaku is its own bot with its own token, but it runs inside the C.C process
 * on purpose: the coin wallet is a single file, and a second process writing it
 * would eventually lose data.
 */
function startPetBot(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [require('discord.js').Partials.Message, require('discord.js').Partials.Reaction],
  });

  client.commands = loadCommands();
  const lock = lockToGuild(client, process.env.GUILD_ID, 'SUZAKU');

  client.once(Events.ClientReady, (c) => {
    console.log(`Pet bot online as ${c.user.tag} — ${client.commands.size} commands.`);
    sweep(client).catch((err) => console.error('Pet sweep failed:', err));
    const timer = setInterval(() => sweep(client).catch((err) => console.error('Pet sweep failed:', err)), SWEEP_MS);
    timer.unref?.();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!lock.isAllowed(interaction.guildId)) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Pet command /${interaction.commandName} failed:`, err);
      const payload = { content: 'Something went wrong. Try again in a moment.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.guild || message.author.bot || !lock.isAllowed(message.guildId)) return;
    // Suzaku is a separate Discord client and sees the message independently of
    // C.C's support guard, so it has to make the same call itself. Otherwise a
    // channel where everything is deleted becomes the quietest place to farm
    // pet happiness and xp.
    if (isGuardedChannel(message.channel) || isArgueRoom(message.guildId, message.channelId)) return;
    try {
      onChat(message.guildId, message.author.id);
    } catch (err) {
      console.error('Pet chat handling failed:', err);
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      const author = reaction.message.author;
      if (!reaction.message.guild || !author || author.bot || author.id === user.id) return;
      if (!lock.isAllowed(reaction.message.guildId)) return;
      onReaction(reaction.message.guildId, author.id);
    } catch (err) {
      console.error('Pet reaction handling failed:', err);
    }
  });

  client.on(Events.VoiceStateUpdate, (before, after) => {
    const guildId = (after.guild ?? before.guild).id;
    const userId = after.id;
    const key = `${guildId}:${userId}`;

    if (!lock.isAllowed(guildId)) return;
    if (before.channelId === after.channelId) return;
    if (before.channelId) {
      settleVoice(guildId, userId);
      voiceSince.delete(key);
    }
    if (after.channelId && after.channelId !== after.guild.afkChannelId) {
      voiceSince.set(key, Date.now());
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => store.flush());
  }

  // See the note in "Tamem/client.js": an unhandled login rejection would end
  // the process and take every bot sharing it offline.
  client.login(token).catch((err) => {
    console.error(`SUZAKU could not log in: ${err.message}. Check PET_TOKEN. Everything else keeps running.`);
  });

  return client;
}

module.exports = { startPetBot };
