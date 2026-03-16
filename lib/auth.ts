import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        if (process.env.NODE_ENV === "development") {
          // In dev, log the magic link to the console instead of sending email
          console.log(`\n[DEV] Magic link for ${email}:\n${url}\n`);
          return;
        }
        // Production: send via Resend
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM!,
            to: email,
            subject: "Sign in to JupyGrader",
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>Sign in to JupyGrader</h2>
                <p>Click the button below to sign in. This link expires in 10 minutes.</p>
                <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
                  Sign In
                </a>
                <p style="color:#6b7280;font-size:14px;margin-top:16px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </div>
            `,
          }),
        });
        if (!res.ok) {
          throw new Error(`Failed to send magic link email: ${res.statusText}`);
        }
      },
    }),
  ],
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  secret: process.env.BETTER_AUTH_SECRET!,
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
