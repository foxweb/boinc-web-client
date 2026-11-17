FROM node:22.14-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22.14-bookworm-slim AS production
WORKDIR /app

RUN groupadd --system appgroup \
  && useradd --system --gid appgroup --home-dir /app --shell /usr/sbin/nologin appuser

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production \
    PORT=8080 \
    BOINC_HOST=127.0.0.1 \
    BOINC_PORT=31416

USER appuser
EXPOSE 8080

CMD ["node", "server/index.js"]
