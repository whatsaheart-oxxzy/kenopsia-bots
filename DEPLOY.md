# Running the bots 24/7 on a rented server

Right now the bots are online only while your PC is on. This moves them to a
small Linux server so they stay green when your PC sleeps.

Written for an **IONOS VPS**, but nothing here is specific to that host — any
Ubuntu server with root access and full virtualisation (KVM) works the same way,
including Hetzner, UpCloud and dogado.

## What runs where

Two containers, from one image:

| Container | Bots inside | State it owns |
| --- | --- | --- |
| `kenopsia-cc` | C.C, SUZAKU, SHIRLEY, KALLEN | `data/`, `Virtual Pet/data/`, `Voice Bot/data/`, `Shop Bot/data/` |
| `kenopsia-lelouch` | LELOUCH | `roblox-verify/data/` |

Four bots share one container on purpose. C.C, SUZAKU, SHIRLEY and KALLEN all
spend and earn from the same coin wallet in `data/kenopsia.json`, each keeping
it in memory and writing it back a few seconds later. Split across two
processes, whichever writes last wins and the other one's coins disappear.
KALLEN is the one that would hurt most — it is the shop, so it is the one
actually taking coins out. LELOUCH shares nothing with them, so it runs on its
own and can be restarted without touching the economy.

The five bots together need roughly 850 MB of RAM. Anything from 2 GB up is
comfortable; on a 1 GB machine add swap first (see the end of section 3).

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

Then make a **private** repository — private, not public, because the code names
your server and roles — and push:

```powershell
gh repo create kenopsia-bots --private --source=. --remote=origin --push
```

**This step is done.** The repository is
[whatsaheart-oxxzy/kenopsia-bots](https://github.com/whatsaheart-oxxzy/kenopsia-bots),
private, with the Anthropic key rotated and `.envt.txt` deleted. It is written
out here so the whole path is on record, not because it is still open.

## 2. Prepare the server

In the IONOS Cloud Panel, under **Servers & Cloud**:

1. Image: **Ubuntu 24.04**. If the server was created with a different image,
   reinstall it now — it is far easier than fighting a distribution you did not
   want. Nothing is on the machine yet.
2. Note the **IP address** and the **root password**. IONOS shows both in the
   panel; the password may also arrive by mail.
3. Firewall policy: allow **inbound SSH (22) only**. IONOS applies its own
   firewall in front of the machine, so a rule you set inside Ubuntu is not
   enough on its own. The bots only make outgoing connections to Discord and
   need no inbound ports beyond SSH.

Do not book managed hosting, Plesk, or a backup add-on. Docker replaces the
control panel, and the backup at the end of this file costs nothing.

## 3. Set the server up

Log in as root with the password from the welcome mail:

```bash
ssh root@YOUR_SERVER_IP
```

**Put your SSH key on it and turn the password login off.** A server with a
public IP and password login gets brute-forced within hours — this is not
optional. From PowerShell on your PC:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@YOUR_SERVER_IP "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Open a **second** PowerShell window and confirm `ssh root@YOUR_SERVER_IP` now
gets you in without asking for the password. Only once that works, disable
password login on the server:

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Keep the first window open until you have tested the new one. If you lock
yourself out, dogado's console in the customer panel is the way back in.

Then set up the firewall. The bots only make outgoing connections to Discord
and need no incoming ports at all beyond SSH:

```bash
ufw allow OpenSSH
ufw --force enable
```

dogado also has IP Access Rules in the control panel. Either is enough; doing
both does no harm.

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

**Only if the machine has 1 GB of RAM.** Check with `free -m`. The bots need
about 700 MB and the Docker build is the peak; on 1 GB, give the kernel
somewhere to spill to rather than have it kill a bot at the worst moment:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

With 2 GB or more, skip this.

## 4. Get the code and the tokens onto it

The repository is private, so the server has to prove who it is before it may
clone. The safest way is a **deploy key**: an SSH key that lives only on this
server and may only read this one repository. Even if the server were taken
over, that key opens nothing else.

On the server:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github -N ""
cat ~/.ssh/github.pub
printf 'Host github.com\n  IdentityFile ~/.ssh/github\n  IdentitiesOnly yes\n' >> ~/.ssh/config
```

Copy the printed line. Either paste it at
`https://github.com/whatsaheart-oxxzy/kenopsia-bots/settings/keys` → **Add deploy
key**, title `ionos`, **write access off** — or paste it to me and I add it from
here. Then:

```bash
git clone git@github.com:whatsaheart-oxxzy/kenopsia-bots.git
cd kenopsia-bots
mkdir -p data "Virtual Pet/data" "Voice Bot/data" "Shop Bot/data" roblox-verify/data
cp .env.deploy.example .env
nano .env
```

Fill in all twelve values. They are the same tokens your five `.env` files hold
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

`Voice Bot/data/voice.json` and `Shop Bot/data/shop.json` do not exist yet — the
voice bot has not written any statistics and nobody has bought anything. Both
are created on the server on their own.

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
`Voice bot online as ...` for SHIRLEY, `Shop bot online as ...` for KALLEN, and
LELOUCH's in the second container. `Ctrl+C` leaves the log view without stopping
anything.

In Discord all five should now be green. Test one command from each bot —
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

Restarting `cc` restarts SUZAKU, SHIRLEY and KALLEN with it. That is the trade
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

**Turn a bot off:** clear its token in `.env` and restart. An empty `PET_TOKEN`,
`VOICE_TOKEN` or `SHOP_TOKEN` makes `index.js` skip that bot and log that it
did. Clearing `SHOP_TOKEN` is the quickest way to close the shop without
touching anyone's coins — held requests stay held and resume when it is back.
For LELOUCH, `docker compose stop lelouch`.

---

## When something is wrong

**A bot is offline but the container is running.** Check the logs. A bad token
gives a login error immediately; discord.js reconnects by itself after network
trouble, so a genuinely stuck bot is rare.

**`EACCES` or "permission denied" writing a JSON file.** The `user:` line in
`docker-compose.yml` does not match the server user. Run `id -u` and put that
number in both halves of `user: "1000:1000"`, then:

```bash
sudo chown -R $(id -u):$(id -g) data "Virtual Pet/data" "Voice Bot/data" "Shop Bot/data" roblox-verify/data
docker compose up -d
```

**Coins or levels look wrong after the move.** Almost always two instances
running at once. Confirm nothing is still running on your PC (step 6), then
restore `data/kenopsia.json` from a backup.

**A bot answers twice.** Same cause. `docker compose ps` should list exactly
two containers, `kenopsia-cc` and `kenopsia-lelouch`.

**The server is out of disk.** `docker system prune -a` clears old images. Log
files are already capped at 30 MB per container.
