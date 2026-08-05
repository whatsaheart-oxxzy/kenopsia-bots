'use strict';

const catalog = require('./catalog');
const store = require('./store');
const inventory = require('./inventory');
const { hex } = require('./format');

/**
 * The profile card.
 *
 * This is the honest version of "decorations". Discord's avatar decorations,
 * profile effects and nickname formatting are Discord's own paid features and
 * no bot can grant them, so KALLEN decorates the one surface it genuinely owns:
 * the embed it draws when someone runs /profile.
 *
 * C.C's /profile imports this. Both bots are in the same process, so there is
 * no second copy of the data and nothing to keep in sync.
 */

const DEFAULT_COLOR = 0x5865f2;

/** Everything needed to draw a member's card. Safe for members who own nothing. */
function look(guildId, userId) {
  const record = store.member(guildId, userId);
  inventory.tidy(record);

  const cos = record.cosmetics;
  const design = cos.card ? catalog.ITEMS[cos.card]?.card : null;

  return {
    color: hex(cos.accent) ?? design?.color ?? DEFAULT_COLOR,
    mark: design?.mark ?? null,
    edge: design?.edge ?? null,
    cardName: cos.card ? catalog.ITEMS[cos.card]?.label ?? null : null,
    title: cos.title ?? null,
    badge: cos.badge ?? null,
    bio: cos.bio ?? null,
    showcase: cos.showcase ?? null,
    bare: !cos.card && !cos.title && !cos.badge && !cos.bio && !cos.accent,
  };
}

/** The name line: badge, name, card mark. */
function heading(displayName, style) {
  return [style.badge, displayName, style.mark].filter(Boolean).join(' ');
}

/** A divider in the card's own style, or a plain one when it has no card. */
const rule = (style) => (style.edge ? style.edge.repeat(9) : '───────────');

module.exports = { look, heading, rule, DEFAULT_COLOR };
