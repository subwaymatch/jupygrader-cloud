import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { first } from "./db";
import { appUrl, getEnv } from "./env";
import { sendEmail } from "./email";

function createAuth() {
  const env = getEnv();
  const base = appUrl();
  return betterAuth({
    appName: "Jupygrader",
    // Without APP_URL (Worker Previews), better-auth takes the address from each request.
    baseURL: env.APP_URL ? base : undefined,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: async (request) => [base, request ? new URL(request.url).origin : undefined],
    emailAndPassword: {
      enabled: true,
      // Accounts are created by /api/register (instructor requests) and invitations, never directly.
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: "Reset your Jupygrader password",
          text: `Hi ${user.name},\n\nSomeone asked to reset the password for your Jupygrader account. The link expires in 1 hour. If it wasn't you, ignore this email.`,
          action: { label: "Choose a new password", url },
        });
      },
    },
    user: {
      additionalFields: {
        isAdmin: { type: "boolean", defaultValue: false, input: false },
        status: { type: "string", defaultValue: "pending", input: false },
        notifyEmail: { type: "boolean", defaultValue: true, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            subject: "Your Jupygrader sign-in link",
            text: "Use this link to sign in to Jupygrader. It works once and expires in 15 minutes. If you didn't ask for it, ignore this email.",
            action: { label: "Sign in", url },
          });
        },
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const u = await first<{ status: string }>('select status from "user" where id = ?', session.userId);
            if (!u) throw new APIError("UNAUTHORIZED", { message: "No account for that email." });
            if (u.status === "pending")
              throw new APIError("FORBIDDEN", {
                message: "Your account is waiting for an administrator to approve it. You'll get an email when it's ready.",
              });
            if (u.status !== "active") throw new APIError("FORBIDDEN", { message: "This account can't sign in." });
          },
        },
      },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

export function getAuth(): Auth {
  if (!instance) instance = createAuth();
  return instance;
}
