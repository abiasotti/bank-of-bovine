# Multi-stage build for the Next.js app. Uses `output: "standalone"`
# (next.config.ts) to trace a minimal server bundle instead of shipping the
# full node_modules tree in the runtime image.
#
# node:26-alpine matches the Node version this project has been developed
# and verified against locally (`node --version` -> v26.5.0).

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci runs INSIDE the container so platform-specific optional
# dependencies (@node-rs/argon2's native binary) resolve for
# linux-musl-x64, not whatever the host machine is.
RUN npm ci

FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# This stage is also shipped directly as the migrate image (see
# docker-compose.yml / publish.yml), which only ever needs to run
# `node_modules/.bin/prisma migrate deploy` - not npm/npx themselves. Strip
# the base image's bundled npm now that the build commands above are done
# with it, so a CVE in one of npm's own dependencies (e.g. undici) doesn't
# show up as a finding against code this image never executes.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    # The standalone runtime never calls npm/npx (it just runs
    # server.js) - strip the base image's bundled npm so a CVE in one of
    # npm's own dependencies (e.g. undici) doesn't show up as a finding
    # against code this image never executes.
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
