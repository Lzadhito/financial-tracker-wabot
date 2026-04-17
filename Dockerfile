FROM oven/bun:1 AS base
WORKDIR /app

# Build stage
FROM base AS build
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build src/index.ts --outdir dist --target bun

# Production
FROM base AS production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "bunx drizzle-kit migrate && bun dist/index.js"]
