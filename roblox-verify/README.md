# Roblox verify bot

A second, separate Discord bot. It proves that a member owns the Roblox account
they claim, and nothing else. It is deliberately small: no levels, no coins, no
moderation.

## How verification works

1. Member runs `/verify username:TheirRobloxName`.
2. The bot looks the name up on the public Roblox API and hands back a one-time
   code, for example `kenopsia-7f3a2b`.
3. The member pastes the code into the **About** text of their Roblox profile.
   Only the account owner can edit that, which is what makes this a proof.
4. The member presses "I added the code". The bot reads the profile description
   back and compares.
5. On a match the member gets the **Roblox Verified** role and can delete the
   code again.

Codes expire after 15 minutes. Accounts younger than 7 days are refused, because
throwaway accounts are where marketplace scams come from. One Roblox account can
only be linked to one member on the server.

**No Roblox credentials anywhere.** The endpoints used (`users.roblox.com`,
`thumbnails.roblox.com`) are public and need no key, no cookie and no account.

## Commands

| Command | Who | What |
| --- | --- | --- |
| `/verify username:` | everyone | Start linking a Roblox account. |
| `/unverify [user:]` | everyone for themselves, staff for others | Unlink again. Removes the role. |
| `/whois user:` | everyone, but only inside marketplace and looking-for-play | Show a member's verified Roblox name and profile link. |

In `#marketplace` the bot also replies once under a trade post with the poster's
verified Roblox name, at most once per member every ten minutes. That is the
whole reason the marketplace requires verification: the person you trade with
can check the profile before handing anything over.

The Roblox name is shown in those two channels and nowhere else. Discord has no
per-channel display names, so this is done by the bot rather than by a nickname.

## How it talks to the Kenopsia bot

It does not. The two processes never share a file — that is how data gets
corrupted. The **Roblox Verified** role is the only shared state:

- this bot grants and removes that role,
- the Kenopsia bot watches for it and combines it with level 10 into the
  **Trader** role,
- `#marketplace` is gated on **Trader**.

So the marketplace needs both: level 10 and a verified account. Discord
permission overwrites are additive and cannot express "both roles required",
which is why one bot-managed role stands in for the pair.

## Setup

1. Create a **second** application at https://discord.com/developers/applications.
   Add a bot to it and copy the token and the Application ID.
2. `cp .env.example .env` and fill in `VERIFY_TOKEN` and `VERIFY_CLIENT_ID`.
   No privileged intents need to be enabled for this bot.
3. Invite it to the same server with the `bot` and `applications.commands`
   scopes and the **Manage Roles** permission.
4. Drag its role **above** the Roblox Verified role in the server settings.
5. `node deploy-commands.js`, then `node index.js`.

It reuses the `node_modules` of the parent folder, so there is nothing to
install.

State lives in `roblox-verify/data/verified.json`.
