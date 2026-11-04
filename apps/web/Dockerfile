# Web app (Next.js) for self-hosting. On Vercel this file is not used.
# Build from the repository root:  docker build -f apps/web/Dockerfile -t texcollab-web .
FROM node:22-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@texcollab/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_REALTIME_URL=http://localhost:4000
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NEXT_STANDALONE=true \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@texcollab/web

FROM node:22-trixie-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
