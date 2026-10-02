# Revise with AI

Free, adaptive practice for **CAT Arithmetic**: Percentages, Profit & Loss, SI & CI, Ratio & Proportion,
Averages, Mixtures & Alligation, Time & Work, and Time, Speed & Distance.

Anyone can paste a question or type a topic. The AI solves it twice, re-solves it blind, scores its
quality, grades it 1 to 10, and adds it to a shared bank that keeps growing. Students pick any starting
level from 1 to 10; four correct in a row moves them up.

Runs entirely on free tiers: **GitHub** (code) → **Cloudflare Pages** (site + API) + **D1** (database),
with **Google Gemini's free Flash tier** for the AI.

---

## Deploy: no installs, all in the browser (about 20 minutes)

Menu names on these sites shift now and then; if a label differs slightly, look for the nearest match.

### 1. Get a free Gemini API key
1. Go to https://aistudio.google.com and sign in with Google.
2. Click **Get API key → Create API key**. Copy it somewhere safe. No card needed.
3. Note the name of the free **Flash** model shown there. If it isn't `gemini-2.5-flash`, you'll change it in step 4.

### 2. Put the code on GitHub
1. Create a free account at https://github.com if you don't have one.
2. Click **+ → New repository**. Name it `revise-with-ai`, set it to **Public**, and create it.
3. On the empty repo page, click **uploading an existing file**.
4. Unzip the project on your computer, open the `rwa` folder, select **everything inside it**
   (the `public`, `functions`, `lib`, `db` folders and all files), and drag them in.
5. Click **Commit changes**.

### 3. Create the database on Cloudflare
1. Create a free account at https://dash.cloudflare.com.
2. Go to **Storage & Databases → D1 SQL Database → Create**.
3. Name it `revise-with-ai-db` and create it.
4. Copy the **Database ID** shown on its page.

### 4. Link the database in your code
1. On GitHub, open `wrangler.toml` and click the pencil icon to edit.
2. Replace `PASTE_YOUR_DATABASE_ID_HERE` with your Database ID (keep the quotes).
3. If your Flash model name from step 1 is different, update `GEMINI_MODEL` too.
4. Click **Commit changes**.

### 5. Connect GitHub to Cloudflare Pages
1. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Authorise GitHub and pick the `revise-with-ai` repo.
3. Build settings: **Framework preset: None**, **Build command: leave empty**, **Build output directory: `public`**.
4. Click **Save and Deploy**. The first deploy takes a minute or two.

### 6. Add your two secrets
1. Open the Pages project → **Settings → Variables and Secrets**.
2. Add **`GEMINI_API_KEY`** as type *Secret*, with the key from step 1.
3. Add **`ADMIN_TOKEN`** as type *Secret*: make up a long password (e.g. 20+ random characters). You'll use it once in step 7.
4. Go to **Deployments**, open the latest one, and click **Retry deployment** so the secrets take effect.

### 7. Load the question bank
1. Open `https://YOUR-PROJECT.pages.dev/setup.html` (Cloudflare shows your exact address).
2. Enter your `ADMIN_TOKEN` and click **Set up database**.
3. When it says *Done*, click **Open the site**. You're live.

### 8. Quick test
- **Practice tab:** pick a topic and level, answer a few questions.
- **Add to the bank tab:** paste an Arithmetic question and wait for the report card (about 20 to 40 seconds).
  If it says the AI key is missing, recheck step 6 and redeploy.

From now on, **any change you commit on GitHub goes live automatically.**

---

## Updating the starter bank

When `lib/seed-data.js` gets new questions, upload the new file to GitHub (it redeploys automatically),
then open `/setup.html` and run it again. Only new questions are added; existing ones and their stats stay untouched.

The bank ships with **586 starter questions** across all 8 Arithmetic topics:
- 254 simple template questions (levels 1, 3, 4, 6)
- 332 curated questions (levels 1 to 9), written from scratch on the patterns and difficulty bands
  found in standard CAT prep material, with every answer computed by code and the tricky ones
  re-checked by simulation

## How it works

**Upload a question** (`/api/analyze`, then `/api/verify`)
1. One AI call solves it, checks the answer a second way, names the topic and the **question type**
   (e.g. "Successive percentage change"), and estimates difficulty on a 1 to 10 scale. The student
   sees all of this in about 20 seconds. The question is stored as *pending*.
2. The student can immediately **practise that question type** at any level they pick.
3. In the background, the AI solves the question `VERIFY_PASSES` more times (default 3), each time
   independently and each time rating the difficulty. If at least two thirds of the solves match
   and quality is good enough, the question goes **live** at the **median** of all difficulty ratings.
   Otherwise it is rejected, with the reason shown to the student.

**Question types**: `lib/patterns.js` holds a catalogue of 74 types across the 8 topics, and every
starter question is tagged with one. The AI picks from this list (or names a new type when nothing
fits); new types then appear in the Practice tab automatically.

**Practising a type** (`/api/next` with `pattern`, `/api/generate`): questions of that exact type at
that exact level come from the bank first. When none are left, the AI writes 2 new ones of the same
type at that level, re-solves each independently, and serves only those that match.

**Adaptive levels**: four correct in a row moves up a level; two misses in a row moves down.

**Quality control**: solve rates are shown after 5 attempts, and three "Report a problem" clicks hide a question.

## Settings (in `wrangler.toml`, edit on GitHub)

| Setting | Default | What it does |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` | Main AI model |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.7-flash,...` | Models tried in order when the main one is busy |
| `DAILY_AI_LIMIT` | `400` | Max AI calls per day. Keep it below the daily limit AI Studio shows |
| `VERIFY_PASSES` | `3` | Independent re-solves before an upload joins the bank |
| `GENERATES_PER_HOUR` | `20` | New same-type questions one visitor can request per hour |
| `MIN_QUALITY` | `6` | Minimum quality score (out of 10) to accept a question |
| `SUBMITS_PER_HOUR` | `10` | Questions or topics one visitor can add per hour |
| `MAX_VARIATIONS` | `6` | Max variations from one original question |
| `FLAGS_TO_HIDE` | `3` | Reports before a question is hidden |

**AI usage:** an upload uses 1 call plus `VERIFY_PASSES` (4 in total by default). Each batch of 2 new
same-type questions uses 3. So 400 calls a day covers roughly 50 uploads plus 60 new practice questions. **Practising uses no AI**, so any number of students can practise free.

## Managing the bank
Cloudflare dashboard → **D1 → revise-with-ai-db → Console**. Examples:
```sql
SELECT id, topic, level, quality, flags, text FROM questions ORDER BY id DESC LIMIT 20;
UPDATE questions SET hidden = 1 WHERE id = 123;     -- remove a question
UPDATE questions SET level = 7 WHERE id = 123;      -- re-grade a question
```

## Things to know
- Google's free tier may use prompts to improve its products and is meant for non-commercial use.
  Fine for a free site; move to a paid key before adding ads.
- Free-tier limits change. If the site says the AI quota is used up, lower `DAILY_AI_LIMIT` or wait a day.
- Keep `ADMIN_TOKEN` private. The setup page is safe to rerun but only works with it.

## Optional: run on your own computer
Needs Node.js 20+.
```
npm install
npm run db:local
printf "GEMINI_API_KEY=your-key\nADMIN_TOKEN=anything\n" > .dev.vars
npm run dev
```
Open http://localhost:8788

## Files
```
public/index.html       the site: upload a question, practise by type
public/setup.html       one-time database setup page
functions/api/*.js      API: analyze, verify, status, generate, next, topics, refill, attempt, flag, setup
lib/core.js             AI prompts, judging, difficulty rubric, duplicate checks, storage
lib/patterns.js         the catalogue of 74 question types
lib/schema.js           database tables and upgrades (used by setup)
lib/seed-data.js        586 starter questions (used by setup)
db/*.sql                the same schema and seed as SQL, for command-line use
wrangler.toml           Cloudflare config and settings
```
