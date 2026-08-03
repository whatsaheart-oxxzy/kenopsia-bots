'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const guard = require('../lib/guard');
const notify = require('../lib/notify');
const wallet = require('../lib/wallet');

const INTERACT_COOLDOWN_MS = 60 * 60_000;

/** The stat card, used by /pet and /stats. */
function card(pet, coins) {
  const spec = pets.TYPES[pet.type];
  const mood =
    pet.happiness > 70 ? 'is doing great' : pet.happiness > 40 ? 'is alright' : pet.happiness > 20 ? 'is not doing well' : 'is about to leave';

  return [
    `# ${pet.skin ? `${pet.skin} ` : ''}${pet.name}`,
    `${pets.formName(pet)} · ${spec.label} · level ${pet.level} · ${pets.stageName(pet.level)} stage`,
    '',
    `Hunger    ${pets.bar(pet.hunger)}`,
    `Happiness ${pets.bar(pet.happiness)}`,
    `Energy    ${pets.bar(pet.energy)}`,
    `Xp        \`${pet.xp}/${pets.xpForLevel(pet.level)}\``,
    '',
    `Record: ${pet.wins ?? 0} wins, ${pet.losses ?? 0} losses`,
    coins === undefined ? '' : `Your coins: ${coins}`,
    '',
    `${pet.name} ${mood}.`,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  card,
  data: new SlashCommandBuilder()
    .setName('pet')
    .setDescription('Check on your pet and spend a minute with them')
    .setDMPermission(false),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    const left = guard.cooldown(pet, 'lastInteract', INTERACT_COOLDOWN_MS);
    if (left) {
      return interaction.reply({
        content: `${card(pet, wallet.balance(interaction.guildId, interaction.user.id))}\n\nYou already spent time together. Come back in ${left} minutes.`,
      });
    }

    pet.lastInteract = Date.now();
    pet.happiness = pets.clamp(pet.happiness + 5);
    const result = pets.addXp(pet, 5);
    store.save();

    await notify.levelUp(interaction.guild, pet, result);
    await notify.syncRoles(interaction.member, pet);

    await interaction.reply(
      [
        card(pet, wallet.balance(interaction.guildId, interaction.user.id)),
        '',
        `You spent a minute together. Happiness up 5, xp up 5.${result.levels ? ` **Level ${pet.level} now.**` : ''}`,
      ].join('\n'),
    );
  },
};
