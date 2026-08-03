'use strict';

const { SlashCommandBuilder } = require('discord.js');
const shop = require('../lib/shop');
const wallet = require('../lib/wallet');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Things you can buy for your pet')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.reply({
      content: [
        '# Pet shop',
        '',
        ...shop.list(),
        '',
        `You have **${wallet.balance(interaction.guildId, interaction.user.id)}** coins.`,
        'Buy with `/buy item:<id>`. Items land in your inventory and are used with `/inventory`.',
      ].join('\n'),
      ephemeral: true,
    });
  },
};
