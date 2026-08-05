'use strict';

const catalog = require('./catalog');
const store = require('./store');
const { DAY } = require('./format');

/**
 * What a member owns.
 *
 * One entry per item id. Buying something you already own does not throw the
 * purchase away — a timed item stacks its days on top of what is left, and a
 * single-use item adds another use. Only permanent items refuse a second sale,
 * because there is genuinely nothing to hand over the second time.
 */

const entryFor = (record, id) => record.inventory.find((e) => e.id === id) ?? null;

const isLive = (entry) => Boolean(entry) && (entry.expires === null || entry.expires > Date.now());

/** Owned right now: permanent, unexpired, or with uses left. */
function has(record, id) {
  const entry = entryFor(record, id);
  if (!entry) return false;
  if (entry.uses !== undefined) return entry.uses > 0;
  return isLive(entry);
}

/** Everything currently usable, newest purchase first. */
const live = (record) => record.inventory.filter((e) => has(record, e.id)).reverse();

/**
 * Hands an item over. Returns the entry so callers can report the new expiry.
 * Bundles are expanded here rather than at the call site, so gifting, admin
 * grants and ordinary purchases all unpack them the same way.
 */
function grant(record, id) {
  const item = catalog.ITEMS[id];
  if (!item) return null;

  if (item.kind === 'bundle') {
    for (const child of item.grants) grant(record, child);
    record.inventory.push({ id, at: Date.now(), expires: null, bundle: true });
    store.save();
    return entryFor(record, id);
  }

  let entry = entryFor(record, id);
  if (!entry) {
    entry = { id, at: Date.now(), expires: null };
    record.inventory.push(entry);
  }

  if (item.days === 'once') {
    entry.uses = (entry.uses ?? 0) + 1;
  } else if (item.days === null) {
    entry.expires = null;
  } else {
    // Stack on whatever is left rather than resetting it, so buying early is
    // never a punishment.
    const from = isLive(entry) && entry.expires ? entry.expires : Date.now();
    entry.expires = from + item.days * DAY;
  }

  // Slots that come with a count are counters, not switches.
  if (item.kind === 'emoji') record.emojiSlots = (record.emojiSlots ?? 0) + (item.count ?? 1);
  if (item.kind === 'sticker') record.stickerSlots = (record.stickerSlots ?? 0) + (item.count ?? 1);

  // A card with nothing else on is worth wearing immediately; anything else and
  // the member chooses with /inventory use.
  if (item.kind === 'card' && !record.cosmetics.card) record.cosmetics.card = id;

  store.save();
  return entry;
}

/** Spends one use of a single-use item. */
function consume(record, id) {
  const entry = entryFor(record, id);
  if (!entry || !(entry.uses > 0)) return false;
  entry.uses -= 1;
  store.save();
  return true;
}

/**
 * Drops cosmetics whose item has run out. Called on the minute tick and again
 * before the card is drawn, so an expired card can never be shown even if the
 * tick has not come round yet.
 */
function tidy(record) {
  let changed = false;
  const cos = record.cosmetics;

  if (cos.card && !has(record, cos.card)) {
    // Fall back to any other card still owned before going bare.
    const spare = record.inventory.find((e) => catalog.ITEMS[e.id]?.kind === 'card' && has(record, e.id));
    cos.card = spare?.id ?? null;
    changed = true;
  }

  for (const [id, item] of Object.entries(catalog.ITEMS)) {
    if (item.kind !== 'text-slot' || !item.slot) continue;
    if (cos[item.slot] != null && !has(record, id)) {
      cos[item.slot] = null;
      changed = true;
    }
  }

  if (cos.accent != null && !has(record, 'profile-accent')) {
    cos.accent = null;
    changed = true;
  }

  if (changed) store.save();
  return changed;
}

module.exports = { entryFor, has, live, grant, consume, tidy, isLive };
