'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const config = require('./lib/config');
const leaderboard = require('./lib/leaderboard');
const store = require('./lib/store');
const voice = require('./lib/voice');
const { lockToGuild } = require('../lib/guild-lock');

const SCHEDULE_MS = 60_000;

function loadCommands() {
  const commands = new Collection();
  const dir = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    if (command?.data && command?.execute) commands.set(command.data.name, command);
  }
  return commands;
}

async function post(guild, text) {
  const channel = guild.channels.cache.find((c) => c.name === config.CHANNELS.log && c.isTextBased());
  if (channel && text) await channel.send(text).catch(() => {});
}

/**
 * Period payouts run at 23:59 UTC, not at 00:00. The counters roll over on the
 * calendar key, so paying a minute before midnight is the only way to be sure
 * the numbers being paid are the ones people actually earned.
 */
async function schedule(client) {
  const now = new Date();
  if (now.getUTCHours() !== 23 || now.getUTCMinutes() < 59) return;

  const day = store.dayKey(now);
  const week = store.weekKey(now);
  const month = store.monthKey(now);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  const lastOfMonth = tomorrow.getUTCMonth() !== now.getUTCMonth();

  for (const guild of client.guilds.cache.values()) {
    const state = store.state(guild.id);

    try {
      await leaderboard.expireTitles(guild);

      if (state.lastDaily !== day) {
        state.lastDaily = day;
        await post(guild, await leaderboard.payout(guild, 'daily'));
      }
      if (now.getUTCDay() === 0 && state.lastWeekly !== week) {
        state.lastWeekly = week;
        await post(guild, await leaderboard.payout(guild, 'weekly'));
      }
      if (lastOfMonth && state.lastMonthly !== month) {
        state.lastMonthly = month;
        await post(guild, await leaderboard.payout(guild, 'monthly'));
      }
      store.save();
    } catch (err) {
      console.error(`Voice schedule failed for ${guild.name}:`, err);
    }
  }
}

/** Anyone already sitting in voice when the bot starts is picked up again. */
function restoreSessions(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.filter((c) => c.isVoiceBased()).values()) {
      for (const member of channel.members.values()) {
        if (!member.user.bot) voice.start(guild.id, member.id, channel.name);
      }
    }
  }
}

function startVoiceBot(token) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
  });

  client.commands = loadCommands();
  const lock = lockToGuild(client, process.env.GUILD_ID, 'VoiceBot');

  client.once(Events.ClientReady, async (c) => {
    console.log(`Voice bot online as ${c.user.tag} — ${client.commands.size} commands.`);
    for (const guild of client.guilds.cache.values()) await guild.members.fetch().catch(() => {});

    restoreSessions(client);

    const ticker = setInterval(
      () => voice.tick(client).catch((err) => console.error('Voice tick failed:', err)),
      voice.TICK_MS,
    );
    const scheduler = setInterval(
      () => schedule(client).catch((err) => console.error('Voice schedule failed:', err)),
      SCHEDULE_MS,
    );
    ticker.unref?.();
    scheduler.unref?.();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!lock.isAllowed(interaction.guildId)) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Voice command /${interaction.commandName} failed:`, err);
      const payload = { content: 'Something went wrong. Try again in a moment.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });

  client.on(Events.VoiceStateUpdate, (before, after) => {
    const guild = after.guild ?? before.guild;
    if (after.member?.user.bot || !lock.isAllowed(guild.id)) return;

    if (after.channelId && after.channelId !== before.channelId) {
      voice.start(guild.id, after.id, after.channel.name);
    } else if (!after.channelId && before.channelId) {
      voice.stop(guild.id, after.id);
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => store.flush());
  }

  client.login(token);
  return client;
}

module.exports = { startVoiceBot };
