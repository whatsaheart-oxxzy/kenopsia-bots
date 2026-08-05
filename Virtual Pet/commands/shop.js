'use strict';

const { SlashCommandBuilder } = require('discord.js');
const shop = require('../lib/shop');
const wallet = require('../lib/wallet');

module.exports = {
  data: new SlashCommandBuilder()
    // KALLEN owns /shop now. The pet shop is the one shop that stayed separate,
    // so it takes a separate name rather than two /shop entries in the picker.
    .setName('pet-shop')
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
        'Buy with `/pet-buy item:<id>`. Items land in your bag and are used with `/pet-inventory`.',
        'Everything else in the server is in `/shop` — same coins, one balance.',
      ].join('\n'),
      ephemeral: true,
    });
  },
};
