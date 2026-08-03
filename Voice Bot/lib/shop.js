'use strict';

/**
 * The voice shop, in Kenopsia coins.
 *
 * Only things a bot can actually deliver are in here. Profile frames, voice
 * decorations, animated auras, nickname formatting and Nitro are Discord's own
 * paid features — no bot can grant them, so selling them would be selling
 * something that never arrives.
 */

const ITEMS = {
  'role-gamer': { label: 'Gamer role', price: 500, kind: 'role', role: 'Gamer', days: 7, text: 'The Gamer role and its colour for 7 days.' },
  'role-streamer': { label: 'Streamer role', price: 500, kind: 'role', role: 'Streamer', days: 7, text: 'The Streamer role and its colour for 7 days.' },
  'role-dj': { label: 'DJ role', price: 750, kind: 'role', role: 'DJ', days: 30, text: 'The DJ role for 30 days.' },
  'role-host': { label: 'Event Host', price: 1_000, kind: 'role', role: 'Event Host', days: 30, text: 'Lets you create events with /event create. 30 days.' },
  'role-mentor': { label: 'Mentor', price: 1_500, kind: 'role', role: 'Mentor', days: null, text: 'Permanent. Marks you as someone new members can ask.' },
  'role-vip': { label: 'VIP', price: 3_000, kind: 'role', role: 'VIP', days: null, text: 'Permanent. Shown separately in the member list.' },
  'emoji-slot': { label: 'Emoji slot', price: 1_000, kind: 'emoji', text: 'Add one custom emoji to the server with /voice-emoji.' },
  'private-room': { label: 'Private voice room', price: 3_500, kind: 'room', text: 'Your own permanent voice channel that only you can rename.' },
};

const CATEGORIES = {
  roles: 'role',
  extras: null, // everything that is not a role
};

function list(filter) {
  return Object.entries(ITEMS)
    .filter(([, item]) => {
      if (filter === 'roles') return item.kind === 'role';
      if (filter === 'extras') return item.kind !== 'role';
      return true;
    })
    .map(([id, item]) => `\`${id}\` **${item.label}** — ${item.price} coins. ${item.text}`);
}

module.exports = { ITEMS, CATEGORIES, list };
