'use strict';

/** Small shared helpers. Numbers in this shop get large, so they all get commas. */

const coins = (n) => Number(n ?? 0).toLocaleString('en-US');

const DAY = 86_400_000;

/** "3 days", "in 4 hours", "expired" — short enough to sit at the end of a line. */
function remaining(expires) {
  if (!expires) return 'permanent';
  const left = expires - Date.now();
  if (left <= 0) return 'expired';
  if (left < 3_600_000) return `${Math.max(1, Math.round(left / 60_000))}m left`;
  if (left < DAY) return `${Math.round(left / 3_600_000)}h left`;
  return `${Math.round(left / DAY)}d left`;
}

/** Discord renders this as a local timestamp for whoever is reading it. */
const when = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

/** #RRGGBB or RRGGBB to an integer, or null when it is not a colour. */
function hex(input) {
  const cleaned = String(input ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 16);
}

/** Keeps member-supplied text out of the markdown and off @everyone. */
function clean(text, limit) {
  return String(text ?? '')
    .replace(/[`*_~|\\]/g, '')
    .replace(/@(everyone|here)/gi, '@​$1')
    .replace(/<@&?!?\d+>/g, '')
    .trim()
    .slice(0, limit);
}

module.exports = { coins, remaining, when, hex, clean, DAY };
