# JupyGrader Cloud

An AI-powered autograder platform for Jupyter notebooks. Instructors upload grading rubrics, students submit notebooks, and a serverless Python worker grades submissions using OpenAI — all on AWS.

## Tech Stack

- **Frontend/Backend**: Next.js 15, React 19, TypeScript
- **Database**: PostgreSQL via [Neon](https://neon.tech), Drizzle ORM
- **Auth**: [Better Auth](https://better-auth.com) with magic link emails (Resend)
- **Storage**: AWS S3 (presigned uploads)
- **Queue**: AWS SQS
- **Worker**: Python Lambda (Docker) grading via OpenAI
- **Infrastructure**: [SST](https://sst.dev)

---

## Configuration

### 1. Copy the environment template

```bash
cp .env.local.example .env.local
```

### 2. Fill in `.env.local`

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Random secret for session signing — generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Base URL of the app (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | Public app URL (same as above for local dev) |
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `S3_BUCKET_NAME` | S3 bucket name for notebook storage |
| `SQS_QUEUE_URL` | SQS queue URL for grading jobs |
| `RESEND_API_KEY` | [Resend](https://resend.com) API key for magic link emails |
| `EMAIL_FROM` | Sender address (e.g. `noreply@yourdomain.com`) |
| `OPENAI_API_KEY` | OpenAI API key used by the Lambda worker |

---

## Local Development

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) PostgreSQL database
- AWS account with S3 and SQS set up
- [Resend](https://resend.com) account for email
- OpenAI API key

### Setup

```bash
# Install dependencies
npm install

# Push the database schema
npm run db:push

# Start the development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Database commands

| Command | Description |
|---|---|
| `npm run db:push` | Apply schema changes directly to the database |
| `npm run db:generate` | Generate migration files after schema changes |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:studio` | Open Drizzle Studio (visual database browser) |

---

## Production Deployment

The app deploys to AWS using [SST](https://sst.dev). The Lambda worker, S3 bucket, and SQS queue are all managed as infrastructure-as-code in `sst.config.ts` and the `infra/` directory.

### Set secrets

```bash
sst secret set DatabaseUrl <value>
sst secret set BetterAuthSecret <value>
sst secret set ResendApiKey <value>
sst secret set OpenAIApiKey <value>
```

### Deploy

```bash
npx sst deploy --stage production
```
