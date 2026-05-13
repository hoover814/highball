# Highball 🥃

An AI-assisted cocktail companion — a mobile-friendly web app for browsing classics, chatting with an AI bartender, building your own recipes, and rating + reviewing what you've tried.

**Stack:** static site on GitHub Pages + Google Sheets (via Apps Script) + Claude API.

---

## Features

- **Email sign-in** (no password) — your recipes sync across devices
- **Home** — browse classics, filtered by base spirit
- **Ask the Bar** — chat with Claude, get structured recipes you can save in one tap
- **Cellar** — review every saved recipe, filtered by Saved / AI-made / Mine, searchable
- **Ratings & tasting notes** — 5-star rating and freeform notes on every recipe
- **New Recipe** — add your own cocktails by hand or with AI help
- **Offline-friendly** — works without a connection using localStorage, syncs when back online

---

## Setup — full step-by-step

You'll set this up in three pieces:
1. **Google Sheet + Apps Script** (the backend)
2. **GitHub repo with the app file** (the frontend)
3. **Each user adds their own Anthropic API key** in the app's Me tab

### Part 1 — Set up the Google Sheets backend

**1a. Create a new Google Sheet**
- Go to [sheets.new](https://sheets.new) — name it `Highball Data` (or whatever you like)
- Leave it empty; the script will create the tabs it needs

**1b. Add the Apps Script**
- In the Sheet, go to **Extensions → Apps Script**
- Delete the default `function myFunction()` code
- Open the `backend.gs` file from this repo and paste its full contents in
- Click the disk icon to save. Name the project `Highball Backend`

**1c. Deploy as a Web App**
- Click **Deploy → New deployment**
- Click the gear icon next to "Select type" → choose **Web app**
- Fill in:
  - **Description:** `Highball v1`
  - **Execute as:** `Me (your@email.com)`
  - **Who has access:** `Anyone` ← important
- Click **Deploy**
- Google will ask you to authorize the script (it needs permission to read/write the Sheet you just created). Click through; on the "Google hasn't verified" warning, click **Advanced → Go to Highball Backend (unsafe)** — it's safe because you wrote it
- **Copy the Web App URL.** It looks like `https://script.google.com/macros/s/AKfy.../exec`

**1d. Test it**
- Paste the URL in a browser and add `?action=ping` at the end. You should see `{"ok":true,"pong":true}`
- Open the Sheet — you'll see two new tabs were auto-created: `Users` and `Recipes`

### Part 2 — Set up the GitHub Pages frontend

**2a. Add the Web App URL to the code**
- Open `index.html`
- Find this line near the top of the `<script>` block:
  ```js
  const BACKEND_URL = '';
  ```
- Paste your Web App URL between the quotes:
  ```js
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfy.../exec';
  ```

**2b. Push to GitHub**
- Create a new public repo, e.g. `highball`
- Upload `index.html` and this `README.md` to the root
- Commit and push

**2c. Enable GitHub Pages**
- **Settings → Pages**
- Source: `Deploy from a branch`, branch `main`, folder `/ (root)`
- Save. After ~1 minute, your site is live at `https://<username>.github.io/highball/`

**2d. Open on iPhone**
- Open the URL in Safari
- Tap **Share → Add to Home Screen** for a full-screen, app-like experience

### Part 3 — Each user adds their Anthropic API key

Because GitHub Pages is static, there's no way to hide a shared API key server-side. So each user gets their own:
1. Sign in to the app with their email + display name (one-time)
2. Go to the **Me** tab → AI Bartender section
3. Paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
4. Tap Save key

Their key is stored only in their browser's localStorage — never sent to the backend. Each person pays only for their own usage.

If you'd rather provide the AI for everyone yourself, see the **Cloudflare Worker proxy** note at the bottom of this README.

---

## How sign-in works

A simple, no-password identity system for a small group of trusted users:

- Sign-in asks for **email + display name**
- The Apps Script backend creates a row in the `Users` sheet (or updates `last_seen` if returning)
- Every API call from the app includes the user's email — the backend uses it to scope private data and check permissions
- "Sign out" clears local data; recipes stay safe in the Sheet

**This is not real auth.** If someone learns another user's email, they could in theory rate/note recipes as them, or delete recipes they created. For a side project among friends, this is fine. If you ever need real security, swap the backend for Firebase Auth or Supabase.

---

## Shared cellar — how it works

This is a **shared library with personal ratings**:

- **Recipes are shared** — when anyone adds a recipe (their own, an AI creation, or a saved classic), it appears in everyone's Cellar
- **Each card shows authorship** — e.g. "by Jacob" so you know who contributed it
- **Ratings and tasting notes are private** — your 5-star on the Old Fashioned and your "next time, less sugar" note are visible only to you
- **Only the creator can delete** their recipes (or you, as Sheet owner, can edit the Sheet directly)
- **You can rate anyone's recipe** — even ones others made

The Cellar's filter tabs reflect this:
- **All** — every recipe in the shared cellar
- **Mine** — recipes you created
- **Rated** — recipes you've rated
- **AI** — recipes built by the AI bartender

---

## What's stored where

**Google Sheet (backend, shared across all users):**
- `Users` tab: email, display_name, created_at, last_seen
- `Recipes` tab: id, creator_email, creator_name, name, tagline, base, swatch, method, time, skill, ingredients (JSON), steps, source, created_at, updated_at
- `Ratings` tab: user_email, recipe_id, rating, notes, updated_at — one row per (user × recipe) pair

**Browser localStorage (per device):**
- Cached recipes + your private ratings (so the app works offline)
- The user's session (email + display name)
- The user's Anthropic API key (never sent to the backend)

---

## Troubleshooting

**"Could not sign in" / network error**
- Your `BACKEND_URL` is wrong, or the Web App isn't deployed with "Anyone" access
- Re-check Part 1c. The URL should end in `/exec`, not `/dev`

**Recipes save locally but don't appear in the Sheet**
- Open Apps Script → **Executions** to see error logs
- Make sure the Web App's "Who has access" is set to **Anyone** (not "Anyone with Google account")

**CORS errors in the browser console**
- The app uses `Content-Type: text/plain` to avoid CORS preflight requests to Apps Script. This works in all modern browsers. If you're seeing CORS errors, you may have modified the request and added a JSON content-type — change it back

**Each Apps Script call takes ~1 second**
- Normal for Apps Script. For a few users it's fine. If it bothers you, migrate to Supabase or Firebase — both have free tiers with much faster responses

**Hit the Apps Script quota**
- Free tier allows ~20,000 calls/day, plenty for a few people

---

## When to outgrow Google Sheets

Sheets is a great free backend for ~10 users and a few thousand recipes. You'd want to switch if:
- You need fast queries on lots of data
- You need real authentication
- Multiple users editing the same recipe at the same time (Sheets is last-write-wins)
- You want push notifications, attachments, etc.

Good migration paths: **Supabase** (free Postgres + auth, very generous tier) or **Firebase** (free Firestore + auth). The frontend would barely change — only the `backendCall()` function gets rewritten.

---

## Optional: Cloudflare Worker for shared AI

If you'd rather hold a single API key yourself and let users chat without their own:

```js
// worker.js
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const { messages, system } = await request.json();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system,
        messages,
      }),
    });
    const data = await res.text();
    return new Response(data, {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  },
};
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
```

Then in `index.html`, replace the body of `callAnthropic()` to call your Worker URL instead. The Anthropic key lives only in the Worker's environment variables.

---

## Files in this repo

- `index.html` — the entire frontend (HTML + CSS + JS, no build step)
- `backend.gs` — Google Apps Script code, paste into Apps Script editor
- `README.md` — this file
