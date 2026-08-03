'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const guard = require('../lib/guard');
const notify = require('../lib/notify');

const COOLDOWN_MS = 60 * 60_000;
const XP = 10;
const ENERGY_COST = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('train')
    .setDescription(`Train your pet. ${XP} xp, ${ENERGY_COST} energy. Free.`)
    .setDMPermission(false),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction, { needAwake: true });
    if (!pet) return;

    const left = guard.cooldown(pet, 'lastTrained', COOLDOWN_MS);
    if (left) {
      return interaction.reply({ content: `Training again in ${left} minutes.`, ephemeral: true });
    }
    if (pet.energy < ENERGY_COST) {
      return interaction.reply({
        content: `**${pet.name}** has ${pet.energy} energy and needs ${ENERGY_COST}. Rest first.`,
        ephemeral: true,
      });
    }

    pet.lastTrained = Date.now();
    pet.energy = pets.clamp(pet.energy - ENERGY_COST);
    const result = pets.addXp(pet, XP, 'train');
    store.save();

    await notify.levelUp(interaction.guild, pet, result);
    await notify.syncRoles(interaction.member, pet);

    await interaction.reply(
      [
        `**${pet.name}** trained hard. ${XP} xp.`,
        result.levels ? `**Level ${pet.level} now.**` : `Xp \`${pet.xp}/${pets.xpForLevel(pet.level)}\``,
        `Energy ${pets.bar(pet.energy)}`,
      ].join('\n'),
    );
  },
};
