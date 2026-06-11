FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production

FROM oven/bun:1

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY ihub.config.json ./
COPY server/ ./server/

RUN mkdir -p /data && chown bun:bun /data

USER bun

ENV IHUB_PORT=3000
ENV IHUB_DB_PATH=/data/ihub.db

EXPOSE 3000

VOLUME /data

CMD ["bun", "server/index.js"]
