import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { account, getDb, session, user, verification } from "@texcollab/db";

export const socialProviders = {
  github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
};

export const auth = betterAuth({
  appName: "TeXnico",
  baseURL: process.env.BETTER_AUTH_URL,
  // Extra origins allowed to call the auth API (comma separated), e.g. localhost while BETTER_AUTH_URL is a tunnel.
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: "pg", schema: { user, session, account, verification } }),
  emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
  socialProviders: {
    ...(socialProviders.github && {
      github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! },
    }),
    ...(socialProviders.google && {
      google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
    }),
  },
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "github"] } },
  session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true, maxAge: 5 * 60 } },
  plugins: [nextCookies()],
});
