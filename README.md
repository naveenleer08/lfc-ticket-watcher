# LFC Ticket Watcher

Watches every Liverpool men's home fixture on liverpoolfc.com and alerts you when an
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

## What it tells you

| Trigger | Priority |
|---|---|
| A new Additional Members Sale section appears on a home fixture | high |
| Registration or sale goes live (`REGISTER NOW` / `BUY NOW`) | critical |
| 24 hours, 1 hour and 10 minutes before a published opening time | high / critical |
| A published date or time changes | high |
| It can no longer read the LFC pages | high |
| Nothing has happened for a week | low |

Those last two matter: if the site's markup changes, you get told, rather than being
left with a silence that looks like good news. While the watcher is broken it will
never send the reassuring weekly "nothing new" email.

## Setup

One step: put it on GitHub. There is nothing to configure and no password anywhere.

```bash
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/lfc-ticket-watcher.git
git push -u origin main
```

**Make the repository public.** Nothing sensitive is in it, and public repos get
unlimited free Actions minutes. Private repos get 2,000/month and checking every 15
minutes needs about 2,900 — if you would rather keep it private, change the cron in
`.github/workflows/watch.yml` to `*/30 * * * *` to stay inside the allowance.

### How the alerts reach you

Each alert is opened as a **GitHub issue**, using the token GitHub gives every Actions
run automatically. You watch your own repositories by default, so GitHub emails you when
one appears. The issue title carries the urgency, and the body has the sale blurb and a
link straight to the match page.

Worth checking once: **Settings → Notifications** on GitHub, that "Email" is ticked under
Watching, and that the address there is one you actually read. It is worth sending
yourself a test (below) and confirming the mail arrives rather than assuming.

### Prove it works

**Actions → Watch LFC tickets → Run workflow**, tick *Send a test alert*, run it. An issue
should appear, and an email with it.

Then run it again without the tick. The first real run opens a single issue summarising
every home fixture and where it stands; after that you only hear about changes.

### If you would rather have real emails

The GitHub issue route needs nothing, but the subject lines are plainer and it depends on
your GitHub notification settings. To send proper email instead, add these repository
secrets (**Settings → Secrets and variables → Actions**) and the watcher switches over
automatically:

| Secret | Value |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | the address you're sending from |
| `SMTP_PASS` | a Gmail [App Password](https://myaccount.google.com/apppasswords), not your Google password |
| `MAIL_TO` | where alerts should land |

Create the app password yourself and paste it straight into GitHub — it should not be
written into a file or shared with anyone. Leave `SMTP_HOST` unset and the issue route
stays in use.

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

`npm run check` does a full check and prints the alerts it *would* raise without sending
anything.

## Tests

```bash
npm test
```

The alert logic is replayed against saved copies of the real pages, so situations that
can't be reproduced on demand are still covered: a registration window actually opening,
a published time moving, a sale being announced, and the markup breaking. The last of
those matters most — it checks that a broken watcher says so instead of quietly
reporting that all is well.

## How it holds up

The parser keys off `data-testid` attributes rather than CSS class names, which on this
site carry generated hashes (`statusIndicator--register-soon__9JXKi`) that change on
every deploy. Statuses seen so far: `register-soon`, `on-sale-soon`, `register-now`,
`buy-now`, `check-availability`, `registration-ended`, `sale-ended`. Anything ending
`-now` counts as live; unrecognised values are still reported rather than dropped.

`state.json` is committed back by the workflow after each run, so its history doubles as
a record of what LFC published and when.
