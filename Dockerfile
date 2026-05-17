FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: better-sqlite3 is a Node/Vitest-only devDependency whose
# node-gyp postinstall needs Python (absent from oven/bun). It is imported
# nowhere in the image — runtime uses bun:sqlite, the build excludes *.test.ts.
# esbuild resolves its native binary from its optional platform package, not
# its postinstall, so the Vite build is unaffected.
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run build

FROM oven/bun:1 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
RUN mkdir -p /app/data
VOLUME /app/data
EXPOSE 3000
# Liveness: the SPA index is served unauthenticated once dist/ is present,
# so a 2xx here means the Bun process is up and serving. Uses bun's fetch
# so we don't depend on curl/wget being in the slim image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "server/index.ts"]
