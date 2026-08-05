'use strict';

const db = require('./db');

/**
 * Tamem's settings, and who is allowed to talk to him.
 *
 * Defaults live here; anything an admin changes is written to the config table
 * and wins. Reads go through a small cache because the message handler asks for
 * these on literally every message in the server.
 */

const DEFAULTS = {
  response_chance: 15, // percent, per channel unless overridden
  min_words: 3,
  max_words: 25,
  learning_enabled: true,
  learning_chance: 100,
  ignore_bots: true,
  ignore_commands: true,
  cooldown_seconds: 5,
  max_message_age_days: 30,
  punctuation_keep: true,
  case_sensitive: false,
  auto_cleanup_interval_hours: 24,
  prune_below_count: 2, // pairs seen fewer times than this go in the cleanup
  max_db_mb: 100,
};

/**
 * A visible marker for approved members. It is NOT the gate — the allowlist
 * table is. The role is only so people can see who Tamem talks to, and it is
 * kept in sync best-effort: if Discord refuses to add it, access still works.
 *
 * This matters because a role can be handed out by anyone with Manage Roles,
 * and approval decides whose words go into the model. That decision belongs to
 * the owner alone, not to whoever happens to hold a permission.
 */
const ACCESS_ROLE = 'Tamem Access';

const STAFF = ['Administrator', 'Moderator'];

let cache = null;

function load() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  for (const row of db.all('SELECT key, value FROM config')) {
    const fallback = DEFAULTS[row.key];
    if (typeof fallback === 'number') cache[row.key] = Number(row.value);
    else if (typeof fallback === 'boolean') cache[row.key] = row.value === 'true';
    else cache[row.key] = row.value;
  }
  return cache;
}

const all = () => load();
const get = (key) => load()[key];

function set(key, value) {
  db.run(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    String(value),
  );
  cache = null;
  return get(key);
}

// --- per channel -------------------------------------------------------------

/**
 * Channels are opt-IN. A bot that starts talking in every channel the moment
 * it joins is a bot that gets muted on day one.
 */
function channel(channelId) {
  const row = db.get('SELECT enabled, response_chance FROM channel_settings WHERE channel_id = ?', channelId);
  if (row) return { enabled: row.enabled === 1, chance: row.response_chance };
  return { enabled: false, chance: get('response_chance') };
}

function setChannel(channelId, { enabled, chance }) {
  const current = channel(channelId);
  db.run(
    `INSERT INTO channel_settings (channel_id, enabled, response_chance) VALUES (?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET enabled = excluded.enabled, response_chance = excluded.response_chance`,
    channelId,
    (enabled ?? current.enabled) ? 1 : 0,
    chance ?? current.chance,
  );
  return channel(channelId);
}

const enabledChannels = () =>
  db.all('SELECT channel_id, response_chance FROM channel_settings WHERE enabled = 1');

// --- who may use him ---------------------------------------------------------

/**
 * The allowlist. Approved by the owner, one member at a time.
 *
 * Tamem repeats what he is taught, rearranged, in front of everyone. Who gets
 * to teach him is therefore a judgement about trust, and it is made by a person
 * rather than bought, earned or inherited from a role.
 */
const isApproved = (userId) => Boolean(userId && db.get('SELECT user_id FROM allowlist WHERE user_id = ?', userId));

function approve(userId, byUserId, note = null) {
  if (isApproved(userId)) return false;
  db.run(
    'INSERT INTO allowlist (user_id, approved_by, approved_at, note) VALUES (?, ?, ?, ?)',
    userId,
    byUserId,
    Date.now(),
    note,
  );
  return true;
}

function revoke(userId) {
  if (!isApproved(userId)) return false;
  db.run('DELETE FROM allowlist WHERE user_id = ?', userId);
  return true;
}

const approved = () => db.all('SELECT user_id, approved_by, approved_at, note FROM allowlist ORDER BY approved_at');

const isStaff = (member) => Boolean(member?.roles?.cache?.some((r) => STAFF.includes(r.name)));

/**
 * The single gate, used for both talking and learning.
 *
 * Staff are NOT on it by default. Being a moderator is a job, not a decision
 * that your messages should go into a chat bot — if the owner wants a moderator
 * in, they approve them like anyone else.
 */
const canUse = (member) => isApproved(member?.id);

module.exports = {
  DEFAULTS,
  ACCESS_ROLE,
  all,
  get,
  set,
  channel,
  setChannel,
  enabledChannels,
  isApproved,
  approve,
  revoke,
  approved,
  isStaff,
  canUse,
};
