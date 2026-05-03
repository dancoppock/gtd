FROM node:20.20.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY apps/api apps/api

ENV NODE_ENV=production
ENV PORT=3001
ENV GTD_DATABASE_FILENAME=/data/gtd.sqlite

EXPOSE 3001

CMD ["pnpm", "--filter", "@gtd/api", "start"]
