'use strict';

const { SlashCommandBuilder } = require('discord.js');
const shop = require('../lib/shop');
const store = require('../lib/store');
const guard = require('../lib/guard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet-gift')
    .setDescription('Give one of your pet items to another member')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('item')
        .setDescription('Which item')
        .setRequired(true)
        .addChoices(
          ...Object.entries(shop.ITEMS)
            .slice(0, 25)
            .map(([value, item]) => ({ name: item.label, value })),
        ),
    ),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    const target = interaction.options.getUser('user');
    const id = interaction.options.getString('item');

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: 'You already own that.', ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: 'Bots do not keep pets.', ephemeral: true });
    }
    if (!store.getPet(interaction.guildId, target.id)) {
      return interaction.reply({
        content: `${target.username} has no pet to give it to.`,
        ephemeral: true,
      });
    }
    if (!store.hasItem(interaction.guildId, interaction.user.id, id)) {
      return interaction.reply({ content: `You do not have a ${shop.ITEMS[id].label}.`, ephemeral: true });
    }

    store.addItem(interaction.guildId, interaction.user.id, id, -1);
    store.addItem(interaction.guildId, target.id, id, 1);

    await interaction.reply(`${interaction.user} gave ${target} a **${shop.ITEMS[id].label}**.`);
  },
};
