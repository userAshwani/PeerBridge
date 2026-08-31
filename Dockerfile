# PeerBridge production image.
# Custom server.js (Next.js + /ws signaling in one process) needs the full
# `next` runtime, so this does a normal production install rather than
# Next's standalone output.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 peerbridge

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json server.js ./
COPY server ./server

RUN npm prune --omit=dev && chown -R peerbridge:nodejs /app

USER peerbridge
EXPOSE 3000

CMD ["node", "server.js"]
