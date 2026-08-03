'use strict';

const pets = require('./pets');
const store = require('./store');
const notify = require('./notify');

/**
 * Loads the caller's pet, applies pending decay and answers with a clear
 * message when there is nothing to work with. Returns null when it replied.
 *
 * Pet commands work in every channel. Battles and the big moments are written
 * to pet-battles and pet-news anyway, so locking the commands to one room only
 * made the pet harder to keep alive.
 */
async function requirePet(interaction, { needAwake = false } = {}) {
  const pet = store.getPet(interaction.guildId, interaction.user.id);
  if (!pet) {
    const past = store.getRaw(interaction.guildId, interaction.user.id);
    await interaction.reply({
      content: past?.gone
        ? `**${past.name}** ran away. Use \`/adopt\` to start again.`
        : 'You do not have a pet yet. Use `/adopt` to get one.',
      ephemeral: true,
    });
    return null;
  }

  const events = pets.touch(store.rollDay(pet));
  store.save();
  if (events.length) {
    await notify.handleEvents(interaction.client, interaction.guild, pet, events);
  }

  if (pet.gone) {
    await interaction.reply({ content: `**${pet.name}** ran away. \`/adopt\` starts a new one.`, ephemeral: true });
    return null;
  }

  if (needAwake && pets.isAsleep(pet)) {
    const minutes = Math.ceil((pet.sleepUntil - Date.now()) / 60_000);
    await interaction.reply({
      content: `**${pet.name}** is asleep for another ${minutes} minutes. An Energy Drink wakes them up.`,
      ephemeral: true,
    });
    return null;
  }

  return pet;
}

/** Simple per-pet cooldown check. Returns minutes left, or 0. */
function cooldown(pet, field, ms) {
  const left = ms - (Date.now() - (pet[field] ?? 0));
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

module.exports = { requirePet, cooldown };
