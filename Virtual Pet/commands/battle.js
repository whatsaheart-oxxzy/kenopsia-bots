'use strict';

const { SlashCommandBuilder } = require('discord.js');
const battle = require('../lib/battle');
const store = require('../lib/store');
const guard = require('../lib/guard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Challenge another member pet')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who to fight').setRequired(true)),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction, { needAwake: true });
    if (!pet) return;

    const target = interaction.options.getUser('user');
    if (target.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot fight yourself.', ephemeral: true });
    }

    const theirs = store.getPet(interaction.guildId, target.id);
    if (!theirs) {
      return interaction.reply({ content: `${target.username} does not have a pet.`, ephemeral: true });
    }
    if (battle.onCooldown(pet)) {
      return interaction.reply({
        content: `**${pet.name}** is still catching their breath. ${battle.cooldownLeft(pet)} minutes.`,
        ephemeral: true,
      });
    }
    if (pet.energy < battle.ENERGY_COST) {
      return interaction.reply({
        content: `**${pet.name}** needs at least ${battle.ENERGY_COST} energy to fight.`,
        ephemeral: true,
      });
    }

    battle.openChallenge(interaction.guildId, interaction.user.id, target.id);

    await interaction.reply(
      [
        `${target}, **${pet.name}** wants a fight.`,
        `Level ${pet.level} ${pet.type} against your **${theirs.name}**, level ${theirs.level}.`,
        '',
        'Type `/accept` in the next five minutes.',
      ].join('\n'),
    );
  },
};
