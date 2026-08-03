'use strict';

/**
 * Channels that take a slash command and nothing else. Anything typed in one of
 * them is deleted, whoever typed it — member, moderator or the owner. A rule the
 * people enforcing it can ignore stops being a rule.
 *
 * Threads are handled per channel, and the difference matters:
 *
 *   - #support and #verify guard their threads too. Both commands answer
 *     privately and post nothing (`/verify` is ephemeral end to end, see
 *     roblox-verify/commands/verify.js:31), so a thread there could only be
 *     someone routing around the rule.
 *   - #q-and-a does the opposite. `/ask` opens a thread per question and the
 *     answers live inside it — guarding those would delete the entire point of
 *     the channel. Only the channel itself stays clean.
 *
 * The bot's own messages are left alone everywhere. That is not an exemption —
 * it keeps each channel's opening post from `/kenopsia setup` alive, and it
 * keeps `/ask`'s question post inside its thread. The caller in runtime.js has
 * already dropped anything written by a bot before this runs.
 */

const { CHANNELS } = require('./blueprint');

// How long the reminder stays before it removes itself.
const NOTICE_MS = 15_000;
// One reminder per member per minute, so five pasted lines produce one hint.
const NOTICE_COOLDOWN_MS = 60_000;

const GUARDED = {
  [CHANNELS.support]: {
    guardThreads: true,
    notice: [
      'This channel takes reports through `/report` only — anything typed here is removed automatically.',
      'Type `/report` and fill in `reason:`. Only the staff sees it. General questions go in q-and-a.',
    ].join('\n'),
  },

  [CHANNELS.verify]: {
    guardThreads: true,
    notice: [
      'This channel takes `/verify` only — anything typed here is removed automatically.',
      'Type `/verify username:` with your Roblox username. The whole thing is private, only you see it.',
    ].join('\n'),
  },

  [CHANNELS.qAndA]: {
    // The threads are the channel's whole purpose. Never guard them.
    guardThreads: false,
    notice: [
      'Ask with `/ask question:` — anything typed straight into this channel is removed automatically.',
      'Your question becomes its own thread, and everybody answers in there. That keeps the list readable and lets people find an answer that already exists.',
    ].join('\n'),
  },
};

const lastNotice = new Map(); // `${guildId}:${userId}` -> timestamp

/** The guard config covering this channel, or undefined if it is not guarded. */
function configFor(channel) {
  if (!channel) return undefined;

  const own = GUARDED[channel.name];
  if (own) return own;

  if (!channel.isThread?.()) return undefined;
  const parent = GUARDED[channel.parent?.name];
  return parent?.guardThreads ? parent : undefined;
}

const isGuardedChannel = (channel) => Boolean(configFor(channel));

/** Posts the reminder and takes it away again, at most once a minute per member. */
async function remind(message, config) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (lastNotice.get(key) ?? 0) < NOTICE_COOLDOWN_MS) return;
  lastNotice.set(key, now);

  const notice = await message.channel
    .send({
      content: `<@${message.author.id}> ${config.notice}`,
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
 * and leave no trace anyone could point at. Answers inside a q-and-a thread are
 * not affected and earn normally; helping people is worth coins.
 */
async function enforce(message) {
  const config = configFor(message.channel);
  if (!config) return false;

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

  await remind(message, config).catch(() => {});
  return true;
}

module.exports = { enforce, isGuardedChannel };
