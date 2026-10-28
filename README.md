# Jupygrader Cloud

AI-assisted grading for Jupyter notebooks and other student work, running entirely on Cloudflare.

Teachers set up an assignment with instructions, a rubric and an optional answer key, drop in the students' files (or a `.zip`), and an AI model (Claude through the Anthropic API, or any OpenAI-compatible model) grades each file in the background. Graders review the results next to the notebook, change any score, and send each student a private link. Feedback can be downloaded as the original notebook with the comments inserted as cells.

## Features

- **Courses and roles.** Per-course Teacher and Grader roles, site-wide Admins. Instructors request an account and an admin approves it. Graders and TAs join through email invitations. The first account on a new site becomes the admin. Teachers and admins can reset a course, deleting its assignments, files and grades while keeping the course and its people.
- **Assignments.** Instructions as text or a document (PDF, DOCX, Markdown, text). Rubrics can be skipped (the AI splits the points from the instructions), pasted or uploaded and itemized by the AI, or built by hand. Answer keys are sent to the AI but never shown to students. Grading style (from Completion, which gives full points for every part a student attempted, to Strict), feedback tone and length, notes for the AI, and how many notebook plots and interactive outputs the AI sees (the site's default or the assignment's own).
- **Uploads.** Drag and drop anywhere on the page, or a `.zip` (unpacked in the browser). Exact duplicates are detected by SHA-256 before upload. Near-identical submissions (MinHash over the code) are flagged for review.
- **Background grading.** Files are queued in Cloudflare Queues and graded a few at a time, so the page can be closed. Rate limits and transient errors are retried. Admins set a concurrency limit and a monthly spending cap.
- **Review.** Each file's feedback opens in a new tab, as a split view with the notebook on the left (with its feedback, as nbconvert HTML when available) and the scores on the right. Low-confidence grades and close matches are flagged. Edit any rubric line (the AI's score stays visible and every change is in the history), override the total, mark files reviewed. Keyboard shortcuts: <kbd>J</kbd>/<kbd>K</kbd> next and previous, <kbd>R</kbd> reviewed, <kbd>E</kbd> edit total.
- **Feedback into the notebook.** Downloads insert a summary cell at the top and a `> **Feedback:**` Markdown cell after each commented cell, keeping every original cell, output and piece of metadata. Feedback cells are tagged (`jupygrader-feedback`), so grading a notebook that already has feedback replaces it instead of stacking it. Code files get feedback as comments in the file's own comment syntax; Markdown and text files get it after each paragraph. HTML, plain-text and JSON exports are available too, for one file or a `.zip` of many, plus a grades CSV.
- **Student links.** A private page per file with the score, rubric, and the work with its feedback (the same nbconvert HTML as the feedback page, for notebooks). Links can be turned off or replaced. Students don't need accounts.
- **Admin.** Overview of what needs attention, users and roles, invitations, an activity log, and site settings (AI provider and endpoint, encrypted API key, model, plots and interactive outputs sent to the AI, token rates, spending cap, concurrency, data retention).
- **Works on phones.** The sidebar becomes a slide-in menu, tables become cards, and the feedback page switches between Feedback and File tabs.

## Stack

| Part | Choice |
| --- | --- |
| Framework | [vinext](https://github.com/cloudflare/vinext) (Next.js App Router on Vite) on Cloudflare Workers |
| UI | React 19, [Base UI](https://base-ui.com) components, plain CSS (no Tailwind) |
| Auth | [better-auth](https://better-auth.com) with D1: email and password, magic links, password reset |
| Data | Cloudflare D1 (SQLite) |
| Files | Cloudflare R2: submissions, instruction and rubric documents, answer keys |
| Jobs | Cloudflare Queues for grading, Cron Triggers for recovery and retention |
| AI | The Anthropic Messages API (structured outputs, adaptive thinking, prompt caching) or any OpenAI-compatible Chat Completions API (structured outputs, falls back to JSON mode) |
| Email | [Resend](https://resend.com), optional |
| Notebook HTML | [nbconvert](https://nbconvert.readthedocs.io) in a [Cloudflare Container](https://developers.cloudflare.com/containers/), optional |

```
Browser ──> Worker (worker/index.ts)
              ├─ fetch:     vinext pages, server components and /api routes
              │               ├─ D1  (users, courses, assignments, submissions, activity, usage)
              │               ├─ R2  (files)
              │               ├─ Queue producer (one message per file to grade)
              │               └─ Durable Object + Container (nbconvert, for notebook HTML downloads)
              ├─ queue:     grading consumer ──> Anthropic or OpenAI-compatible API
              └─ scheduled: every minute, requeue interrupted jobs (or grade directly
                            when no queue is bound); daily, delete files past retention
```

## Local development

Requirements: Node 22+.

```bash
npm install
cp .dev.vars.example .dev.vars          # set BETTER_AUTH_SECRET to a long random string
npm run db:migrate:local                # creates the local D1 database
npm run dev                             # http://localhost:5173
```

Open the app and create the first account: it becomes the administrator. Then open **Admin > Settings**, choose a provider (Anthropic or OpenAI-compatible), check the API address it fills in (`https://api.anthropic.com` or, for example, `https://api.openai.com/v1`), enter an API key and a model, and click **Test saved settings**.

Local D1, R2 and the queue are simulated by Miniflare and stored in `.wrangler/state`. Cron handlers can be triggered with:

```bash
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"     # recovery tick
curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=17+3+*+*+*"    # retention sweep
```

Without `RESEND_API_KEY`, emails (invitations, sign-in links, password resets) are printed to the terminal. Invite links can also be copied from the course member list or **Admin > Invitations**.

## Deploying to Cloudflare

You need a Cloudflare account. If Queues aren't available on your plan, see [without a queue](#without-a-queue).

1. Sign in and create the resources:

   ```bash
   npx wrangler login
   npx wrangler d1 create jupygrader
   npx wrangler r2 bucket create jupygrader-files
   npx wrangler queues create jupygrader-grading
   ```

2. In `wrangler.jsonc`, paste the `database_id` printed by `d1 create`, and set `vars.APP_URL` to the URL the app will be served from (for example `https://grader.example.edu` or `https://jupygrader-cloud.<you>.workers.dev`). It's used for links in emails.

3. Set the secrets:

   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET   # required: a long random string, e.g. openssl rand -base64 32
   npx wrangler secret put RESEND_API_KEY       # optional: to send email
   npx wrangler secret put EMAIL_FROM           # optional: e.g. "Jupygrader <grader@example.edu>" on a domain verified in Resend
   npx wrangler secret put AI_API_KEY           # optional: a default key; admins can also set one in Settings
   ```

4. Create the tables and deploy:

   ```bash
   npm run db:migrate:remote
   npm run deploy        # builds with Vite, then deploys with Wrangler
   ```

5. Open the app, create the first (admin) account, and configure AI grading in **Admin > Settings**.

When you update a deployment, run `npm run db:migrate:remote` before `npm run deploy` if there are new files in `migrations/`.

To serve the app on your own domain, add a [custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) to the Worker and update `APP_URL`.

### Without a queue

The queue is optional. Remove the `queues` block from `wrangler.jsonc` and the every-minute Cron Trigger grades queued files instead, up to the "Files graded at once" setting per minute. Grading is slower to start but nothing else changes.

### nbconvert container

Graded notebooks are rendered as HTML by Jupyter's own nbconvert (the JupyterLab template) running in a [Cloudflare Container](https://developers.cloudflare.com/containers/). When a notebook finishes grading, the graded notebook, with its feedback cells, is sent to the container and the HTML is stored in R2 next to the file. The feedback page and students' links show it, and "Notebook as HTML" downloads, for graders and through student links, use it without waiting for the container. A stored copy is used only while the grade, feedback, assignment title and points it was made from are unchanged; otherwise it's made again in the background when the feedback page opens, or when it's downloaded. Markdown and outputs are sanitized: scripts, frames, event handlers and `javascript:` links from student work are removed, and both pages show the HTML in a frame that runs no scripts. If the container can't be reached, downloads use the built-in HTML and the pages show their own rendering instead. Bulk `.zip` downloads always use the built-in HTML: nbconvert's is about 300 KB per file, mostly styles, and a `.zip` of hundreds of them wouldn't fit in a Worker's memory.

- **Plan:** Containers need the [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/) ($5 per month).
- **Scheduling policy:** the container uses the [`durable_object` scheduling policy](https://developers.cloudflare.com/containers/configuration/scheduling-policy/) (accounts can be limited to it), so `worker/nbconvert.ts` chooses the image and the instance size when it starts the container.
- **Deploying:** the image is built ahead of time and pushed to your account's Cloudflare registry, and `wrangler.jsonc` pins it by digest (`registry.cloudflare.com/<account-id>/jupygrader-nbconvert@sha256:<digest>`). Deploys, including [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), only reference it, so they don't need Docker. To deploy without the container, remove the `containers` block from `wrangler.jsonc`.
- **Changing the image:** edit `containers/nbconvert`, choose a new tag (for example `7.17.2-3`), and push the image under that tag before you merge, in one of two ways:
  - From a machine with Docker, after `npx wrangler login`: `npx wrangler containers build containers/nbconvert -t jupygrader-nbconvert:<tag> -p`, then `docker image inspect registry.cloudflare.com/<account-id>/jupygrader-nbconvert:<tag> --format '{{json .RepoDigests}}'` and use the entry that starts with `registry.cloudflare.com/`.
  - From GitHub: run the **nbconvert image** workflow (**Actions** tab, **Run workflow**) with the tag. Its summary shows the digest-pinned reference. It needs two repository secrets: `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN` with the Workers Containers Edit permission.

  Then put the new reference in `wrangler.jsonc` and merge. If the image isn't pushed first, the deploy's container step fails.
- **Local development:** `npm run dev` doesn't start the container (`dev.enable_containers` is `false`), so downloads use the built-in HTML and the feedback page its own rendering. To run nbconvert locally, set it to `true` and replace the image's `"image"` with `"dockerfile": "./containers/nbconvert/Dockerfile"`; this needs Docker, and WSL on Windows.
- **Size:** the container runs as a `standard-1` instance (1/2 vCPU, 4 GiB memory, 8 GB disk). It starts on the first conversion and stops after 5 idle minutes. Measured at that size, starting takes about 4 seconds (plus a few seconds for Cloudflare to start the VM), the first conversion about 1.5 seconds and later ones under half a second. The smaller `lite` size (1/16 vCPU) takes about 45 seconds for the first download, and the `basic` size isn't available with this policy.
- **Cost:** memory and disk are billed while the container runs and CPU only while it works. It runs while notebooks are being graded, and for 5 idle minutes after the last one, so a grading batch counts as one session. A session (a start, some conversions, then 5 idle minutes) uses about 0.35 GiB-hours of memory and 0.7 GB-hours of disk. The Workers Paid plan includes 25 GiB-hours and 200 GB-hours a month, so about 70 sessions a month cost nothing extra. Each further session costs about $0.003: 1,000 sessions a month is about $3, and a container that never went idle would be about $27 a month.

### Configuration

| Name | Kind | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | secret, required | Signs sessions and encrypts the AI API key stored in D1. Changing it signs everyone out and makes the stored API key unreadable (enter it again in Settings). |
| `APP_URL` | var | Public URL of the app. |
| `RESEND_API_KEY`, `EMAIL_FROM` | secrets, optional | Send email through Resend. |
| `AI_PROVIDER` | optional | `anthropic` or `openai` (the default). Picks the default address, model and token rates. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | optional | Defaults for the AI settings. Values saved in Admin > Settings take precedence. |

Everything else (registration, allowed email domains, model, token rates for cost estimates, spending cap, concurrency, retention, reasoning effort, sending plots and interactive outputs to the AI) is set by an admin in the app.

## How grading works

1. Each uploaded file is stored in R2, fingerprinted (SHA-256 for exact duplicates, MinHash for close matches) and queued.
2. The queue consumer claims the file (an atomic status change, so a job never runs twice), checks the concurrency limit and spending cap, and builds the prompt: instructions, rubric, answer key (marked confidential), notes, and the file rendered with markers. Notebook cells are `[C1]`, `[C2]`…; code files are numbered lines (`L12-18`); documents are paragraphs (`[P3]`). Notebook plots and interactive outputs (widgets, Plotly, Bokeh, Vega) are replaced with a short note by default, since they use many tokens; admins can turn on sending up to 6 plots as images (low detail on OpenAI-compatible APIs) and the text form of interactive outputs. The file name is not sent. Everything before the file is the same for each file of an assignment; on the Anthropic API that part is cached, so later files in a batch are billed at the cache-read rate for it.
3. The model returns JSON matching a schema: a score, comment and cited markers for each rubric item, inline comments, a summary, and a confidence signal. The reply is validated: scores are clamped to each item's maximum in half points, unknown markers are dropped, and the total is scaled to the assignment's points.
4. Token usage from the API is recorded with an estimated cost. Each grade stores the rubric version, style and model, so changing the setup marks older grades as "graded with earlier settings" until they're regraded.

The notebook logic lives in `lib/shared/notebook.ts` and `lib/shared/document.ts`; the prompt and validation in `lib/server/grading.ts`.

## Project layout

```
app/                    routes (App Router)
  (auth)/               sign in, register, password reset, invitations
  (app)/                signed-in screens: courses, assignments, admin, account, help
  r/[token]/            public student feedback page
  api/                  JSON routes used by the UI
components/             UI (Base UI wrappers in components/ui)
lib/shared/             code shared by browser and Worker: rubric, notebook, exports
lib/server/             Worker-only code: auth, access control, grading, storage
migrations/             D1 schema
worker/index.ts         Worker entry: fetch (vinext), queue and scheduled handlers
worker/nbconvert.ts     Durable Object that runs the nbconvert container
containers/nbconvert/   nbconvert container: Dockerfile and HTTP server
test/                   unit tests (Vitest)
```

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server with local D1, R2 and queue |
| `npm run build` | Production build into `dist/` |
| `npm start` | Run the production build locally with Wrangler |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply D1 migrations |
| `npm test` | Unit tests |
| `npm run typecheck` | Generate binding types and type-check |

## Not included yet

The design prototype also covers Canvas LMS integration (linking courses, importing submissions, posting grades) and an admin "view as" mode. Neither is implemented here.
