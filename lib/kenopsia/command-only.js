'use strict';

/**
 * Channels that take a slash command and nothing else. Anything typed in one of
 * them is deleted, whoever typed it — member, moderator or the owner. A rule the
 * people enforcing it can ignore stops being a rule.
 *
 * Both commands that feed these channels reply privately and post nothing:
 * `/report` files into the staff report channel, and `/verify` is ephemeral from
 * start to finish (roblox-verify/commands/verify.js:31). So an empty channel is
 * the normal, working state, not a sign that something broke.
 *
 * The bot's own messages are left alone. That is not an exemption — it is what
 * keeps each channel's opening post from `/kenopsia setup` alive. The caller in
 * runtime.js has already dropped anything written by a bot before this runs.
 */

const { CHANNELS } = require('./blueprint');

// How long the reminder stays before it removes itself.
const NOTICE_MS = 15_000;
// One reminder per member per minute, so five pasted lines produce one hint.
const NOTICE_COOLDOWN_MS = 60_000;

const NOTICES = {
  [CHANNELS.support]: [
    'This channel takes reports through `/report` only — anything typed here is removed automatically.',
    'Type `/report` and fill in `reason:`. Only the staff sees it. General questions go in q-and-a.',
  ].join('\n'),

  [CHANNELS.verify]: [
    'This channel takes `/verify` only — anything typed here is removed automatically.',
    'Type `/verify username:` with your Roblox username. The whole thing is private, only you see it.',
  ].join('\n'),
};

const lastNotice = new Map(); // `${guildId}:${userId}` -> timestamp

/**
 * True for a guarded channel and for any thread hanging off one, so a thread
 * cannot be used to route around the rule.
 */
function isGuardedChannel(channel) {
  if (!channel) return false;
  if (Object.hasOwn(NOTICES, channel.name)) return true;
  return Boolean(channel.isThread?.() && channel.parent && Object.hasOwn(NOTICES, channel.parent.name));
}

/** The text for whichever channel this is, following threads up to their parent. */
function noticeFor(channel) {
  return NOTICES[channel.name] ?? NOTICES[channel.parent?.name];
}

/** Posts the reminder and takes it away again, at most once a minute per member. */
async function remind(message) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastNotice.get(key) ?? 0) < NOTICE_COOLDOWN_MS) return;
  lastNotice.set(key, now);

  const text = noticeFor(message.channel);
  if (!text) return;

  const notice = await message.channel
    .send({
      content: `<@${message.author.id}> ${text}`,
      allowedMentions: { users: [message.author.id] },
    })
    .catch(() => null);
  if (!notice) return;

  const timer = setTimeout(() => notice.delete().catch(() => {}), NOTICE_MS);
  timer.unref?.();
}

/**
 * Deletes the message when it does not belong in a command-only channel.
 *
 * Returns true when it removed something, and the caller must then stop: a
 * deleted message may not pay coins, xp or quest progress. Without that, these
 * channels would be the best place in the server to farm — messages that pay out
 * and leave no trace anyone could point at.
 */
async function enforce(message) {
  if (!isGuardedChannel(message.channel)) return false;

  try {
    await message.delete();
  } catch (err) {
    // Missing Access or Missing Permissions: the bot's role cannot delete here.
    // Say so once per message rather than silently letting things through.
    console.error(
      `Command-only guard could not delete a message in #${message.channel.name} — ` +
        'the bot needs Manage Messages in that channel:',
      err.message,
    );
    return false;
  }

  await remind(message).catch(() => {});
  return true;
}

module.exports = { enforce, isGuardedChannel };
