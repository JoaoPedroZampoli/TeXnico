# Realtime + compile server with TeX Live.
# Build:  docker build -t texcollab-server .
FROM node:22-trixie-slim

# Set TEXLIVE_FONTS_EXTRA="" to get a ~1 GB smaller image (drops texlive-fonts-extra).
ARG TEXLIVE_FONTS_EXTRA="texlive-fonts-extra"
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      latexmk biber ghostscript make perl \
      texlive-latex-base texlive-latex-recommended texlive-latex-extra \
      texlive-fonts-recommended ${TEXLIVE_FONTS_EXTRA} \
      texlive-science texlive-pictures texlive-bibtex-extra texlive-publishers \
      texlive-xetex texlive-luatex texlive-plain-generic texlive-humanities \
      texlive-lang-portuguese texlive-lang-english texlive-lang-spanish texlive-lang-european \
      fonts-lmodern fonts-noto-core \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/* \
 && luaotfload-tool --update || true

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@texcollab/server --omit=dev --ignore-scripts=false && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server

ENV NODE_ENV=production \
    PORT=4000 \
    COMPILE_DIR=/tmp/texcollab \
    HOME=/tmp/home
RUN mkdir -p /tmp/texcollab /tmp/home && chown -R node:node /tmp/texcollab /tmp/home
USER node
EXPOSE 4000
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/index.ts"]
