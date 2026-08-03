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
        'If you think this is wrong, reply in the support channel.',
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

  const message = await target
    .send(
      [
        `**Report about ${accused}**`,
        `From: ${reporter}`,
        `Reason: ${reason}`,
        link ? `Message: ${link}` : 'No message link given.',
      ].join('\n'),
    )
    .catch(() => null);

  if (message) {
    await message.startThread({ name: `Report: ${accused.username}`.slice(0, 90) }).catch(() => {});
  }
  return Boolean(message);
}

module.exports = { warn, timeout, clearWarnings, report, log, TIMEOUT_AT, BAN_AT };
