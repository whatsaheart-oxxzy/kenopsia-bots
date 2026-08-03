'use strict';

/**
 * The bridge to the Kenopsia wallet. Suzaku runs inside the same process as
 * C.C, so this is the same module instance and the same in-memory data — no
 * second file, no two writers, nothing to keep in sync.
 */
const kenopsia = require('../../lib/kenopsia/store');
const economy = require('../../lib/kenopsia/economy');

const balance = (guildId, userId) => kenopsia.roll(kenopsia.member(guildId, userId)).coins;

/** Takes coins if there are enough. Returns false and changes nothing if not. */
function spend(guildId, userId, amount) {
  if (balance(guildId, userId) < amount) return false;
  economy.addCoins(guildId, userId, -amount);
  return true;
}

function earn(guildId, userId, amount) {
  economy.addCoins(guildId, userId, amount);
  return balance(guildId, userId);
}

module.exports = { balance, spend, earn };
