'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, Options, Partials } = require('discord.js');
const db = require('./lib/db');
const markov = require('./lib/markov');
const settings = require('./lib/settings');
const rewards = require('./lib/rewards');
const clean = require('./lib/clean');
const { lockToGuild } = require('../lib/guild-lock');

/**
 * TAMEM — a Markov chain that learned to talk from this server.
 *
 * Sixth bot, same process as C.C, because it pays coins out of the shared
 * wallet. It is also the leanest of the six on purpose: the server has 2 GB and
 * this is the last thing going on it.
 *
 *   - no GuildMembers intent, so it never downloads the member list
 *   - no message cache, because it reads each message once and is done
 *   - the word model lives in SQLite on disk, not in memory
 */

const TICK_MS = 60 * 60_000; // cleanup runs hourly, acts daily

// Rate limits. These are backstops, not settings — a chat bot that can be made
// to flood a channel is a chat bot that gets removed from the server.
const PER_CHANNEL_PER_MIN = 3;
const SERVER_PER_MIN = 10;

const recent = []; // timestamps of everything Tamem said, server-wide
const lastSpoke = new Map(); // channelId -> timestamp

function allowedToSpeak(channelId, { mentioned }) {
  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();

  if (recent.length >= SERVER_PER_MIN) return false;
  if (recent.filter((r) => r.channel === channelId).length >= PER_CHANNEL_PER_MIN) return false;

  // Being spoken to directly skips the politeness delay but never the limits
  // above. The spec asked for mentions to ignore the cooldown; ignoring the
  // rate limit as well would let one person turn Tamem into a firehose.
  if (mentioned) return true;

  const cooldown = settings.get('cooldown_seconds') * 1000;
  return now - (lastSpoke.get(channelId) ?? 0) >= cooldown;
}

function noteSpoken(channelId) {
  const now = Date.now();
  recent.push({ at: now, channel: channelId });
  lastSpoke.set(channelId, now);
}

function loadCommands() {
  const commands = new Collection();
  const dir = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    if (command?.data && command?.execute) commands.set(command.data.name, command);
  }
  return commands;
}

/** Learns, then decides whether to say anything back. */
async function onMessage(message, client) {
  if (!message.guild || message.author.id === client.user.id) return;

  const config = settings.all();
  if (clean.rejects(message, config)) return;

  const channel = settings.channel(message.channelId);
  if (!channel.enabled) return;

  // One gate for everything. Tamem only reads the people the owner approved,
  // so nobody's words end up in a bot that repeats them without someone having
  // decided that was alright. Everyone else in the channel is invisible to him.
  if (!settings.canUse(message.member)) return;

  // --- learning ---
  if (config.learning_enabled && Math.random() * 100 < config.learning_chance) {
    try {
      const learned = markov.learn(message.content, message.author.id);
      if (learned) markov.log(message.author.id, message.channelId, learned + 1);
    } catch (err) {
      console.error('Tamem failed to learn:', err.message);
    }
  }

  // --- replying ---
  const mentioned =
    message.mentions.users.has(client.user.id) || /\btamem\b/i.test(message.content);
  if (!mentioned && Math.random() * 100 >= channel.chance) return;
  if (!allowedToSpeak(message.channelId, { mentioned })) return;

  const out = mentioned ? markov.replyTo(message.content) : markov.generate();
  if (!out.ok) return;

  noteSpoken(message.channelId);

  // allowedMentions is the important bit: Tamem rebuilds sentences out of what
  // people typed, so without this a learned "@everyone" could go out for real.
  const sent = await message
    .reply({ content: out.text, allowedMentions: { parse: [] } })
    .catch(() => null);
  if (!sent) return;

  try {
    const note = await rewards.onReply(message.member);
    if (note) await message.channel.send({ content: `*${note}*`, allowedMentions: { parse: [] } }).catch(() => {});
  } catch (err) {
    console.error('Tamem reward failed:', err.message);
  }
}

/** Hourly: prunes the log, and the model itself if the file is getting big. */
let lastCleanup = 0;
function tick() {
  const hours = settings.get('auto_cleanup_interval_hours');
  if (Date.now() - lastCleanup < hours * 3_600_000) return;
  lastCleanup = Date.now();
  try {
    const result = markov.cleanup();
    if (result.pruned) {
      console.log(`Tamem pruned its memory: ${Math.round(result.before / 1e6)}MB -> ${Math.round(result.after / 1e6)}MB`);
    }
  } catch (err) {
    console.error('Tamem cleanup failed:', err.message);
  }
}

function startTamemBot(token) {
  db.open(); // fail loudly here rather than on the first message

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // Privileged. Switch on "Message Content Intent" for Tamem's application
      // in the developer portal or it will never learn a single word.
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
    // Tamem reads a message once and is finished with it. Keeping the last 200
    // per channel in memory, as discord.js does by default, would be the single
    // biggest thing it holds — for nothing.
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 0,
      PresenceManager: 0,
      ReactionManager: 0,
      GuildStickerManager: 0,
      GuildScheduledEventManager: 0,
    }),
    sweepers: {
      ...Options.DefaultSweeperSettings,
      messages: { interval: 300, lifetime: 60 },
    },
  });

  client.commands = loadCommands();
  const lock = lockToGuild(client, process.env.GUILD_ID, 'TAMEM');

  client.once(Events.ClientReady, (c) => {
    const { words, pairs } = markov.stats();
    console.log(`Tamem online as ${c.user.tag} — ${words} words, ${pairs} pairs, ${client.commands.size} commands.`);
    const timer = setInterval(tick, TICK_MS);
    timer.unref?.();
  });

  client.on(Events.MessageCreate, (message) => {
    if (!lock.isAllowed(message.guildId)) return;
    onMessage(message, client).catch((err) => console.error('Tamem message handling failed:', err));
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!lock.isAllowed(interaction.guildId)) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Tamem command /${interaction.commandName} failed:`, err);
      const payload = { content: 'I forgot how to remember things. Tell an admin.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => db.close());
  }

  // login() returns a promise. A bad token rejects it, and an unhandled
  // rejection takes the whole Node process down — which in this repo means C.C,
  // SUZAKU, SHIRLEY and KALLEN all go offline because one chat bot had a typo
  // in its token. The try/catch around startTamemBot() in index.js cannot see
  // this: it is asynchronous. So it is caught here, where it happens.
  client.login(token).catch((err) => {
    console.error(
      [
        `Tamem could not log in: ${err.message}`,
        err.code === 'TokenInvalid'
          ? 'TAMEM_TOKEN is not a valid bot token. Check the server .env for a truncated value, stray quotes, a line break, or the application ID pasted in by mistake. Reset the token in the developer portal if in doubt.'
          : '',
        'Everything else keeps running.',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  });

  return client;
}

module.exports = { startTamemBot, tick, allowedToSpeak, noteSpoken };
