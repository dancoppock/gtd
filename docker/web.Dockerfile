FROM node:20.20.0-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY apps/web apps/web

RUN pnpm --filter @gtd/web build

FROM nginx:1.27-alpine

RUN apk add --no-cache apache2-utils

COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/web/10-basic-auth.sh /docker-entrypoint.d/10-basic-auth.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/10-basic-auth.sh

EXPOSE 80
