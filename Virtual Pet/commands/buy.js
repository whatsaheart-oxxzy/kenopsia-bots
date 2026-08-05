'use strict';

const { SlashCommandBuilder } = require('discord.js');
const shop = require('../lib/shop');
const store = require('../lib/store');
const guard = require('../lib/guard');
const wallet = require('../lib/wallet');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet-buy')
    .setDescription('Buy an item from the pet shop')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('item')
        .setDescription('Which item')
        .setRequired(true)
        .addChoices(
          ...Object.entries(shop.ITEMS)
            .slice(0, 25)
            .map(([value, item]) => ({ name: `${item.label} (${item.price})`, value })),
        ),
    )
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How many. Default 1.').setMinValue(1).setMaxValue(10),
    ),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    const id = interaction.options.getString('item');
    const amount = interaction.options.getInteger('amount') ?? 1;
    const item = shop.ITEMS[id];
    const total = item.price * amount;

    if (!wallet.spend(interaction.guildId, interaction.user.id, total)) {
      return interaction.reply({
        content: `That costs ${total} coins and you have ${wallet.balance(interaction.guildId, interaction.user.id)}.`,
        ephemeral: true,
      });
    }

    store.addItem(interaction.guildId, interaction.user.id, id, amount);
    await interaction.reply(
      `Bought ${amount} ${item.label}${amount > 1 ? 's' : ''} for ${total} coins. Use it with \`/pet-inventory\`. ${wallet.balance(interaction.guildId, interaction.user.id)} coins left.`,
    );
  },
};
