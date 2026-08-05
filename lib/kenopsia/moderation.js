'use strict';

const store = require('./store');
const { CHANNELS } = require('./blueprint');

// Escalation ladder from the rules channel, so the posted rules stay true.
const TIMEOUT_AT = 3;
const BAN_AT = 5;
const TIMEOUT_MS = 24 * 60 * 60_000;
const BAN_DELETE_SECONDS = 0;

function channel(guild, name) {
  const found = guild.channels.cache.find((c) => c.name === name);
  return found?.isTextBased() ? found : null;
}

/** Every action ends up in mod-log, in one line, in plain words. */
async function log(guild, text) {
  const target = channel(guild, CHANNELS.modLog);
  if (target) await target.send(`\`${new Date().toISOString().slice(0, 16)}Z\` ${text}`).catch(() => {});
}

/**
 * Warns a member and applies the escalation the rules promise.
 * Returns { count, action } where action is null, 'timeout' or 'ban'.
 */
async function warn(guild, target, moderator, reason) {
  const record = store.member(guild.id, target.id);
  record.warnings.push({ at: Date.now(), by: moderator.id, reason });
  store.save();

  const count = record.warnings.length;
  let action = null;
  const member = await guild.members.fetch(target.id).catch(() => null);

  if (count >= BAN_AT) {
    action = 'ban';
    await guild.members
      .ban(target.id, { reason: `${count} warnings. Last: ${reason}`, deleteMessageSeconds: BAN_DELETE_SECONDS })
      .catch(() => {
        action = null;
      });
  } else if (count >= TIMEOUT_AT && member) {
    action = 'timeout';
    await member.timeout(TIMEOUT_MS, `${count} warnings. Last: ${reason}`).catch(() => {
      action = null;
    });
  }

  await log(
    guild,
    `**Warning ${count}** for ${target.tag} by ${moderator.tag}: ${reason}` +
      (action === 'timeout' ? ' — 24 hour timeout applied.' : '') +
      (action === 'ban' ? ' — banned for 7 days worth of warnings.' : ''),
  );

  // Tell the member what happened. Blocked DMs are common, so failure is fine.
  await target
    .send(
      [
        `You got a warning in ${guild.name}.`,
        `Reason: ${reason}`,
        `That is warning ${count}. At ${TIMEOUT_AT} you get a 24 hour timeout, at ${BAN_AT} a ban.`,
        'If you think this is wrong, send `/report` with what happened and leave the user field empty. A moderator will read it and can open a private room to talk it through.',
      ].join('\n'),
    )
    .catch(() => {});

  return { count, action };
}

async function timeout(guild, target, minutes, moderator, reason) {
  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) return false;
  const ok = await member.timeout(minutes * 60_000, reason).then(() => true).catch(() => false);
  if (ok) await log(guild, `**Timeout** ${minutes} min for ${target.tag} by ${moderator.tag}: ${reason}`);
  return ok;
}

async function clearWarnings(guild, target, moderator) {
  const record = store.member(guild.id, target.id);
  const had = record.warnings.length;
  record.warnings = [];
  store.save();
  await log(guild, `**Warnings cleared** for ${target.tag} by ${moderator.tag} (${had} removed).`);
  return had;
}

/** A member report. Goes to the staff channel with a link back to the message. */
async function report(guild, reporter, accused, reason, link) {
  const target = channel(guild, CHANNELS.report) ?? channel(guild, CHANNELS.modChat);
  if (!target) return false;

  // No accused is normal: bot problems and appeals name nobody.
  const message = await target
    .send(
      [
        accused ? `**Report about ${accused}**` : '**Report — nobody named**',
        `From: ${reporter}`,
        `Reason: ${reason}`,
        link ? `Message: ${link}` : 'No message link given.',
      ].join('\n'),
    )
    .catch(() => null);

  if (message) {
    const name = accused ? `Report: ${accused.username}` : `Report from ${reporter.username}`;
    await message.startThread({ name: name.slice(0, 90) }).catch(() => {});
  }
  return Boolean(message);
}

// --- deleting history --------------------------------------------------------

/**
 * Discord will only bulk delete messages younger than 14 days. That is a hard
 * API rule, not something a bot can work around: older messages can only be
 * removed one at a time, at approximately one per second, which for a busy
 * channel means hours. A minute of margin keeps a message that ages out
 * mid-request from failing the whole batch.
 */
const BULK_MAX_AGE_MS = 14 * 86_400_000 - 60_000;

/**
 * Deletes recent messages. Returns what it managed and what it could not.
 *
 * Pinned messages are kept unless asked otherwise — the leaderboard, the rules
 * and the channel templates are all pinned, and losing those to a routine
 * cleanup is a bad afternoon.
 */
async function purge(channel, { limit, userId = null, includePinned = false }) {
  let considered = 0;
  let deleted = 0;
  let tooOld = 0;
  let pinned = 0;
  let before;

  while (considered < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    before = batch.last().id;

    let candidates = [...batch.values()];
    if (userId) candidates = candidates.filter((m) => m.author.id === userId);
    if (!includePinned) {
      const keep = candidates.filter((m) => m.pinned).length;
      pinned += keep;
      candidates = candidates.filter((m) => !m.pinned);
    }
    candidates = candidates.slice(0, limit - considered);
    considered += candidates.length;
    if (!candidates.length) continue;

    const now = Date.now();
    const young = candidates.filter((m) => now - m.createdTimestamp < BULK_MAX_AGE_MS);
    tooOld += candidates.length - young.length;

    // bulkDelete refuses a single message, so that case deletes directly.
    if (young.length === 1) {
      const ok = await young[0].delete().then(() => true).catch(() => false);
      if (ok) deleted += 1;
    } else if (young.length > 1) {
      const done = await channel.bulkDelete(young, true).catch(() => null);
      deleted += done?.size ?? 0;
    }
  }

  return { deleted, tooOld, pinned };
}

/**
 * Moves the bits of state that are keyed by channel id onto the replacement.
 *
 * Almost everything in this repo finds channels by name, which is why a wipe is
 * survivable at all. These two are the exceptions.
 */
function handover(guild, oldId, newId, name) {
  const state = store.guild(guild.id).state;

  // The pinned leaderboard message went with the old channel.
  if (name === CHANNELS.leaderboard && state.leaderboardMessageId) {
    state.leaderboardMessageId = null;
    store.save();
  }

  // Tamem keys its per-channel switch by id, so without this a wiped channel
  // would silently go quiet. Skipped entirely when Tamem was never set up, so
  // this cannot create an empty database as a side effect.
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    if (!fs.existsSync(path.join(__dirname, '..', '..', 'Tamem', 'data', 'tamem.db'))) return;

    const tamem = require('../../Tamem/lib/settings');
    const previous = tamem.channel(oldId);
    if (!previous.enabled) return;
    tamem.setChannel(newId, { enabled: true, chance: previous.chance });
    tamem.setChannel(oldId, { enabled: false });
  } catch (err) {
    console.error('Could not move Tamem\'s channel setting after a wipe:', err.message);
  }
}

/**
 * Deletes a channel's entire history, however old.
 *
 * This copies the channel — name, topic, permissions, slowmode, category and
 * position — and deletes the original. It is the only way to remove messages
 * older than 14 days without deleting them one at a time for hours, and it is
 * what every serious moderation bot does.
 *
 * The channel keeps its name and settings but gets a NEW id. Anything that
 * remembered the old id is fixed up in handover().
 */
async function wipe(channel, moderator) {
  if (!channel?.isTextBased() || channel.isThread()) {
    return { ok: false, message: 'That only works on a normal text channel.' };
  }
  if (channel.name === CHANNELS.modLog) {
    return {
      ok: false,
      message:
        'Not mod-log. It is the record of what moderators did, including this, and a log a moderator can quietly erase is not a log. Delete it by hand in Discord if you really mean it.',
    };
  }

  const { position, name, id: oldId } = channel;

  const fresh = await channel.clone({ reason: `History wiped by ${moderator.tag}` }).catch(() => null);
  if (!fresh) {
    return { ok: false, message: 'I could not copy the channel — I probably lack Manage Channels. Nothing was deleted.' };
  }

  const removed = await channel.delete(`History wiped by ${moderator.tag}`).then(() => true).catch(() => false);
  if (!removed) {
    // Never leave two copies behind: put it back the way it was.
    await fresh.delete('Rolling back a wipe that could not finish').catch(() => {});
    return { ok: false, message: 'I made a copy but could not delete the original, so I undid it. Nothing changed.' };
  }

  await fresh.setPosition(position).catch(() => {});
  handover(fresh.guild, oldId, fresh.id, name);

  await log(fresh.guild, `**History wiped** in #${name} by ${moderator.tag} — every message, all ages.`);
  return { ok: true, channel: fresh };
}

module.exports = { warn, timeout, clearWarnings, report, log, purge, wipe, TIMEOUT_AT, BAN_AT };
