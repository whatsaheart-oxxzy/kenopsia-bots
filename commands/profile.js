'use strict';

const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/kenopsia/store');
const { LEVEL_ROLES, xpForLevel, roleForLevel } = require('../lib/kenopsia/blueprint');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Your level, coins and rank')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Someone else. Default: you')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const record = store.roll(store.member(interaction.guildId, user.id));

    const needed = xpForLevel(record.level);
    const filled = Math.round((record.xp / needed) * 12);
    const bar = `\`${'='.repeat(filled)}${'.'.repeat(12 - filled)}\` ${record.xp}/${needed} xp`;

    const current = roleForLevel(record.level);
    const next = LEVEL_ROLES.find((r) => r.level > record.level);
    const rank = store.rankOf(interaction.guildId, user.id, 'weeklyCoins');

    await interaction.reply({
      content: [
        `# ${user.displayName ?? user.username}`,
        '',
        `Level **${record.level}**${current ? ` · ${current.name}` : ''}`,
        bar,
        '',
        `Coins: **${record.coins}** · this week: **${record.weeklyCoins}**${rank ? ` · rank **#${rank}**` : ''}`,
        `Voice time: **${Math.floor(record.voiceSeconds / 3600)}h ${Math.floor((record.voiceSeconds % 3600) / 60)}m**`,
        record.invites ? `Members invited: **${record.invites}**` : '',
        '',
        next
          ? `Next role: **${next.name}** at level ${next.level}.`
          : 'Highest role reached. Nothing left to unlock.',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  },
};
