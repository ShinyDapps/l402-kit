FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build 2>/dev/null || true

ENV NODE_ENV=production

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('fs').accessSync('/app/dist/index.js')" || exit 1

ENTRYPOINT ["npx", "l402-kit-mcp"]
