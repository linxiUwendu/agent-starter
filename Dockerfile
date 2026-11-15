FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN corepack enable && corepack install
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages
COPY packages/data packages/data
COPY config config

# 若仓库未提交 travel.db，构建时从种子生成
RUN if [ ! -f packages/data/travel.db ]; then pnpm --filter backend db:init; fi

RUN pnpm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV MOCK_AGENT=true
ENV HOST=0.0.0.0
ENV PORT=3000
ENV TRAVEL_DB_PATH=/app/packages/data/travel.db

RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=build /app/packages/data/travel.db /app/packages/data/travel.db.template
COPY --from=build /app/config ./config
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/travel/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
