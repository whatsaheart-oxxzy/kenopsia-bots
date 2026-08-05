'use strict';

/**
 * Turning a Discord message into something safe to learn from.
 *
 * A Markov bot says its training data back to the room in rearranged form.
 * That is the whole appeal and also the whole risk: anything that goes in can
 * come back out, in front of everyone, weeks later and out of context. So the
 * filtering here is deliberately blunt. Whatever survives it is only ever
 * ordinary words.
 */

/**
 * Channels Tamem never reads, whatever the settings say.
 *
 * These are where people report each other, appeal bans, verify accounts and
 * introduce themselves. Support channels hold complaints about named members;
 * introductions hold ages, countries and real names. None of it should ever
 * come back out of a chat bot, so the denylist is in code and not a setting an
 * admin can switch off by accident.
 */
const NEVER_LEARN = new Set([
  'verify',
  'report',
  'support',
  'appeals',
  'mod-chat',
  'mod-log',
  'introductions',
  'marketplace',
  'shop-requests',
]);

const STRIP = [
  [/```[\s\S]*?```/g, ' '], // code blocks
  [/`[^`]*`/g, ' '], // inline code
  [/https?:\/\/\S+/gi, ' '], // links
  [/discord(?:\.gg|app\.com\/invite)\/\S+/gi, ' '], // invites
  [/<@!?\d+>/g, ' '], // user mentions
  [/<@&\d+>/g, ' '], // role mentions
  [/<#\d+>/g, ' '], // channel mentions
  [/<a?:\w+:\d+>/g, ' '], // custom emoji
  [/\|\|[\s\S]*?\|\|/g, ' '], // spoilers
  [/\d{4,}/g, ' '], // long numbers: ids, phone numbers, codes
  [/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{200D}️]/gu, ' '], // emoji
];

/** Strips everything Tamem must not remember, and normalises whitespace. */
function scrub(text) {
  let out = String(text ?? '');
  for (const [pattern, replacement] of STRIP) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Splits into sentences, then each sentence into lowercase words.
 *
 * Punctuation is dropped from the words themselves but the sentence boundary
 * is kept, because that is what lets Tamem learn where a sentence starts and
 * stops. Learning "hello." and "hello" as two different words would just split
 * the model in half for no gain.
 */
function tokenise(text, { caseSensitive = false } = {}) {
  const scrubbed = scrub(text);
  if (!scrubbed) return [];

  return scrubbed
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .split(/\s+/)
        .map((word) => {
          const bare = word.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
          return caseSensitive ? bare : bare.toLowerCase();
        })
        .filter((word) => word.length > 0 && word.length <= 32),
    )
    .filter((sentence) => sentence.length >= 2);
}

/** Sentence case, and a full stop if it stopped mid-air. */
function present(words) {
  if (!words.length) return '';
  const text = words.join(' ');
  const cased = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

/**
 * Whether a message is worth learning from at all.
 * Returns a reason string when it is not, so callers can explain themselves.
 */
function rejects(message, config) {
  if (config.ignore_bots && message.author?.bot) return 'bot';
  if (config.ignore_commands && /^[/!.,;$%&>-]/.test(message.content ?? '')) return 'command';
  if (NEVER_LEARN.has(message.channel?.name)) return 'private channel';
  if (message.channel?.nsfw) return 'nsfw channel';
  if ((message.content ?? '').length > 500) return 'too long';
  return null;
}

module.exports = { NEVER_LEARN, scrub, tokenise, present, rejects };
