'use strict';

const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/kenopsia/store');
const { LEVEL_ROLES, xpForLevel, roleForLevel } = require('../lib/kenopsia/blueprint');
const { profileEmbed } = require('../Shop Bot/lib/card');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Your coins, card and rank')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Someone else. Default: you')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'That member is not on the server.', ephemeral: true });

    const record = store.roll(store.member(interaction.guildId, user.id));

    // The card itself is KALLEN's — whatever the member bought in the shop is
    // what this comes back decorated with. Coins lead, because the shop and
    // everything else in the server is priced in them.
    const embed = profileEmbed(interaction.guild, member);

    // Levels still exist and still open channels, so they stay on the card —
    // just below the number people actually spend.
    const needed = xpForLevel(record.level);
    const filled = Math.round((record.xp / needed) * 12);
    const current = roleForLevel(record.level);
    const next = LEVEL_ROLES.find((r) => r.level > record.level);

    embed.addFields({
      name: `Level ${record.level}${current ? ` · ${current.name}` : ''}`,
      value: [
        `\`${'='.repeat(filled)}${'.'.repeat(12 - filled)}\` ${record.xp}/${needed} xp`,
        next ? `Next: **${next.name}** at level ${next.level}.` : 'Highest role reached.',
      ].join('\n'),
    });

    await interaction.reply({ embeds: [embed] });
  },
};
