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

**Measured difficulty**: levels are not guessed. For every question the AI counts six features:
ideas combined, solving steps, setup (direct / needs an equation / needs an insight), traps,
calculation load and reading load. `levelFromFeatures()` in `lib/core.js` turns those counts into a
level with one fixed formula, so a "level 6" means the same thing everywhere. Uploads are measured by
the first solve and by every verification pass (the median wins); AI-written practice questions are
measured by their writer and their checker, and stored at the level they actually came out at.

**Questions are written ahead of time** (`/api/stock`): students should never wait for the AI.
- After an upload is verified, the student's browser asks the site to fill every level of that question
  type, nearest levels first (6, then 5 and 7, then 4 and 8...), until each level has `TARGET_PER_LEVEL`
  questions (default 3). The upload card shows a 10-cell ladder filling up.
- While anyone has the site open, their browser quietly fills the most useful gap in the bank about once a
  minute (popular types and levels 3 to 8 first). Free Cloudflare Pages has no scheduled jobs, so visitors'
  browsers act as the scheduler. At most `STOCK_PER_MINUTE` fill jobs run per minute across the whole site (default 3).
- If a level is still empty when a student reaches it, they instantly get the nearest ready level of the
  same type while that level is written in the background.

**Adaptive levels**: four correct in a row moves up a level; two misses in a row moves down.

**Quality control**: solve rates are shown after 5 attempts, and three "Report a problem" clicks hide a question.

## How the site scales without running out of AI

AI cost grows with **new content**, not with the number of students:

1. **Templates.** When a question type needs more questions at a level, the AI writes a *template* once: the question
   with blanks for the numbers plus an answer formula. A different model solves 3 filled-in samples blind; if all
   match, the template is stored. From then on, code fills in fresh numbers for free, instantly, forever
   (`lib/templates.js`, a small safe calculator, because Cloudflare does not allow running AI-written code).
   If two questions from a template get reported, the template is retired.
2. **Practice never uses AI.** Questions come from the bank or from templates in milliseconds.
3. **Batched checks.** One AI call checks a whole batch of new questions.
4. **Adaptive verification.** Uploads get 2 independent checks; a 3rd runs only if they disagree.
5. **Repeat uploads are free.** The same question pasted again (or a near-identical copy with the same numbers)
   reuses the stored analysis, found through a full-text index.
6. **Students first.** Background stocking may use only `BACKGROUND_SHARE` of the day's AI budget (default 60%).
7. **Cheap database reads.** Random picks use an indexed random key and counts stop at 5, so reads per request stay
   tiny however big the bank grows (free D1 allows 5 million row reads a day).

Rough cost: an upload is 1 to 4 AI calls; a new template is 2 calls and then free. With Gemini, Groq and Mistral on free
tiers, the site can absorb hundreds of uploads a day, and practice volume is effectively unlimited. If it ever outgrows
that, the cheapest upgrade is a paid Flash-Lite-class model for the background template writing only.

## The AI providers

The site works through a chain of free providers in this order, skipping any that are out of quota
(daily limits: skipped for 3 hours; per-minute limits: a short wait, then the next model):

| # | Provider | Default model | Free allowance (Oct 2026, changes often) | How to enable |
|---|---|---|---|---|
| 1 | Google Gemini | gemini-3.8-flash | small, per model per day | `GEMINI_API_KEY` (aistudio.google.com) |
| 2 | Groq | openai/gpt-oss-120b | 30 req/min, token caps per minute and day | `GROQ_API_KEY` (console.groq.com) |
| 3 | NVIDIA NIM | nvidia/nemotron-3-super-120b-a12b | about 40 req/min; free tier meant for development and testing | `NVIDIA_API_KEY` (build.nvidia.com) |
| 4 | Cerebras | gpt-oss-120b | free tier has ended; leave unset | `CEREBRAS_API_KEY` |
| 5 | Mistral | mistral-large-latest | "Experiment" plan, phone verification | `MISTRAL_API_KEY` (console.mistral.ai) |
| 6 | Google backups | from `GEMINI_FALLBACK_MODEL` | as Gemini | uses the Gemini key |
| 7 | OpenRouter | openrouter/free | 20 req/min, 50 req/day | `OPENROUTER_API_KEY` (openrouter.ai) |
| 8 | Cloudflare Workers AI | llama-3.3-70b (last resort) | daily free allocation | `[ai] binding = "AI"` in `wrangler.toml` |

Add secrets in Cloudflare: Pages project › Settings › Variables and Secrets › type *Secret*, then make
any small commit on GitHub so the site redeploys. Missing keys are simply left out of the chain.
The three independent verification checks start on different providers, so they really are independent.

**Check the chain any time:** open `/api/health` on your site. It lists every model, whether it is
ready or resting (and for how long), and today's AI call count.

Optional overrides: `GROQ_MODEL`, `NVIDIA_MODEL`, `CEREBRAS_MODEL`, `MISTRAL_MODEL`, `OPENROUTER_MODEL`, `CF_AI_MODEL`, or `AI_CHAIN`
to set the exact order, e.g. `gemini:gemini-3.8-flash,groq:openai/gpt-oss-120b,cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

## Settings (in `wrangler.toml`, edit on GitHub)

| Setting | Default | What it does |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` | Main AI model |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.7-flash,...` | Models tried in order when the main one is busy |
| `DAILY_AI_LIMIT` | `400` (raise to ~1500 with all five providers) | Max AI calls per day. Keep it below the daily limit AI Studio shows |
| `VERIFY_PASSES` | `3` | Independent re-solves before an upload joins the bank |
| `GENERATES_PER_HOUR` | `20` | New same-type questions one visitor can request per hour |
| `MIN_QUALITY` | `6` | Minimum quality score (out of 10) to accept a question |
| `SUBMITS_PER_HOUR` | `10` | Questions or topics one visitor can add per hour |
| `MAX_VARIATIONS` | `6` | Max variations from one original question |
| `TARGET_PER_LEVEL` | `3` | Questions of each type kept ready at each level |
| `BACKGROUND_SHARE` | `0.6` | Share of the daily AI budget background stocking may use |
| `STOCK_PER_MINUTE` | `3` | Background fill jobs per minute, site-wide |
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
functions/api/*.js      API: analyze, verify, status, generate, stock, next, topics, refill, attempt, flag, health, setup
lib/core.js             AI prompts, judging, difficulty rubric, duplicate checks, storage
lib/patterns.js         the catalogue of 74 question types
lib/templates.js        safe formula calculator and template engine
lib/schema.js           database tables and upgrades (used by setup)
lib/seed-data.js        586 starter questions (used by setup)
db/*.sql                the same schema and seed as SQL, for command-line use
wrangler.toml           Cloudflare config and settings
```
