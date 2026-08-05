'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Tamem's memory.
 *
 * SQLite, through node:sqlite — built into Node since 22 and unflagged since
 * 23.4, so this adds no dependency, no native build step and nothing to npm
 * install. That matters: the server has 2 GB for six bots, and a native module
 * would want a compiler in the image.
 *
 * It is on disk on purpose. Every other bot in this repo keeps its whole state
 * in memory as JSON, which is right for a few hundred members but wrong for a
 * word model that grows with every sentence anyone types. SQLite reads what a
 * query needs and leaves the rest on the disk, so Tamem's resident memory stays
 * flat no matter how much it has learned.
 */

const FILE = path.join(__dirname, '..', 'data', 'tamem.db');

let db = null;

/** Throws with something readable if node:sqlite is not there. */
function open() {
  if (db) return db;

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch (err) {
    throw new Error(
      `node:sqlite is unavailable on Node ${process.version}. Tamem needs Node 22 or newer — the Docker image is node:24-alpine, which has it. (${err.message})`,
    );
  }

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  db = new DatabaseSync(FILE);

  // WAL survives an unclean stop far better than the default journal, which
  // matters when the whole container is restarted to update a different bot.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  // Roughly 8 MB of page cache. The default would happily take far more than
  // Tamem's share of a 2 GB box.
  db.exec('PRAGMA cache_size = -8000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      word      TEXT PRIMARY KEY,
      frequency INTEGER NOT NULL DEFAULT 1,
      starts    INTEGER NOT NULL DEFAULT 0,
      ends      INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS word_pairs (
      prev_word TEXT NOT NULL,
      next_word TEXT NOT NULL,
      count     INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (prev_word, next_word)
    );
    CREATE INDEX IF NOT EXISTS idx_pairs_prev ON word_pairs(prev_word);

    -- Which words a member actually uses, for "/tamem user:".
    CREATE TABLE IF NOT EXISTS user_words (
      user_id TEXT NOT NULL,
      word    TEXT NOT NULL,
      count   INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, word)
    );

    -- Deliberately NOT the message text. See the note in README.md: Tamem
    -- needs the counts, not a searchable archive of everything anyone said.
    CREATE TABLE IF NOT EXISTS messages_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT,
      channel_id TEXT,
      words      INTEGER,
      at         INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_log_at ON messages_log(at);

    CREATE TABLE IF NOT EXISTS blacklist (
      word   TEXT PRIMARY KEY,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS channel_settings (
      channel_id      TEXT PRIMARY KEY,
      enabled         INTEGER NOT NULL DEFAULT 1,
      response_chance INTEGER NOT NULL DEFAULT 15
    );

    -- Who the owner has approved. This is the whole access model: Tamem reads
    -- and answers these people and nobody else. It is a table rather than a
    -- Discord role because it is the thing that must not be wrong — a role can
    -- be handed out by any admin with Manage Roles, and this decides whose
    -- words end up in the model.
    CREATE TABLE IF NOT EXISTS allowlist (
      user_id    TEXT PRIMARY KEY,
      approved_by TEXT,
      approved_at INTEGER,
      note       TEXT
    );

    -- Per member: interactions, phrases taught, the daily bonus marker.
    CREATE TABLE IF NOT EXISTS people (
      user_id     TEXT PRIMARY KEY,
      replies     INTEGER NOT NULL DEFAULT 0,
      taught      INTEGER NOT NULL DEFAULT 0,
      last_bonus  TEXT
    );
  `);

  return db;
}

/** Prepared statements are cached — these run on every message. */
const cache = new Map();
function q(sql) {
  if (!cache.has(sql)) cache.set(sql, open().prepare(sql));
  return cache.get(sql);
}

const run = (sql, ...args) => q(sql).run(...args);
const get = (sql, ...args) => q(sql).get(...args);
const all = (sql, ...args) => q(sql).all(...args);

/** Everything in one transaction, so a half-learned sentence cannot happen. */
function transact(fn) {
  const handle = open();
  handle.exec('BEGIN');
  try {
    const out = fn();
    handle.exec('COMMIT');
    return out;
  } catch (err) {
    handle.exec('ROLLBACK');
    throw err;
  }
}

function close() {
  if (!db) return;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
  } catch {
    /* shutting down anyway */
  }
  cache.clear();
  db = null;
}

const fileSize = () => {
  try {
    return fs.statSync(FILE).size;
  } catch {
    return 0;
  }
};

module.exports = { open, q, run, get, all, transact, close, fileSize, FILE };
