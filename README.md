# LFC Ticket Watcher

Watches every Liverpool men's home fixture on liverpoolfc.com and emails you when an
**Additional Members Sale** appears, when registration opens, and before the sale starts.

It does not buy tickets and does not log into your account. It reads the same public
pages you would, and tells you to go and do it yourself.

## Why this works

Liverpool don't publish Additional Members Sale dates for a match until roughly two
weeks before it. Until then the match page has no such section at all — that's why the
advice is "keep checking the website". Once the section appears it carries exact times:

| Stage | Status | Example (Liverpool v Fulham, 12 Sep) |
|---|---|---|
| Additional Members Sale Registration | `REGISTER SOON` | Tue 1 Sep, 11:00am → Wed 2 Sep, 10:00am |
| Additional Members Sale | `ON SALE SOON` | Mon 7 Sep, 11:00am |

So the watcher's job is to notice that section appearing, then keep you ahead of both
deadlines. Registration is usually open for about 23 hours — easy to miss entirely,
but not a race. The sale itself is first come, first served, and **if you registered,
LFC email you a unique access link a few days beforehand**.

## What it emails you

| Trigger | Priority |
|---|---|
| A new Additional Members Sale section appears on a home fixture | high |
| Registration or sale goes live (`REGISTER NOW` / `BUY NOW`) | critical |
| 24 hours, 1 hour and 10 minutes before a published opening time | high / critical |
| A published date or time changes | high |
| It can no longer read the LFC pages | high |
| Nothing has happened for a week | low |

That last two matter: if the site's markup changes, you get told, rather than being
left with a silence that looks like good news. While the watcher is broken it will
never send the reassuring weekly "nothing new" email.

## Setup

### 1. Put it on GitHub

Create a repository and push this folder to it.

```bash
git init && git add -A && git commit -m "LFC ticket watcher"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/lfc-ticket-watcher.git
git push -u origin main
```

**Make the repository public.** Nothing sensitive lives in it — your email address and
mail password are stored as encrypted GitHub Secrets, never in the code. Public repos
get unlimited free Actions minutes; private repos get 2,000/month, and checking every
15 minutes uses roughly 2,900. If you would rather keep it private, change the cron in
`.github/workflows/watch.yml` to `*/30 * * * *` to stay inside the allowance.

### 2. Create a mail app password

If you're sending through Gmail, turn on 2-Step Verification, then create an **App
Password** at <https://myaccount.google.com/apppasswords>. This is a 16-character
password specific to this app; it is not your Google password and can be revoked
independently.

Do this yourself and paste it straight into GitHub in the next step — it should not be
written into any file or shared with anyone.

### 3. Add the secrets

In the repository: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | the Gmail address you're sending from |
| `SMTP_PASS` | the app password from step 2 |
| `MAIL_TO` | where alerts should land |
| `MAIL_FROM` | optional; defaults to `SMTP_USER` |

### 4. Prove the email works

**Actions → Watch LFC tickets → Run workflow**, tick *Send a test email*, run it.

Then run it again without the tick. The first real run sends a one-off summary of every
home fixture and where it currently stands, and from then on you only hear about changes.

## Tuning

`config.json`:

- `watchTitlePatterns` — which sales to alert on. Add `"all red members ticket sale"` if
  you also want the twice-yearly ballot sale (July and November).
- `onlyOpponents` — leave empty for every home game, or narrow it: `["arsenal", "everton"]`.
- `reminderLeadMinutes` — advance warnings, default 24h / 1h / 10min.
- `heartbeatDays` — how often to confirm it's alive with nothing to report. `0` disables.

## Running it locally

```bash
npm install
npm run check
```

`npm run check` does a full check and prints the emails it *would* send without sending
anything. For real sends locally, put the same variables in a `.env` and load it.

## Tests

The alert logic is exercised against saved copies of the real pages, so situations that
can't be reproduced on demand — a window actually opening, a time being moved, the
markup breaking — are still covered.

```bash
node --import ./test/stub.js src/index.js --dry-run
```

`LFC_TEST_SUB` rewrites the served HTML to simulate a change:

```bash
LFC_TEST_SUB="statusIndicator--register-soon=>statusIndicator--register-now" \
  node --import ./test/stub.js src/index.js --dry-run
```

## How it holds up

The parser keys off `data-testid` attributes rather than CSS class names, which on this
site carry generated hashes (`statusIndicator--register-soon__9JXKi`) that change on
every deploy. Statuses seen so far: `register-soon`, `on-sale-soon`, `register-now`,
`buy-now`, `check-availability`, `registration-ended`, `sale-ended`. Anything ending
`-now` counts as live; unrecognised values are still reported rather than dropped.

`state.json` is committed back by the workflow after each run, so its history doubles as
a record of what LFC published and when.
