'use strict';

const { Events } = require('discord.js');
const argue = require('./argue');
const colors = require('./colors');
const commandOnly = require('./command-only');
const community = require('./community');
const economy = require('./economy');
const quests = require('./quests');
const schedule = require('./schedule');
const store = require('./store');

const isStaff = (member) =>
  member?.roles.cache.some((r) => r.name === 'Moderator' || r.name === 'Administrator') ?? false;

/**
 * Level ups and quest payouts go to their own read-only channel. They are the
 * bot talking about you, not you talking — that does not belong in the middle
 * of a conversation. Dropped when the channel is missing, never redirected.
 */
async function badge(guild, text) {
  const channel = guild.channels.cache.find((c) => c.name === CHANNELS.levelUps && c.isTextBased());
  if (channel) await channel.send(text).catch(() => {});
}

/** Pays out finished quests and posts only when someone clears a whole set. */
async function settleQuests(guild, userId) {
  const result = await quests.checkAndAward(guild, userId);
  if (!result.bonus) return;

  const label = result.bonus === 'daily' ? 'all five daily quests' : 'all four weekly quests';
  await badge(guild, `<@${userId}> finished ${label}. That is ${result.coins} coins today.`);
}

function registerKenopsia(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    try {
      // Before anything is counted. A message that gets removed must not pay
      // coins, xp or quest progress on its way out.
      if (await commandOnly.enforce(message)) return;

      // A dispute room resets its own clock and pays nothing. It is a private
      // channel handed to two people — paying coins there would make "ask a mod
      // to open a room" the quietest way to farm in the server.
      if (argue.touch(message)) return;

      schedule.bumpToday(message.guild.id, 'messages');
      const levelUp = await economy.onMessage(message);
      if (levelUp) await badge(message.guild, levelUp.text);
      await settleQuests(message.guild, message.author.id);
    } catch (err) {
      console.error('Message handling failed:', err);
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      const { guild, author } = reaction.message;
      if (!guild || !author) return;

      economy.onReactionGiven(guild.id, user.id);
      await settleQuests(guild, user.id);

      if (author.bot || author.id === user.id) return;
      const giver = await guild.members.fetch(user.id).catch(() => null);
      economy.onReactionReceived(guild.id, author.id, isStaff(giver));
    } catch (err) {
      console.error('Reaction handling failed:', err);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      schedule.bumpToday(member.guild.id, 'joins');
      await community.onJoin(member);
    } catch (err) {
      console.error('Join handling failed:', err);
    }
  });

  client.on(Events.GuildMemberUpdate, async (before, after) => {
    if (before.premiumSince !== after.premiumSince) {
      await community.syncBooster(after).catch(() => {});
    }

    // The verify bot grants and removes Roblox Verified; we react to it.
    const had = before.roles.cache.some((r) => r.name === 'Roblox Verified');
    const has = after.roles.cache.some((r) => r.name === 'Roblox Verified');
    if (had !== has) await economy.syncTrader(after).catch(() => {});
  });

  client.on(Events.VoiceStateUpdate, async (before, after) => {
    try {
      await community.onVoice(before, after);
    } catch (err) {
      console.error('Voice handling failed:', err);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!colors.isColorButton(interaction)) return;
    try {
      await colors.handle(interaction);
    } catch (err) {
      console.error('Color pick failed:', err);
      await interaction.reply({ content: 'That did not work. Tell a mod.', ephemeral: true }).catch(() => {});
    }
  });

  // Invite counters only mean something if the cache is current.
  for (const event of [Events.InviteCreate, Events.InviteDelete]) {
    client.on(event, (invite) => community.cacheInvites(invite.guild).catch(() => {}));
  }

  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) {
      // A full member fetch fills role.members and displayName lookups, and
      // lets the New Member reconciliation see everyone.
      await guild.members.fetch().catch(() => {});
      await community.cacheInvites(guild);
    }
    schedule.start(client);
    // Clears any dispute room that expired while the bot was offline.
    argue.start(client);
    console.log('Kenopsia runtime active — quests, coins, levels and moderation are live.');
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      store.flush();
      process.exit(0);
    });
  }
}

module.exports = { registerKenopsia };
