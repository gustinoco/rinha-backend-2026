FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:26-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm run preprocess
RUN npm prune --omit=dev

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/data/processed ./data/processed
COPY --from=build /app/normalization.json ./normalization.json
COPY --from=build /app/mcc_risk.json ./mcc_risk.json
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
