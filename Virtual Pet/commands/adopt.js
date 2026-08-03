'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const notify = require('../lib/notify');

const NAME_MAX = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adopt')
    .setDescription('Adopt a pet. One per member.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('Which pet')
        .setRequired(true)
        .addChoices(
          ...Object.entries(pets.TYPES).map(([value, t]) => ({ name: t.label, value })),
        ),
    )
    .addStringOption((o) =>
      o.setName('name').setDescription('What to call it').setRequired(true).setMaxLength(NAME_MAX),
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type');
    const name = interaction.options.getString('name').trim();

    const existing = store.getPet(interaction.guildId, interaction.user.id);
    if (existing) {
      return interaction.reply({
        content: `You already have a pet named **${existing.name}**.`,
        ephemeral: true,
      });
    }
    if (!name) {
      return interaction.reply({ content: 'Your pet needs a name.', ephemeral: true });
    }

    const pet = store.createPet(interaction.guildId, interaction.user.id, type, name);
    const spec = pets.TYPES[type];

    await notify.syncRoles(interaction.member, pet);
    await notify.announce(
      interaction.guild,
      `${interaction.user} adopted a ${spec.label} named **${name}**. Say hello.`,
    );

    await interaction.reply(
      [
        `**${name}** the ${pets.formName(pet)} is yours.`,
        '',
        `Hunger ${pets.bar(pet.hunger)}`,
        `Happiness ${pets.bar(pet.happiness)}`,
        `Energy ${pets.bar(pet.energy)}`,
        '',
        `Special: ${spec.ability}`,
        '',
        'Hunger drops every two hours, happiness every four. If happiness hits zero they leave for good.',
        'Talking in the server keeps them fed on attention. `/pet` checks on them, `/feed` costs 10 coins.',
      ].join('\n'),
    );
  },
};
