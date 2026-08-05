'use strict';

/**
 * KALLEN's settings. Channel names match the blueprint C.C builds
 * (lib/kenopsia/blueprint.js), so /kenopsia setup keeps making the places
 * KALLEN writes into.
 *
 * shopRequests is the one channel that is not in the blueprint yet — KALLEN
 * creates it itself on first use, hidden from everyone but staff, because the
 * queue contains members' gamepass links and 18+ declarations.
 */

const CHANNELS = {
  shop: 'shop-guide',
  requests: 'shop-requests',
  rewards: 'rewards',
  announcements: 'announcements',
  voiceCategory: 'VOICE',
  chatCategory: 'CHAT',
};

/** Comma separated Discord user ids. These people can run /kallen. */
const owners = () =>
  String(process.env.SHOP_OWNER_IDS ?? process.env.OWNER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Whoever can run the owner commands. The guild owner always counts, so a fresh
 * install is never locked out of its own queue by an empty env var.
 */
function isOwner(interaction) {
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  return owners().includes(interaction.user.id);
}

/** One request per member per day, so the queue cannot be flooded. */
const REQUEST_COOLDOWN_MS = 24 * 3_600_000;

/** A request nobody has touched is refunded and closed after this long. */
const REQUEST_EXPIRY_MS = 7 * 86_400_000;

/**
 * How long a bought private voice room may sit empty before the channel is
 * removed.
 *
 * The room is a purchase, so what gets deleted is the channel, never the
 * entitlement — it stays in the member's inventory and `/inventory room` builds
 * it again for nothing. Silence costs a channel, never a refund.
 *
 * Two hours rather than a day: at 2,000 coins plenty of people own a room, so
 * the voice list fills up fast. Rebuilding is free and instant, so sweeping
 * early costs the member nothing.
 *
 * Bought TEXT rooms are deliberately never swept. Deleting a text channel
 * destroys everything anybody ever said in it, and there is no undo.
 */
const ROOM_IDLE_MS = 2 * 3_600_000;

module.exports = { CHANNELS, owners, isOwner, REQUEST_COOLDOWN_MS, REQUEST_EXPIRY_MS, ROOM_IDLE_MS };
