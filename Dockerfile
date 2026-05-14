FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY ihub.config.json ./
COPY server/ ./server/

RUN mkdir -p /data && chown node:node /data

USER node

ENV IHUB_PORT=3000
ENV IHUB_DB_PATH=/data/ihub.db

EXPOSE 3000

VOLUME /data

ENTRYPOINT ["tini", "--"]
CMD ["node", "server/index.js"]
