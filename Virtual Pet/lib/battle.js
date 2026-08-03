'use strict';

const pets = require('./pets');
const store = require('./store');
const wallet = require('./wallet');

const COOLDOWN_MS = 30 * 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;
const ENERGY_COST = 5;

const MOVES = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

// guildId:opponentId -> { challenger, at }
const pending = new Map();

const challengeKey = (guildId, userId) => `${guildId}:${userId}`;

function openChallenge(guildId, challengerId, opponentId) {
  pending.set(challengeKey(guildId, opponentId), { challenger: challengerId, at: Date.now() });
}

function takeChallenge(guildId, opponentId) {
  const key = challengeKey(guildId, opponentId);
  const entry = pending.get(key);
  if (!entry) return null;
  pending.delete(key);
  return Date.now() - entry.at > CHALLENGE_TTL_MS ? null : entry;
}

const onCooldown = (pet) => Date.now() - (pet.lastBattle ?? 0) < COOLDOWN_MS;
const cooldownLeft = (pet) => Math.ceil((COOLDOWN_MS - (Date.now() - (pet.lastBattle ?? 0))) / 60_000);

/**
 * Three rounds of rock paper scissors. Level and happiness do not decide the
 * winner outright — they nudge a redraw in the stronger pet's favour, so a
 * level 5 pet can still take a level 40 one on a good day.
 */
function fight(a, b) {
  const edge = (pet, other) =>
    Math.min(0.35, Math.max(-0.35, (pet.level - other.level) * 0.01 + (pet.happiness - other.happiness) * 0.0005));

  const rounds = [];
  let scoreA = 0;
  let scoreB = 0;

  for (let i = 0; i < 3; i += 1) {
    const moveA = MOVES[Math.floor(Math.random() * 3)];
    let moveB = MOVES[Math.floor(Math.random() * 3)];

    if (BEATS[moveA] === moveB && Math.random() < edge(b, a)) {
      moveB = BEATS[moveA] === 'rock' ? 'paper' : BEATS[moveA] === 'paper' ? 'scissors' : 'rock';
    } else if (BEATS[moveB] === moveA && Math.random() < edge(a, b)) {
      moveB = BEATS[moveB];
    }

    let result = 'draw';
    if (BEATS[moveA] === moveB) {
      scoreA += 1;
      result = 'a';
    } else if (BEATS[moveB] === moveA) {
      scoreB += 1;
      result = 'b';
    }
    rounds.push({ moveA, moveB, result });
  }

  return { rounds, scoreA, scoreB };
}

/** Runs the fight, pays out and writes the log entry. */
function resolve(guildId, petA, petB) {
  const { rounds, scoreA, scoreB } = fight(petA, petB);
  const now = Date.now();

  petA.lastBattle = now;
  petB.lastBattle = now;
  petA.energy = pets.clamp(petA.energy - ENERGY_COST);
  petB.energy = pets.clamp(petB.energy - ENERGY_COST);

  let winner = null;
  let loser = null;
  const growth = new Map(); // pet -> the result of addXp, for level announcements

  if (scoreA !== scoreB) {
    [winner, loser] = scoreA > scoreB ? [petA, petB] : [petB, petA];

    winner.wins = (winner.wins ?? 0) + 1;
    loser.losses = (loser.losses ?? 0) + 1;
    winner.happiness = pets.clamp(winner.happiness + 15);
    loser.happiness = pets.clamp(loser.happiness - 10);
    growth.set(winner, pets.addXp(winner, 20, 'battle'));
    growth.set(loser, pets.addXp(loser, 5, 'battle'));
    wallet.earn(guildId, winner.owner, 10);
  } else {
    // A draw still costs energy, so spamming battles is not free.
    growth.set(petA, pets.addXp(petA, 5, 'battle'));
    growth.set(petB, pets.addXp(petB, 5, 'battle'));
  }

  store.logBattle({
    guild: guildId,
    challenger: petA.owner,
    opponent: petB.owner,
    winner: winner?.owner ?? null,
    score: `${scoreA}-${scoreB}`,
  });
  store.save();

  return { rounds, scoreA, scoreB, winner, loser, growth };
}

function renderRounds(rounds, nameA, nameB) {
  return rounds
    .map((r, i) => {
      const outcome = r.result === 'a' ? nameA : r.result === 'b' ? nameB : 'nobody';
      return `Round ${i + 1}: ${nameA} played ${r.moveA}, ${nameB} played ${r.moveB} — ${outcome} takes it.`;
    })
    .join('\n');
}

module.exports = {
  COOLDOWN_MS,
  ENERGY_COST,
  openChallenge,
  takeChallenge,
  onCooldown,
  cooldownLeft,
  resolve,
  renderRounds,
};
