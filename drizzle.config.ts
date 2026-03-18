import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load env files in priority order; dotenv does not override already-set variables,
// so the first file that defines a variable wins (.env.local > .env.test > .env).
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env.test", quiet: true });
dotenv.config({ quiet: true });

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
