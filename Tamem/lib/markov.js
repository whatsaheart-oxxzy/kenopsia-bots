'use strict';

const db = require('./db');
const settings = require('./settings');
const { tokenise, present } = require('./clean');

/**
 * The chain itself.
 *
 * Tamem stores which word follows which, and how often. To speak, he picks a
 * word that has started a sentence before, then keeps asking "what usually
 * comes after this?" and rolling a weighted die on the answer. Nothing is ever
 * stored as a sentence, so nothing can be repeated back verbatim unless the
 * same run of words happened to be common enough to be rebuilt by chance.
 */

// The blacklist is read on every generated word. It is tiny; keep it in memory.
let blocked = null;
const blacklist = () => (blocked ??= new Set(db.all('SELECT word FROM blacklist').map((r) => r.word)));
const forgetBlacklistCache = () => {
  blocked = null;
};

// --- learning ---------------------------------------------------------------

/**
 * Adds a message to the model. Returns how many pairs it learned.
 * Blacklisted words are dropped along with any pair that touches them, so a
 * blocked word cannot survive in the chain and leak back out later.
 */
function learn(text, userId = null) {
  const config = settings.all();
  const sentences = tokenise(text, { caseSensitive: config.case_sensitive });
  if (!sentences.length) return 0;

  const bad = blacklist();
  let pairs = 0;

  db.transact(() => {
    for (const sentence of sentences) {
      const words = sentence.filter((w) => !bad.has(w));
      if (words.length < 2) continue;

      for (let i = 0; i < words.length; i += 1) {
        const word = words[i];
        const isStart = i === 0 ? 1 : 0;
        const isEnd = i === words.length - 1 ? 1 : 0;

        db.run(
          `INSERT INTO words (word, frequency, starts, ends) VALUES (?, 1, ?, ?)
           ON CONFLICT(word) DO UPDATE SET
             frequency = frequency + 1,
             starts    = starts + ?,
             ends      = ends + ?`,
          word,
          isStart,
          isEnd,
          isStart,
          isEnd,
        );

        if (userId) {
          db.run(
            `INSERT INTO user_words (user_id, word, count) VALUES (?, ?, 1)
             ON CONFLICT(user_id, word) DO UPDATE SET count = count + 1`,
            userId,
            word,
          );
        }

        if (i < words.length - 1) {
          db.run(
            `INSERT INTO word_pairs (prev_word, next_word, count) VALUES (?, ?, 1)
             ON CONFLICT(prev_word, next_word) DO UPDATE SET count = count + 1`,
            word,
            words[i + 1],
          );
          pairs += 1;
        }
      }
    }
  });

  return pairs;
}

/** Counts a message without keeping what it said. */
function log(userId, channelId, wordCount) {
  db.run('INSERT INTO messages_log (user_id, channel_id, words, at) VALUES (?, ?, ?, ?)', userId, channelId, wordCount, Date.now());
}

// --- generation -------------------------------------------------------------

/**
 * Weighted pick. Walks the candidates subtracting weights from a random point
 * in the total, which is the standard way of doing this without building a
 * cumulative table first.
 */
function weighted(rows, weightOf) {
  let total = 0;
  for (const row of rows) total += weightOf(row);
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const row of rows) {
    roll -= weightOf(row);
    if (roll <= 0) return row;
  }
  return rows[rows.length - 1];
}

/** A word that has begun a sentence before, weighted by how often it has. */
function startWord() {
  const rows = db.all('SELECT word, starts FROM words WHERE starts > 0');
  if (!rows.length) return null;
  const bad = blacklist();
  const usable = rows.filter((r) => !bad.has(r.word));
  return weighted(usable, (r) => r.starts)?.word ?? null;
}

/** The words a member actually uses, for style-matching. */
function vocabularyOf(userId) {
  const rows = db.all('SELECT word, count FROM user_words WHERE user_id = ?', userId);
  return new Map(rows.map((r) => [r.word, r.count]));
}

/**
 * Builds one sentence.
 *
 * `style` is a member's vocabulary: words they use get their weight multiplied,
 * so the result leans their way without being limited to only their words —
 * which would usually produce nothing at all.
 */
function attempt({ start = null, style = null } = {}) {
  const config = settings.all();
  const bad = blacklist();

  let word = start ?? startWord();
  if (!word || bad.has(word)) return null;

  const words = [word];

  for (let i = 1; i < config.max_words; i += 1) {
    const rows = db.all('SELECT next_word, count FROM word_pairs WHERE prev_word = ?', word);
    const usable = rows.filter((r) => !bad.has(r.next_word));
    if (!usable.length) break;

    const pick = weighted(usable, (r) => {
      const boost = style?.get(r.next_word);
      return boost ? r.count * (1 + Math.min(9, boost)) : r.count;
    });
    if (!pick) break;

    word = pick.next_word;
    words.push(word);

    // Stop where sentences usually stop. A word that has ended a sentence half
    // the times it appeared should end this one about half the time too.
    if (words.length >= config.min_words) {
      const row = db.get('SELECT frequency, ends FROM words WHERE word = ?', word);
      if (row?.ends && Math.random() < row.ends / row.frequency) break;
    }
  }

  return words;
}

/**
 * Tries a few times to produce something that clears the minimum length.
 * Short chains happen: a rare start word can dead-end immediately.
 */
function generate({ start = null, styleUserId = null, tries = 12 } = {}) {
  const config = settings.all();
  const style = styleUserId ? vocabularyOf(styleUserId) : null;
  if (styleUserId && style.size === 0) return { ok: false, reason: 'unknown-user' };

  if (start) {
    const known = db.get('SELECT word FROM words WHERE word = ?', start.toLowerCase());
    if (!known) return { ok: false, reason: 'unknown-word' };
  }

  let best = null;
  for (let i = 0; i < tries; i += 1) {
    const words = attempt({ start: start?.toLowerCase() ?? null, style });
    if (!words) continue;
    if (words.length >= config.min_words) return { ok: true, text: present(words), words };
    if (!best || words.length > best.length) best = words;
  }

  if (!best) return { ok: false, reason: 'empty' };
  return { ok: true, text: present(best), words: best, thin: true };
}

/**
 * Picks a word out of what someone said to answer with, so a reply is at least
 * about the same thing. Falls back to a free-running sentence.
 */
function replyTo(text) {
  const config = settings.all();
  const sentences = tokenise(text, { caseSensitive: config.case_sensitive });
  const bad = blacklist();

  const candidates = sentences
    .flat()
    .filter((w) => w.length > 3 && !bad.has(w))
    // Prefer words Tamem can actually continue from.
    .filter((w) => db.get('SELECT 1 AS ok FROM word_pairs WHERE prev_word = ? LIMIT 1', w));

  if (candidates.length) {
    const seed = candidates[Math.floor(Math.random() * candidates.length)];
    const out = generate({ start: seed });
    if (out.ok) return out;
  }

  return generate();
}

// --- housekeeping -----------------------------------------------------------

function stats() {
  const words = db.get('SELECT COUNT(*) AS n FROM words')?.n ?? 0;
  const pairs = db.get('SELECT COUNT(*) AS n FROM word_pairs')?.n ?? 0;
  const messages = db.get('SELECT COUNT(*) AS n FROM messages_log')?.n ?? 0;
  const blockedCount = db.get('SELECT COUNT(*) AS n FROM blacklist')?.n ?? 0;
  return { words, pairs, messages, blocked: blockedCount, bytes: db.fileSize() };
}

const popular = (limit = 10) =>
  db.all('SELECT prev_word, next_word, count FROM word_pairs ORDER BY count DESC LIMIT ?', Math.min(25, limit));

/** Which pairs a given sentence could have come from, with their weights. */
function trace(text) {
  const sentences = tokenise(text, { caseSensitive: settings.get('case_sensitive') });
  const out = [];
  for (const sentence of sentences) {
    for (let i = 0; i < sentence.length - 1; i += 1) {
      const row = db.get(
        'SELECT count FROM word_pairs WHERE prev_word = ? AND next_word = ?',
        sentence[i],
        sentence[i + 1],
      );
      out.push({ pair: `${sentence[i]} ${sentence[i + 1]}`, count: row?.count ?? 0 });
    }
  }
  return out;
}

function forget(word) {
  const target = word.toLowerCase();
  const known = db.get('SELECT word FROM words WHERE word = ?', target);
  db.transact(() => {
    db.run('DELETE FROM word_pairs WHERE prev_word = ? OR next_word = ?', target, target);
    db.run('DELETE FROM user_words WHERE word = ?', target);
    db.run('DELETE FROM words WHERE word = ?', target);
  });
  return Boolean(known);
}

function block(word, reason = null) {
  const target = word.toLowerCase();
  if (db.get('SELECT word FROM blacklist WHERE word = ?', target)) return false;
  db.run('INSERT INTO blacklist (word, reason) VALUES (?, ?)', target, reason);
  forgetBlacklistCache();
  // Blocking is retroactive: the word comes out of the model, not just out of
  // future answers.
  forget(target);
  return true;
}

function unblock(word) {
  const target = word.toLowerCase();
  if (!db.get('SELECT word FROM blacklist WHERE word = ?', target)) return false;
  db.run('DELETE FROM blacklist WHERE word = ?', target);
  forgetBlacklistCache();
  return true;
}

const blocklist = () => db.all('SELECT word, reason FROM blacklist ORDER BY word');

function reset() {
  db.transact(() => {
    db.run('DELETE FROM word_pairs');
    db.run('DELETE FROM words');
    db.run('DELETE FROM user_words');
    db.run('DELETE FROM messages_log');
  });
  db.open().exec('VACUUM');
}

/**
 * Daily tidy-up: drop the old log, drop pairs seen once or twice, then drop
 * words nothing points at any more. Runs VACUUM only when the file is actually
 * near the cap, because VACUUM rewrites the whole database.
 */
function cleanup() {
  const config = settings.all();
  const cutoff = Date.now() - config.max_message_age_days * 86_400_000;
  const before = db.fileSize();

  db.transact(() => {
    db.run('DELETE FROM messages_log WHERE at < ?', cutoff);
  });

  const overSized = before > config.max_db_mb * 1024 * 1024;
  if (overSized) {
    db.transact(() => {
      db.run('DELETE FROM word_pairs WHERE count < ?', config.prune_below_count);
      db.run(`DELETE FROM words WHERE word NOT IN (
                SELECT prev_word FROM word_pairs UNION SELECT next_word FROM word_pairs)`);
      db.run(`DELETE FROM user_words WHERE word NOT IN (SELECT word FROM words)`);
    });
    db.open().exec('VACUUM');
  }

  return { before, after: db.fileSize(), pruned: overSized };
}

module.exports = {
  learn,
  log,
  generate,
  replyTo,
  startWord,
  stats,
  popular,
  trace,
  forget,
  block,
  unblock,
  blocklist,
  reset,
  cleanup,
  weighted,
};
