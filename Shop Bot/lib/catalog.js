'use strict';

/**
 * KALLEN's catalogue.
 *
 * Three rules shaped every line of this file.
 *
 * 1. One wallet. Voice time and messages already pay into the same Kenopsia coin
 *    balance — Shirley never had a separate currency, see the comment at the top
 *    of "Voice Bot/lib/store.js". So there is one price per item, one number on
 *    the shelf, and no conversion anywhere. The pet shop is the only other shop
 *    left, and it only sells pet things.
 *
 * 2. No roles. KALLEN hands out nothing that lives in the role list. Everything
 *    here is either drawn by KALLEN inside its own embeds, created as a channel
 *    or an emoji, or fulfilled by hand by the owner.
 *
 * 3. Nothing is sold that cannot be handed over. Discord avatar decorations,
 *    profile effects, nickname bold/italic and custom statuses belong to Discord
 *    and no bot can grant them, so they are not in here — selling them would be
 *    selling something that never arrives. The "cards" below are the honest
 *    version: KALLEN owns its own embeds and decorates those.
 *
 * Prices are anchored to real money, because Robux and Nitro come out of the
 * owner's pocket:
 *
 *     1 Robux  ~   125 coins
 *     USD 1    ~ 10,000 coins
 *
 * An active member earns roughly 225 coins a day (100 from messages at the daily
 * cap, ~30 an hour in voice), which puts the cheapest Robux pack at about five
 * months of real activity. Retune the entire shop with SCALE below rather than
 * by editing forty separate numbers.
 */

/** Multiply every price. 0.5 halves the shop, 2 doubles it. */
const SCALE = 1;

const price = (n) => Math.round((n * SCALE) / 100) * 100;

/** What the owner should charge per Robux when quoting a custom request. */
const COINS_PER_ROBUX = Math.round(125 * SCALE);

const CATEGORIES = {
  cards: {
    label: 'Profile cards',
    blurb: 'Frames and colours for the card /profile draws. Applied the moment you buy.',
  },
  profile: {
    label: 'Profile upgrades',
    blurb: 'Extra things on your card: a title, a badge, a bio, your own accent colour.',
  },
  bundles: {
    label: 'Bundles',
    blurb: 'Several items at once, always cheaper than buying them one at a time.',
  },
  server: {
    label: 'Server',
    blurb: 'Emoji, stickers, your own room, an event, an announcement.',
  },
  robux: {
    label: 'Robux',
    blurb: 'Real Robux. 18+ only, paid through your gamepass, approved by hand.',
  },
  nitro: {
    label: 'Nitro',
    blurb: 'Real Discord Nitro, gifted by the owner. Approved by hand.',
  },
  ingame: {
    label: 'In-game items',
    blurb: 'Roblox items, traded to you in game. Ask for a quote with /request item.',
  },
};

/**
 * Item fields:
 *   category   which shelf it sits on
 *   kind       what deliver.js does with it
 *   price      coins. null means the owner quotes it per request
 *   days       how long it lasts. null = permanent, 'once' = single use
 *   approval   goes through the request queue instead of /buy
 *   giftable   can be bought for someone else
 *   grants     bundles only: the ids handed over
 *   card       cards only: how the profile embed is drawn
 */
const ITEMS = {
  // --- Profile cards -------------------------------------------------------
  // Same tier, same price, three different looks. Nobody should have to pay
  // more for the colour they happen to like.
  'card-ember': {
    category: 'cards',
    kind: 'card',
    label: 'Ember card',
    price: price(3_000),
    days: 30,
    giftable: true,
    text: 'A warm orange card with an ember rule.',
    card: { color: 0xff6b35, mark: '🜂', edge: '─═─' },
  },
  'card-frost': {
    category: 'cards',
    kind: 'card',
    label: 'Frost card',
    price: price(3_000),
    days: 30,
    giftable: true,
    text: 'A pale blue card with a frost rule.',
    card: { color: 0x6bd5ff, mark: '❄', edge: '─·─' },
  },
  'card-verdant': {
    category: 'cards',
    kind: 'card',
    label: 'Verdant card',
    price: price(3_000),
    days: 30,
    giftable: true,
    text: 'A deep green card with a leaf rule.',
    card: { color: 0x35c96b, mark: '❦', edge: '─◦─' },
  },
  'card-obsidian': {
    category: 'cards',
    kind: 'card',
    label: 'Obsidian card',
    price: price(9_000),
    days: 90,
    giftable: true,
    text: 'Near black with a sharp silver rule. Three months.',
    card: { color: 0x2b2d31, mark: '◆', edge: '━━━' },
  },
  'card-aurora': {
    category: 'cards',
    kind: 'card',
    label: 'Aurora card',
    price: price(18_000),
    days: 180,
    giftable: true,
    text: 'Shifting violet with a banded rule. Six months.',
    card: { color: 0x9b59f0, mark: '✦', edge: '≈≋≈' },
  },
  'card-eclipse': {
    category: 'cards',
    kind: 'card',
    label: 'Eclipse card',
    price: price(30_000),
    days: null,
    giftable: true,
    text: 'Black and gold, permanent. Rare enough that people notice.',
    card: { color: 0xd4a017, mark: '☾', edge: '◈─◈' },
  },
  'card-kenopsia': {
    category: 'cards',
    kind: 'card',
    label: 'Kenopsia card',
    price: price(55_000),
    days: null,
    giftable: false,
    text: 'The house card. Permanent, cannot be gifted, and there is nothing above it.',
    card: { color: 0xf72585, mark: '⬢', edge: '⬢─⬢' },
  },

  // --- Profile upgrades ----------------------------------------------------
  'profile-badge': {
    category: 'profile',
    kind: 'text-slot',
    label: 'Badge',
    price: price(4_000),
    days: 90,
    giftable: true,
    slot: 'badge',
    limit: 4,
    text: 'One emoji shown next to your name. Set it with /inventory set.',
  },
  'profile-bio': {
    category: 'profile',
    kind: 'text-slot',
    label: 'Bio',
    price: price(5_000),
    days: 180,
    giftable: true,
    slot: 'bio',
    limit: 180,
    text: 'A few lines of your own text on your card.',
  },
  'profile-title': {
    category: 'profile',
    kind: 'text-slot',
    label: 'Title',
    price: price(6_000),
    days: 90,
    giftable: true,
    slot: 'title',
    limit: 40,
    text: 'A line under your name, your words. Not a role — nobody else can see it in the member list.',
  },
  'profile-accent': {
    category: 'profile',
    kind: 'accent',
    label: 'Accent colour',
    price: price(7_000),
    days: 90,
    giftable: true,
    text: 'Any hex colour you like for your card, overriding the one your card came with.',
  },
  'profile-showcase': {
    category: 'profile',
    kind: 'text-slot',
    label: 'Showcase image',
    price: price(10_000),
    days: null,
    giftable: true,
    slot: 'showcase',
    limit: 400,
    text: 'An image link shown on your card. Permanent.',
  },
  'profile-spotlight': {
    category: 'profile',
    kind: 'spotlight',
    label: 'Spotlight',
    price: price(15_000),
    days: 'once',
    giftable: true,
    text: 'KALLEN posts your card in #rewards, once, with your name at the top.',
  },

  // --- Bundles -------------------------------------------------------------
  // Every bundle is priced below the sum of its parts. The saving is worked out
  // at runtime in worth() so it can never drift out of date.
  'bundle-drifter': {
    category: 'bundles',
    kind: 'bundle',
    label: 'Drifter bundle',
    price: price(10_500),
    days: null,
    giftable: true,
    grants: ['card-ember', 'profile-badge', 'profile-title'],
    text: 'Ember card, a badge and a title.',
  },
  'bundle-wanderer': {
    category: 'bundles',
    kind: 'bundle',
    label: 'Wanderer bundle',
    price: price(17_000),
    days: null,
    giftable: true,
    grants: ['card-obsidian', 'profile-accent', 'profile-bio'],
    text: 'Obsidian card, your own accent colour and a bio.',
  },
  'bundle-nocturne': {
    category: 'bundles',
    kind: 'bundle',
    label: 'Nocturne bundle',
    price: price(31_000),
    days: null,
    giftable: true,
    grants: ['card-aurora', 'profile-title', 'profile-badge', 'profile-accent', 'profile-bio'],
    text: 'Aurora card and every profile upgrade that has a duration.',
  },
  'bundle-vigil': {
    category: 'bundles',
    kind: 'bundle',
    label: 'Vigil bundle',
    price: price(60_000),
    days: null,
    giftable: true,
    grants: [
      'card-eclipse',
      'profile-title',
      'profile-badge',
      'profile-accent',
      'profile-bio',
      'profile-showcase',
      'emoji-slot',
    ],
    text: 'Eclipse card, every profile upgrade and an emoji slot.',
  },
  'bundle-oblivion': {
    category: 'bundles',
    kind: 'bundle',
    label: 'Oblivion bundle',
    price: price(160_000),
    days: null,
    giftable: false,
    grants: [
      'card-kenopsia',
      'card-eclipse',
      'card-aurora',
      'card-obsidian',
      'card-ember',
      'card-frost',
      'card-verdant',
      'profile-title',
      'profile-badge',
      'profile-accent',
      'profile-bio',
      'profile-showcase',
      'profile-spotlight',
      'emoji-slot',
      'sticker-slot',
      'voice-room',
    ],
    text: 'Every card, every upgrade, an emoji, a sticker and your own voice room. The whole shelf.',
  },

  // --- Server --------------------------------------------------------------
  'emoji-slot': {
    category: 'server',
    kind: 'emoji',
    label: 'Emoji slot',
    price: price(12_000),
    days: null,
    giftable: true,
    count: 1,
    text: 'Add one custom emoji to the server with /inventory emoji.',
  },
  'emoji-pack': {
    category: 'server',
    kind: 'emoji',
    label: 'Emoji pack',
    price: price(50_000),
    days: null,
    giftable: true,
    count: 5,
    text: 'Five emoji slots at once, cheaper than five singles.',
  },
  'sticker-slot': {
    category: 'server',
    kind: 'sticker',
    label: 'Sticker slot',
    price: price(18_000),
    days: null,
    giftable: true,
    count: 1,
    text: 'Add one custom sticker to the server with /inventory sticker.',
  },
  // Cheap on purpose. This is the one item meant to be bought early rather than
  // saved up for, which is also why the channel is swept when it goes quiet —
  // at this price a lot of people will own one, and the voice list still has to
  // stay readable.
  'voice-room': {
    category: 'server',
    kind: 'voice-room',
    label: 'Private voice room',
    price: price(2_000),
    days: null,
    giftable: true,
    text: 'Your own voice channel under VOICE. Rename it, move people in it, set how many can join. Goes quiet for a couple of hours and the channel comes down — the room stays yours, /inventory room builds it back free.',
  },
  'text-room': {
    category: 'server',
    kind: 'text-room',
    label: 'Private text room',
    price: price(55_000),
    days: null,
    giftable: false,
    text: 'Your own text channel that you control who sees. Never deleted automatically — what is said in it stays.',
  },
  // Tamem access was briefly going to be sold here. It is not: the owner hands
  // it out by hand with /tamem allow, because who may teach a bot that repeats
  // what it is taught is a judgement call, not a purchase. So the no-roles rule
  // below holds with no exceptions at all.
  'event-slot': {
    category: 'server',
    kind: 'event',
    label: 'Server event',
    price: price(20_000),
    days: 'once',
    giftable: true,
    text: 'KALLEN schedules one official server event for you, with your title and your time.',
  },
  // The slot is bought outright; it is spending it that goes through the queue,
  // because the owner reads the message before the whole server does.
  'announcement-slot': {
    category: 'server',
    kind: 'announce',
    label: 'Announcement',
    price: price(30_000),
    days: 'once',
    giftable: false,
    text: 'One message of yours posted in #announcements. Spend it with /request announcement — the owner reads it first.',
  },

  // --- Robux ---------------------------------------------------------------
  // Fulfilled by hand. See requests.js for the escrow: the coins are held the
  // moment the request opens and only actually spent when the owner completes
  // it, so nobody can request a pack and then spend the same coins on a card.
  'robux-400': {
    category: 'robux',
    kind: 'request',
    label: '400 Robux',
    price: price(50_000),
    days: null,
    approval: true,
    giftable: false,
    robux: 400,
    text: 'About USD 5 of Robux.',
  },
  'robux-800': {
    category: 'robux',
    kind: 'request',
    label: '800 Robux',
    price: price(95_000),
    days: null,
    approval: true,
    giftable: false,
    robux: 800,
    text: 'About USD 10 of Robux. Cheaper per Robux than the 400 pack.',
  },
  'robux-1700': {
    category: 'robux',
    kind: 'request',
    label: '1,700 Robux',
    price: price(185_000),
    days: null,
    approval: true,
    giftable: false,
    robux: 1_700,
    text: 'About USD 20 of Robux.',
  },
  'robux-4500': {
    category: 'robux',
    kind: 'request',
    label: '4,500 Robux',
    price: price(440_000),
    days: null,
    approval: true,
    giftable: false,
    robux: 4_500,
    text: 'About USD 50 of Robux. The best rate in the shop.',
  },

  // --- Nitro ---------------------------------------------------------------
  // All three need approval. The original plan had the two small ones going
  // through automatically, but the owner has to sit down and send the gift by
  // hand either way — charging first and asking later is how a member ends up
  // out of pocket with nothing to show for it.
  'nitro-basic': {
    category: 'nitro',
    kind: 'request',
    label: 'Nitro Basic, 1 month',
    price: price(30_000),
    days: null,
    approval: true,
    giftable: false,
    text: 'One month of Nitro Basic, gifted to you.',
  },
  'nitro-1m': {
    category: 'nitro',
    kind: 'request',
    label: 'Nitro, 1 month',
    price: price(95_000),
    days: null,
    approval: true,
    giftable: false,
    text: 'One month of full Nitro, gifted to you.',
  },
  'nitro-3m': {
    category: 'nitro',
    kind: 'request',
    label: 'Nitro, 3 months',
    price: price(260_000),
    days: null,
    approval: true,
    giftable: false,
    text: 'Three months of full Nitro. Cheaper per month than buying it three times.',
  },
};

/** What a bundle would cost bought piece by piece. */
function worth(id) {
  const item = ITEMS[id];
  if (!item?.grants) return item?.price ?? 0;
  return item.grants.reduce((sum, child) => sum + (ITEMS[child]?.price ?? 0), 0);
}

const byCategory = (name) => Object.entries(ITEMS).filter(([, i]) => i.category === name);

/** How long an item lasts, in words. */
function lifetime(item) {
  if (item.days === 'once') return 'one use';
  if (item.days === null) return 'permanent';
  return `${item.days} days`;
}

/**
 * The guide the owner sees when quoting an in-game item or a custom Robux
 * amount. It is the Robux anchor and nothing else, so a quote can never drift
 * away from what the packs above cost.
 */
const quoteFor = (robux) => Math.round((robux * COINS_PER_ROBUX) / 100) * 100;

module.exports = {
  ITEMS,
  CATEGORIES,
  SCALE,
  COINS_PER_ROBUX,
  worth,
  byCategory,
  lifetime,
  quoteFor,
};
