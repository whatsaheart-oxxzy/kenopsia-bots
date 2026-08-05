'use strict';

const store = require('./store');
const wallet = require('./wallet');
const config = require('./config');
const catalog = require('./catalog');
const { coins } = require('./format');

/**
 * The approval queue, and the escrow that makes it safe.
 *
 * Robux, Nitro and in-game items are sent by hand, so a request can sit here
 * for days. The coins leave the member's balance the moment the price is known
 * and are held on the request itself. That is the whole point: without it a
 * member could open a 50,000 coin Robux request and spend the same 50,000 on a
 * card before the owner ever looked at the queue.
 *
 *   fixed price   open -> pending -> approved -> completed
 *   quoted price  open -> pending -> quoted -> (member pays) -> approved -> completed
 *
 * Every exit that is not `completed` gives the coins back.
 */

const TYPES = {
  robux: 'Robux',
  nitro: 'Discord Nitro',
  item: 'In-game Roblox item',
  custom: 'Server customisation',
  announcement: 'Announcement',
};

const ok = (message, request) => ({ ok: true, message, request });
const fail = (message) => ({ ok: false, message });

/** Hours left on the one-a-day request cooldown, or 0. */
function cooldown(guildId, userId) {
  const record = store.member(guildId, userId);
  const left = record.lastRequestAt + config.REQUEST_COOLDOWN_MS - Date.now();
  return left > 0 ? Math.ceil(left / 3_600_000) : 0;
}

/**
 * Opens a request. `price` is null when the owner has to quote it, in which
 * case nothing is held yet — there is no number to hold.
 */
function open(guildId, userId, { type, itemId = null, price = null, summary, gamepass = null, declared18 = false }) {
  const waitHours = cooldown(guildId, userId);
  if (waitHours) return fail(`You have already opened a request today. Try again in ${waitHours} hour(s).`);

  const duplicate = store
    .requests(guildId, (r) => r.user === userId && ['pending', 'quoted', 'approved'].includes(r.status))
    .length;
  if (duplicate >= 3) return fail('You already have three requests open. Wait for those to close first.');

  if (price !== null && !wallet.hold(guildId, userId, price)) {
    return fail(`That costs ${coins(price)} coins and you have ${coins(wallet.balance(guildId, userId))}.`);
  }

  const request = {
    id: store.nextRequestId(guildId),
    guild: guildId,
    user: userId,
    type,
    typeLabel: TYPES[type] ?? type,
    itemId,
    price,
    held: price ?? 0,
    summary,
    gamepass,
    declared18,
    status: 'pending',
    createdAt: Date.now(),
    approvedAt: null,
    completedAt: null,
    reason: null,
    note: null,
  };

  const record = store.member(guildId, userId);
  record.lastRequestAt = Date.now();
  store.putRequest(request);
  store.save();

  return ok(
    price === null
      ? `Request #${request.id} is open. The owner will set a price and message you.`
      : `Request #${request.id} is open and **${coins(price)}** coins are held. You get them back if it is denied.`,
    request,
  );
}

/** Owner puts a number on a request that had none. */
function quote(id, price) {
  const request = store.getRequest(id);
  if (!request) return fail('No request with that id.');
  if (request.status !== 'pending') return fail(`That request is already ${request.status}.`);
  if (request.price !== null) return fail('That request already has a price. Approve or deny it instead.');

  request.price = price;
  request.status = 'quoted';
  store.putRequest(request);
  return ok(`Quoted #${id} at ${coins(price)} coins. The member has been told to pay.`, request);
}

/** Member accepts a quote. This is where the coins are actually held. */
function pay(id, userId) {
  const request = store.getRequest(id);
  if (!request) return fail('No request with that id.');
  if (request.user !== userId) return fail('That is not your request.');
  if (request.status !== 'quoted') return fail(`That request is ${request.status}, there is nothing to pay.`);

  if (!wallet.hold(request.guild, userId, request.price)) {
    return fail(
      `That request was quoted at ${coins(request.price)} coins and you have ${coins(wallet.balance(request.guild, userId))}. It stays open — pay when you have enough.`,
    );
  }

  request.held = request.price;
  request.status = 'approved';
  request.approvedAt = Date.now();
  store.putRequest(request);
  return ok(`Paid. **${coins(request.price)}** coins are held until the owner sends it.`, request);
}

function approve(id) {
  const request = store.getRequest(id);
  if (!request) return fail('No request with that id.');
  if (request.status === 'approved') return fail('That request is already approved.');
  if (request.status !== 'pending') return fail(`That request is ${request.status}.`);
  if (request.price === null) return fail(`Quote it first: \`/kallen quote id:${id} coins:<n>\`.`);

  request.status = 'approved';
  request.approvedAt = Date.now();
  store.putRequest(request);
  return ok(`#${id} approved. Send it, then close it with \`/kallen complete id:${id}\`.`, request);
}

/** Any exit that is not completion hands the coins back. */
function close(request, status, reason) {
  if (request.held > 0) {
    wallet.release(request.guild, request.user, request.held);
    request.refunded = request.held;
    request.held = 0;
  }
  request.status = status;
  request.reason = reason ?? null;
  request.completedAt = Date.now();
  store.putRequest(request);
  return request;
}

function deny(id, reason) {
  const request = store.getRequest(id);
  if (!request) return fail('No request with that id.');
  if (!['pending', 'quoted', 'approved'].includes(request.status)) {
    return fail(`That request is ${request.status} and cannot be denied.`);
  }
  const refunded = request.held;
  close(request, 'denied', reason);
  return ok(refunded ? `#${id} denied and ${coins(refunded)} coins refunded.` : `#${id} denied.`, request);
}

/** The coins were already taken when they were held; completion just keeps them. */
function complete(id, note) {
  const request = store.getRequest(id);
  if (!request) return fail('No request with that id.');
  if (request.status !== 'approved') return fail(`That request is ${request.status}, not approved.`);

  request.status = 'completed';
  request.completedAt = Date.now();
  request.held = 0;
  request.note = note ?? null;

  const record = store.member(request.guild, request.user);
  record.spent = (record.spent ?? 0) + (request.price ?? 0);
  store.putRequest(request);

  return ok(`#${id} closed as completed.`, request);
}

/** Reverses a completed request. The only way coins come back after fulfilment. */
function refund(id, reason) {
  const request = store.getRequest(id);
  if (!request) return fail('No request with that id.');
  if (request.status !== 'completed') return fail(`Only a completed request can be refunded — that one is ${request.status}.`);

  wallet.release(request.guild, request.user, request.price ?? 0);
  const record = store.member(request.guild, request.user);
  record.spent = Math.max(0, (record.spent ?? 0) - (request.price ?? 0));
  request.status = 'refunded';
  request.reason = reason ?? null;
  request.refunded = request.price ?? 0;
  store.putRequest(request);

  return ok(`#${id} refunded — ${coins(request.price ?? 0)} coins returned.`, request);
}

/**
 * Closes anything nobody touched in a week and gives the coins back.
 *
 * Only `pending` and `quoted` expire. An `approved` request means the owner
 * said yes and may already have sent the Robux, so expiring it would refund
 * something that was genuinely delivered.
 */
function sweep(guildId) {
  const cutoff = Date.now() - config.REQUEST_EXPIRY_MS;
  const stale = store.requests(guildId, (r) => ['pending', 'quoted'].includes(r.status) && r.createdAt < cutoff);
  for (const request of stale) close(request, 'expired', 'Nobody acted on it for seven days.');
  return stale;
}

/** The line a member sees for one of their own requests. */
function line(request) {
  const price = request.price === null ? 'awaiting quote' : `${coins(request.price)} coins`;
  const held = request.held > 0 ? ' · held' : '';
  return `\`#${request.id}\` **${request.typeLabel}** — ${request.summary} · ${price} · **${request.status}**${held}`;
}

/** Turns a Robux amount into the coin price, using the catalogue's own anchor. */
const quoteForRobux = (robux) => catalog.quoteFor(robux);

module.exports = {
  TYPES,
  cooldown,
  open,
  quote,
  pay,
  approve,
  deny,
  complete,
  refund,
  sweep,
  line,
  quoteForRobux,
};
