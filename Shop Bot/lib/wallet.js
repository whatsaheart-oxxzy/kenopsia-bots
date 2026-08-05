'use strict';

/**
 * The bridge to the Kenopsia wallet.
 *
 * KALLEN runs inside the same process as C.C, so this is the same module
 * instance and the same in-memory data — no second file, no two writers,
 * nothing to keep in sync. Identical arrangement to "Virtual Pet/lib/wallet.js".
 *
 * There is one coin balance in this server. Voice time pays into it, messages
 * pay into it, and this shop spends out of it.
 */

const kenopsia = require('../../lib/kenopsia/store');
const economy = require('../../lib/kenopsia/economy');

const balance = (guildId, userId) => kenopsia.roll(kenopsia.member(guildId, userId)).coins;

/** Takes coins if there are enough. Returns false and changes nothing if not. */
function spend(guildId, userId, amount) {
  if (amount <= 0) return true;
  if (balance(guildId, userId) < amount) return false;
  economy.addCoins(guildId, userId, -amount);
  return true;
}

function earn(guildId, userId, amount) {
  economy.addCoins(guildId, userId, amount);
  return balance(guildId, userId);
}

/**
 * Escrow.
 *
 * A Robux or Nitro request can sit in the queue for days waiting on the owner.
 * If the coins stayed in the member's balance they could be spent twice: once
 * on the request and once on a card, and the owner would find out at fulfilment
 * time with nothing to take back. So the coins leave the balance when the
 * request opens and are either consumed on completion or handed straight back
 * on a denial, an expiry or a refund.
 *
 * hold() and release() are deliberately the same two functions the rest of the
 * file uses — the escrow lives in the request record, not in a second balance.
 */
const hold = (guildId, userId, amount) => spend(guildId, userId, amount);

const release = (guildId, userId, amount) => (amount > 0 ? earn(guildId, userId, amount) : balance(guildId, userId));

module.exports = { balance, spend, earn, hold, release };
