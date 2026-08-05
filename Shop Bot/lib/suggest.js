'use strict';

const catalog = require('./catalog');
const pricing = require('./pricing');
const { coins } = require('./format');

/**
 * Autocomplete for item names.
 *
 * There are more than twenty five items, which is Discord's hard limit on a
 * choice list, so the shop cannot use addChoices() and stay complete. This
 * matches on the id, the label and the category, so typing "gold", "card" or
 * "robux" all find something.
 */
function items(focused, { onlyBuyable = false, ownedBy = null } = {}) {
  const needle = String(focused ?? '').toLowerCase().trim();

  return Object.entries(catalog.ITEMS)
    .filter(([id, item]) => {
      if (!pricing.isAvailable(id)) return false;
      if (onlyBuyable && item.approval) return false;
      if (ownedBy && !ownedBy(id)) return false;
      if (!needle) return true;
      return `${id} ${item.label} ${item.category}`.toLowerCase().includes(needle);
    })
    .slice(0, 25)
    .map(([id, item]) => ({
      name: `${item.label} — ${coins(pricing.priceOf(id))} coins`.slice(0, 100),
      value: id,
    }));
}

module.exports = { items };
