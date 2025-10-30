FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM base AS build
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER node
CMD ["node", "dist/index.js"]