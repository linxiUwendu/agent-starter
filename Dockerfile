FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

RUN npm ci

COPY backend backend
COPY frontend frontend
COPY data data

# 若仓库未提交 travel.db，构建时从种子生成
RUN if [ ! -f data/travel.db ]; then npm run db:init -w backend; fi

RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV MOCK_AGENT=true
ENV HOST=0.0.0.0
ENV PORT=3000
ENV TRAVEL_DB_PATH=/app/data/travel.db

RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/data/travel.db /app/data/travel.db.template
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/travel/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
