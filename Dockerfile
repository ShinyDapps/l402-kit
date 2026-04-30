FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build 2>/dev/null || true

ENV NODE_ENV=production

ENTRYPOINT ["npx", "l402-kit-mcp"]
