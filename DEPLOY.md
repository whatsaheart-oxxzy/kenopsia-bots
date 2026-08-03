# Running the bots 24/7 on a Hetzner server

Right now the bots are online only while your PC is on. This moves them to a
small Linux server so they stay green when your PC sleeps.

## What runs where

Two containers, from one image:

| Container | Bots inside | State it owns |
| --- | --- | --- |
| `kenopsia-cc` | C.C, SUZAKU, Voice Bot | `data/`, `Virtual Pet/data/`, `Voice Bot/data/` |
| `kenopsia-lelouch` | LELOUCH | `roblox-verify/data/` |

Three bots share one container on purpose. C.C, SUZAKU and the Voice Bot all
spend and earn from the same coin wallet in `data/kenopsia.json`, each keeping
it in memory and writing it back a few seconds later. Split across two
processes, whichever writes last wins and the other one's coins disappear.
LELOUCH shares nothing with them, so it runs on its own and can be restarted
without touching the economy.

Cost: a Hetzner CX22 is about 4 EUR a month and is far more machine than four
Discord bots need.

---

## 1. Before you touch the server

**Rotate the Anthropic key.** It sits in plain text in `.env` and `.envt.txt`,
and one of your bot tokens is pasted in a comment in `.env` too. Nothing has
leaked — this folder is not a git repository yet — but it is about to become
one. Go to console.anthropic.com, delete that key, and delete `.envt.txt`:

```powershell
del .envt.txt
```

You do not need a new Anthropic key. The ECHO Oracle is the only thing that
would use it, and it is not switched on (`registerEcho` in
`lib/echo/runtime.js` is never called from `index.js`).

**Make it a git repository.** `.gitignore` already excludes every `.env`, the
`data/` folders and `node_modules/`, so no token and no member data can be
pushed.

```powershell
cd "$env:USERPROFILE\my-discord-bot"
git init -b main
git add .
git status
```

Read that `git status` list before committing. If you see `.env`, any `data/`
file or `.envt.txt` in it, stop and tell me — something is wrong with the
ignore rules.

```powershell
git commit -m "Kenopsia bots, ready to deploy"
```

Then make a **private** repository at github.com/new — private, not public,
because the code names your server and roles — and push:

```powershell
git remote add origin https://github.com/YOURNAME/kenopsia-bots.git
git push -u origin main
```

## 2. Create the server

At console.hetzner.com:

1. New project, then **Add Server**.
2. Location: Nuremberg or Falkenstein.
3. Image: **Ubuntu 24.04**.
4. Type: **CX22** (shared vCPU, x86).
5. SSH key: add your public key. If you do not have one, run `ssh-keygen -t ed25519`
   in PowerShell and paste `C:\Users\Asus\.ssh\id_ed25519.pub`. Use a key, not
   a password — a password-login server on a public IP gets brute-forced within
   hours.
6. Firewall: inbound **SSH (22) only**. The bots make outbound connections to
   Discord and need no inbound ports at all.
7. Create, and note the IP address.

## 3. Set the server up

Log in as root once:

```bash
ssh root@YOUR_SERVER_IP
```

Create a normal user to run the bots. Docker containers running as root write
root-owned files into your data folders, which becomes annoying the first time
you want to copy a backup out.

```bash
adduser deploy
usermod -aG sudo deploy
id -u deploy
```

That last command should print **1000**. If it prints something else, remember
the number — you will need to change `user: "1000:1000"` in
`docker-compose.yml` to match, or the containers cannot write their state.

Copy your SSH key over so you can log in as `deploy`, then install Docker:

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```

Log out and back in as the new user:

```bash
exit
ssh deploy@YOUR_SERVER_IP
```

## 4. Get the code and the tokens onto it

```bash
git clone https://github.com/YOURNAME/kenopsia-bots.git
cd kenopsia-bots
mkdir -p data "Virtual Pet/data" "Voice Bot/data" roblox-verify/data
cp .env.deploy.example .env
nano .env
```

Fill in all nine values. They are the same tokens your four `.env` files hold
on your PC, gathered into one file — the container has no `.env` files inside
it, so docker-compose passes these in as real environment variables instead.
Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
chmod 600 .env
```

**Bring your existing data across.** Coins, levels, pets and Roblox links are
in JSON files on your PC and are not in the repository. Copy them from
PowerShell, with the bots stopped on both sides:

```powershell
cd "$env:USERPROFILE\my-discord-bot"
scp data/kenopsia.json deploy@YOUR_SERVER_IP:kenopsia-bots/data/
scp "Virtual Pet/data/pets.json" "deploy@YOUR_SERVER_IP:'kenopsia-bots/Virtual Pet/data/'"
scp roblox-verify/data/verified.json deploy@YOUR_SERVER_IP:kenopsia-bots/roblox-verify/data/
```

`Voice Bot/data/voice.json` does not exist yet — the voice bot has not written
any statistics. It will be created on the server on its own.

Skip this whole step if you would rather start the economy from zero.

## 5. Register the slash commands

Only needed once, and again whenever a command's name, description or options
change. Run it from your PC, where the four separate `.env` files still live:

```powershell
npm run deploy:all
```

That registers commands for all four Discord applications in one go.

## 6. Stop the bots on your PC

This matters. Two copies of the same bot both count messages and both answer
interactions, which shows up as doubled coin payouts and dead buttons. Close
the terminal windows running `npm start` and `npm run start:lelouch`, and check
nothing survived:

```powershell
Get-Process node -ErrorAction SilentlyContinue
```

## 7. Start them on the server

```bash
cd ~/kenopsia-bots
docker compose up -d --build
```

The first build takes a couple of minutes. Then check:

```bash
docker compose ps
docker compose logs -f
```

You want to see `Logged in as ...` for C.C, `Pet bot online as ...` for SUZAKU,
the voice bot's own ready line, and LELOUCH's in the second container. `Ctrl+C`
leaves the log view without stopping anything.

In Discord all four should now be green. Test one command from each bot —
`/profile`, `/pet`, `/voice`, `/verify` — before you consider it done.

`restart: unless-stopped` means Docker starts them again after a crash and
after a server reboot, without you doing anything.

---

## Day to day

**Change something in the code:**

```powershell
git add . ; git commit -m "what changed" ; git push
```

```bash
cd ~/kenopsia-bots && git pull && docker compose up -d --build
```

If you changed a command's name, description or options, run `npm run deploy:all`
from your PC as well — Discord only learns about that from the registration
call, not from the running bot.

**Restart just one:**

```bash
docker compose restart lelouch
docker compose restart cc
```

Restarting `cc` restarts SUZAKU and the Voice Bot with it. That is the trade
for a wallet that cannot be corrupted.

**Read the logs:**

```bash
docker compose logs -f cc
docker compose logs --tail 100 lelouch
```

**Back up the state.** This is the only thing that is not reproducible — the
code is in GitHub, but every coin, level and pet lives in these files. From
PowerShell:

```powershell
scp -r deploy@YOUR_SERVER_IP:kenopsia-bots/data ./backup-data
```

Worth doing before any big change, and worth setting a monthly reminder for.

**Turn a bot off:** clear its token in `.env` and restart. An empty `PET_TOKEN`
or `VOICE_TOKEN` makes `index.js` skip that bot and log that it did. For
LELOUCH, `docker compose stop lelouch`.

---

## When something is wrong

**A bot is offline but the container is running.** Check the logs. A bad token
gives a login error immediately; discord.js reconnects by itself after network
trouble, so a genuinely stuck bot is rare.

**`EACCES` or "permission denied" writing a JSON file.** The `user:` line in
`docker-compose.yml` does not match the server user. Run `id -u` and put that
number in both halves of `user: "1000:1000"`, then:

```bash
sudo chown -R $(id -u):$(id -g) data "Virtual Pet/data" "Voice Bot/data" roblox-verify/data
docker compose up -d
```

**Coins or levels look wrong after the move.** Almost always two instances
running at once. Confirm nothing is still running on your PC (step 6), then
restore `data/kenopsia.json` from a backup.

**A bot answers twice.** Same cause. `docker compose ps` should list exactly
two containers, `kenopsia-cc` and `kenopsia-lelouch`.

**The server is out of disk.** `docker system prune -a` clears old images. Log
files are already capped at 30 MB per container.
