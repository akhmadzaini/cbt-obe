FROM oven/bun:1.2

WORKDIR /app

# mariadb-client dipakai untuk dump/restore database saat backup sistem.
RUN apt-get update \
    && apt-get install -y --no-install-recommends mariadb-client tar gzip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN bun install

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
