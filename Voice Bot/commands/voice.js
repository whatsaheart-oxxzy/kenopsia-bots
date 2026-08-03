'use strict';

const { SlashCommandBuilder } = require('discord.js');
const config = require('../lib/config');
const store = require('../lib/store');
const voice = require('../lib/voice');
const kenopsia = require('../../lib/kenopsia/store');

const hours = (seconds) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Your voice time, coins and rank')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Someone else. Default: you')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const record = store.roll(store.member(interaction.guildId, user.id));
    const session = voice.activeSession(interaction.guildId, user.id);

    let role = null;
    for (const r of config.VOICE_ROLES) if (record.lifetime >= r.at) role = r;
    const next = config.VOICE_ROLES.find((r) => r.at > record.lifetime);

    await interaction.reply({
      content: [
        `# Voice — ${user.displayName ?? user.username}`,
        '',
        `Time in voice: **${hours(record.seconds)}** across ${record.sessions} sessions`,
        `Coins from voice: **${record.lifetime}** total · **${record.daily}** today · **${record.weekly}** this week`,
        `Rank this week: **#${store.rankOf(interaction.guildId, user.id, 'weekly') || '-'}** · all time: **#${store.rankOf(interaction.guildId, user.id, 'lifetime') || '-'}**`,
        `Best streak: **${record.bestStreak} minutes**`,
        role ? `Role: **${role.name}**` : '',
        next ? `Next role: **${next.name}** at ${next.at} voice coins.` : 'Highest voice role reached.',
        '',
        session
          ? `Right now in **${session.channelName}**: ${session.minutes} minutes, ${session.coins} coins this session.`
          : 'Not in voice right now.',
        `Daily cap: ${record.daily}/${config.DAILY_CAP} coins. Wallet: ${kenopsia.member(interaction.guildId, user.id).coins} coins.`,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  },
};
