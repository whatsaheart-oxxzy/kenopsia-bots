'use strict';

const config = require('./config');
const store = require('./store');
const voice = require('./voice');

const EVENT_CHANNEL = 'Events'; // the voice channel attendance is measured in

const newId = (guildId) => `${store.events(guildId).length + 1}${Date.now().toString(36).slice(-3)}`;

function create(guildId, hostId, name, when) {
  return store.putEvent({
    id: newId(guildId),
    guild: guildId,
    host: hostId,
    name,
    when,
    status: 'planned',
    attendees: [],
    createdAt: Date.now(),
  });
}

/** Signing up pays a little. Showing up pays the rest. */
function join(event, userId) {
  if (event.attendees.includes(userId)) return false;
  event.attendees.push(userId);
  store.putEvent(event);
  voice.payCoins(event.guild, userId, config.EVENT.join);
  return true;
}

function leave(event, userId) {
  event.attendees = event.attendees.filter((id) => id !== userId);
  store.putEvent(event);
  return true;
}

function start(event) {
  event.status = 'live';
  event.startedAt = Date.now();
  store.putEvent(event);
  return event;
}

/**
 * Ends the event and pays for time actually spent in the Events voice channel.
 * Signing up and not turning up is worth the 10 coins from joining, no more.
 */
function end(event) {
  event.status = 'done';
  event.endedAt = Date.now();

  const results = [];
  for (const userId of event.attendees) {
    const session = voice.activeSession(event.guild, userId);
    const minutes = session?.channelName === EVENT_CHANNEL ? session.minutes : 0;

    let bonus = 0;
    if (minutes >= 60) bonus = config.EVENT.minutes60;
    else if (minutes >= 30) bonus = config.EVENT.minutes30;

    if (bonus) voice.payCoins(event.guild, userId, bonus);
    results.push({ userId, minutes, bonus });
  }

  const hostBonus =
    event.attendees.length >= 5 ? config.EVENT.crowdedHost : config.EVENT.host;
  voice.payCoins(event.guild, event.host, hostBonus);

  store.putEvent(event);
  return { results, hostBonus };
}

const open = (guildId) => store.events(guildId).filter((e) => e.status !== 'done');

module.exports = { create, join, leave, start, end, open, EVENT_CHANNEL };
