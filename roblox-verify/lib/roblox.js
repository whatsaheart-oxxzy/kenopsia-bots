'use strict';

/**
 * Roblox lookups. Every endpoint used here is public — the bot needs no Roblox
 * account, no cookie and no API key. Ownership is proven by the member putting
 * a one-time code into their own profile description, which only the account
 * owner can edit.
 */

const USERS_API = 'https://users.roblox.com/v1';
const THUMBNAIL_API = 'https://thumbnails.roblox.com/v1';
const TIMEOUT_MS = 10_000;

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    const error = new Error(`Roblox API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/** Username to account. Returns null when Roblox has no such user. */
async function findUser(username) {
  const body = await call(`${USERS_API}/usernames/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });

  const hit = body.data?.[0];
  return hit ? { id: hit.id, name: hit.name, displayName: hit.displayName } : null;
}

/** Full profile, including the description we check the code against. */
async function getUser(userId) {
  const body = await call(`${USERS_API}/users/${userId}`);
  return {
    id: body.id,
    name: body.name,
    displayName: body.displayName,
    description: body.description ?? '',
    created: body.created,
    banned: Boolean(body.isBanned),
  };
}

/** Avatar headshot, used in the confirmation. Failure here is not important. */
async function getAvatar(userId) {
  try {
    const body = await call(
      `${THUMBNAIL_API}/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`,
    );
    return body.data?.[0]?.imageUrl ?? null;
  } catch {
    return null;
  }
}

const profileUrl = (userId) => `https://www.roblox.com/users/${userId}/profile`;

/** Codes are short, unmistakable and expire, so a leaked one is worthless. */
function makeCode() {
  const random = Math.random().toString(16).slice(2, 8);
  return `kenopsia-${random}`;
}

/** How old the account is, in days. A brand new account is a scam signal. */
function accountAgeDays(created) {
  return Math.floor((Date.now() - new Date(created).getTime()) / 86_400_000);
}

module.exports = { findUser, getUser, getAvatar, profileUrl, makeCode, accountAgeDays };
