# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.1.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# OD-R9: the runtime image carries these production dependencies and no others. `prisma` (the CLI that `migrate deploy` runs in
# this image), `bullmq` and `@nestjs/bullmq` (standby queue infrastructure kept by the Owner, OD-R5) are among them. Install
# scripts are not blanket-disabled: pnpm 11 runs only the build scripts that `allowBuilds` in pnpm-workspace.yaml allows, which
# for the production set is `@prisma/engines` (downloads the schema engine `migrate deploy` needs) and `prisma`.
FROM base AS production-dependencies
RUN pnpm install --prod --frozen-lockfile

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json nest-cli.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# `pnpm build` ends by writing the old command entries dist/<alias>.js from the command table (OD-A7).
COPY scripts/build ./scripts/build
RUN pnpm build

FROM build AS migrate
ENV NODE_ENV=production
USER node
CMD ["pnpm", "db:migrate:deploy"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
# P04-CPE-04 (spec L.12): the data representations this runtime reads that an older runtime cannot. scripts/ops/deploy-release.sh
# brings a previous image back only when its label declares every representation the database holds rows of
# (`ops:preflight --recovery-target`). Equal to DATA_REPRESENTATIONS of
# src/modules/installation/public/recovery-target.policy.ts (recovery-target.policy.spec.ts). Only this stage's labels reach the image.
LABEL io.github.baophipham.slm.data-reads="access-request-null-cost-center"
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts package.json ./
# prisma.config.ts shares the database URL rule with the application; that one file has no import.
COPY --chown=node:node src/infrastructure/config/database-url.ts ./src/infrastructure/config/database-url.ts
RUN ln -s /app/node_modules/prisma/build/index.js /usr/local/bin/prisma
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
