FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# .next is created implicitly by the COPY above and lands owned by root —
# --chown applies to the copied content, not to the parent directories Docker
# creates on the way — which leaves the unprivileged nextjs user unable to
# write anywhere under it at runtime.
#
# The cache directory itself is additionally mounted as a tmpfs in
# docker-compose.yml (the app runs read_only), and that mount shadows whatever
# is here — so its ownership has to be set there, with uid/gid matching the
# 1001 below. Creating it here anyway keeps the image correct on its own, for
# anyone running it without that compose file.
RUN mkdir -p .next/cache/images && chown -R nextjs:nodejs .next

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
