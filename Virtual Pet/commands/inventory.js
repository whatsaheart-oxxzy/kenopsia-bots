'use strict';

const { SlashCommandBuilder } = require('discord.js');
const shop = require('../lib/shop');
const store = require('../lib/store');
const guard = require('../lib/guard');
const notify = require('../lib/notify');
const pets = require('../lib/pets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet-inventory')
    .setDescription('Your items, and use one on your pet')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('use')
        .setDescription('Item to use right now')
        .addChoices(
          ...Object.entries(shop.ITEMS)
            .slice(0, 25)
            .map(([value, item]) => ({ name: item.label, value })),
        ),
    ),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    const items = store.inventoryOf(interaction.guildId, interaction.user.id);
    const use = interaction.options.getString('use');

    if (!use) {
      const lines = Object.entries(items)
        .filter(([, count]) => count > 0)
        .map(([id, count]) => `\`${id}\` **${shop.ITEMS[id]?.label ?? id}** x${count}`);

      return interaction.reply({
        content: lines.length
          ? ['# Your items', '', ...lines, '', 'Use one with `/pet-inventory use:<item>`.'].join('\n')
          : 'Your bag is empty. `/pet-shop` shows what there is.',
        ephemeral: true,
      });
    }

    if (!store.hasItem(interaction.guildId, interaction.user.id, use)) {
      return interaction.reply({
        content: `You do not have a ${shop.ITEMS[use].label}.`,
        ephemeral: true,
      });
    }

    const before = pet.level;
    const text = shop.ITEMS[use].apply(pet);
    store.addItem(interaction.guildId, interaction.user.id, use, -1);
    store.save();

    if (pet.level > before) {
      await notify.levelUp(interaction.guild, pet, { levels: pet.level - before, evolved: true });
      await notify.syncRoles(interaction.member, pet);
    }

    await interaction.reply(
      [
        `**${pet.name}** ${text}`,
        '',
        `Hunger    ${pets.bar(pet.hunger)}`,
        `Happiness ${pets.bar(pet.happiness)}`,
        `Energy    ${pets.bar(pet.energy)}`,
        pet.level > before ? `Level ${pet.level} now.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },
};
