'use strict';

const pets = require('./pets');

// Pet announcements get their own read-only channel. They are bot noise, and
// bot noise does not belong in the channel people actually talk in.
const CHANNELS = { news: 'pet-news', battles: 'pet-battles', guide: 'pet-guide' };

// Role name -> does this pet qualify.
const ROLE_RULES = [
  ['Pet Owner', () => true],
  ['Pet Master', (pet) => (pet.wins ?? 0) >= 10],
  ['Breeder', (pet) => pet.level >= 50],
  ['Legendary Pet Owner', (pet) => pet.level >= 75],
  ['Mythical Pet Owner', (pet) => pet.level >= 100],
];

function channel(guild, name) {
  const found = guild.channels.cache.find((c) => c.name === name);
  return found?.isTextBased() ? found : null;
}

async function announce(guild, text) {
  // Never falls back to general on purpose: if the channel is missing, the
  // announcement is dropped rather than dumped into the chat.
  const target = channel(guild, CHANNELS.news) ?? channel(guild, CHANNELS.battles);
  if (target) await target.send(text).catch(() => {});
}

async function battleLog(guild, text) {
  const target = channel(guild, CHANNELS.battles) ?? channel(guild, CHANNELS.news);
  if (target) await target.send(text).catch(() => {});
}

/** DMs are blocked by plenty of people, so failure here is never an error. */
async function dm(client, userId, text) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (user) await user.send(text).catch(() => {});
}

/** Gives and takes the pet roles a member has earned. */
async function syncRoles(member, pet) {
  const me = member.guild.members.me;
  for (const [name, rule] of ROLE_RULES) {
    const role = member.guild.roles.cache.find((r) => r.name === name);
    if (!role || role.position >= me.roles.highest.position) continue;

    const should = pet ? rule(pet) : false;
    const has = member.roles.cache.has(role.id);
    if (should && !has) await member.roles.add(role, 'Pet progress').catch(() => {});
    if (!should && has) await member.roles.remove(role, 'Pet progress').catch(() => {});
  }
}

/**
 * Turns the events from pets.touch into messages: warnings by DM, the big
 * moments in general so the server sees them.
 */
async function handleEvents(client, guild, pet, events) {
  const name = pet.name;

  for (const event of events) {
    switch (event.type) {
      case 'low':
        if (event.stat === 'hunger') {
          await dm(client, pet.owner, `${name} is hungry. Feed them before they get sad — use \`/feed\`.`);
        } else if (event.stat === 'happiness') {
          await dm(client, pet.owner, `${name} is lonely. Cheer them up with \`/play\` before they leave.`);
        } else {
          await dm(client, pet.owner, `${name} is tired. Let them rest with \`/rest\` before they collapse.`);
        }
        break;

      case 'starving':
        await dm(client, pet.owner, `${name} went hungry and lost 20 happiness. A Food Pack costs 10 coins.`);
        break;

      case 'asleep':
        await dm(client, pet.owner, `${name} ran out of energy and is asleep for two hours.`);
        break;

      case 'revived':
        await announce(guild, `<@${pet.owner}>'s phoenix **${name}** burned out and rose again. That was the free one this week.`);
        break;

      case 'protected':
        await dm(client, pet.owner, `${name} nearly ran away. The Protection Charm held. Play with them today.`);
        break;

      case 'ranaway':
        await announce(guild, `<@${pet.owner}>'s pet **${name}** ran away. Take better care of the next one — \`/adopt\` starts over.`);
        await dm(client, pet.owner, `${name} ran away. Everything is gone, and that is on all of us who forgot. \`/adopt\` gives you a new start.`);
        break;

      default:
        break;
    }
  }
}

/** Announces a level up, and an evolution more loudly. */
async function levelUp(guild, pet, result) {
  if (result.evolved) {
    await announce(
      guild,
      `<@${pet.owner}>'s **${pet.name}** evolved into a **${pets.formName(pet)}** at level ${pet.level}. That is the ${pets.stageName(pet.level)} stage.`,
    );
    return;
  }
  if (result.levels && pet.level % 10 === 0) {
    await announce(guild, `<@${pet.owner}>'s **${pet.name}** reached level ${pet.level}.`);
  }
}

module.exports = { announce, battleLog, dm, syncRoles, handleEvents, levelUp, CHANNELS };
