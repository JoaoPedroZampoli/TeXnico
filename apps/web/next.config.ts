import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// In the monorepo, local development uses a single .env at the repository root.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// GitHub Codespaces opened in the browser reaches the dev server through *.app.github.dev.
const codespacesDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const extraOrigins = codespacesDomain ? [`*.${codespacesDomain}`] : [];
// The Codespaces proxy rewrites the browser's Origin header to https://localhost:<port>.
const actionOrigins = codespacesDomain ? [...extraOrigins, "localhost:3000"] : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: extraOrigins,
  experimental: { serverActions: { allowedOrigins: actionOrigins } },
  // Self-hosted Docker builds use the standalone output; Vercel ignores this.
  ...(process.env.NEXT_STANDALONE === "true" && {
    output: "standalone" as const,
    outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  }),
  transpilePackages: ["@texcollab/db", "@texcollab/shared"],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
