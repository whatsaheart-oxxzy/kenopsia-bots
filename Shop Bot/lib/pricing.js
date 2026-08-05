'use strict';

const catalog = require('./catalog');
const store = require('./store');

/**
 * The price a member actually pays, and whether the item is on the shelf.
 *
 * The catalogue holds the list price; the owner can override either field per
 * item with /kallen price and /kallen stock without editing code. Every read
 * path goes through here so a sale price cannot be honoured in one command and
 * ignored in another.
 */

function priceOf(id) {
  const item = catalog.ITEMS[id];
  if (!item) return null;
  const custom = store.overrides()[id]?.price;
  return Number.isInteger(custom) ? custom : item.price;
}

function isAvailable(id) {
  if (!catalog.ITEMS[id]) return false;
  return store.overrides()[id]?.available !== false;
}

/** null clears the override and puts the list price back. */
function setPrice(id, coins) {
  const entry = store.override(id);
  if (coins === null) delete entry.price;
  else entry.price = coins;
  store.save();
  return priceOf(id);
}

function setStock(id, available) {
  store.override(id).available = available;
  store.save();
  return available;
}

/** Items on a shelf, cheapest first, hidden ones dropped. */
function shelf(category) {
  return catalog
    .byCategory(category)
    .filter(([id]) => isAvailable(id))
    .map(([id, item]) => ({ id, item, price: priceOf(id) }))
    .sort((a, b) => a.price - b.price);
}

module.exports = { priceOf, isAvailable, setPrice, setStock, shelf };
