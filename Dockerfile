# The image every deployment runs (ADR 0025): built once per commit, the same
# bytes in previews, staging and production. Configuration comes from the
# environment at deploy time; nothing environment-specific is baked in.

# Build: every dependency, both halves compiled (tsc to dist/, Vite to
# dist/client/), then the dev dependencies dropped.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

# Run: compiled code, runtime dependencies and the SQL migrations only — no
# tsx, Vite or test tools.
FROM node:24-slim
WORKDIR /app
ENV CLIENT_DIR=/app/dist/client \
    PORT=8080
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
# The commit this image was built from, which the menu shows (R-NFR-11). Late,
# so a new commit rebuilds no layer above it.
ARG GIT_COMMIT=""
ENV GIT_COMMIT=$GIT_COMMIT
USER node
EXPOSE 8080
# The server. One-off tasks run from the same image with another command:
#   node dist/migrate.js · node dist/seed.js · node dist/dev-login.js <email>
CMD ["node", "dist/server.js"]
