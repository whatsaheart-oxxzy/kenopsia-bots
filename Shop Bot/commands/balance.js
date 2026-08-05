'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const wallet = require('../lib/wallet');
const store = require('../lib/store');
const cosmetics = require('../lib/cosmetics');
const { coins } = require('../lib/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Your coins')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Someone else. Default: you')),

  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const balance = wallet.balance(interaction.guildId, user.id);
    const record = store.member(interaction.guildId, user.id);
    const style = cosmetics.look(interaction.guildId, user.id);

    // Coins sitting in an open request are gone from the balance but not spent,
    // and people panic when a number drops without an explanation.
    const held = store
      .requests(interaction.guildId, (r) => r.user === user.id && r.held > 0)
      .reduce((sum, r) => sum + r.held, 0);

    const embed = new EmbedBuilder()
      .setColor(style.color)
      .setTitle(`${user.displayName ?? user.username} — coins`)
      .setDescription(
        [
          `**${coins(balance)}** coins.`,
          '',
          'One balance for the whole server. Messages, reactions and time in voice',
          'all pay into it, and the shop and the pet shop both spend out of it.',
        ].join('\n'),
      );

    if (held) {
      embed.addFields({
        name: 'Held in open requests',
        value: `**${coins(held)}** coins. Not spent yet — you get them back if the request is denied. See \`/request status\`.`,
      });
    }
    if (record.spent) {
      embed.addFields({ name: 'Spent in the shop', value: `${coins(record.spent)} coins`, inline: true });
    }

    embed.setFooter({ text: 'Browse with /shop' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
