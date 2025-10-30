FROM node:20-alpine AS base
WORKDIR /app

# Install system dependencies for TTS
RUN apk add --no-cache espeak-ng ffmpeg

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS production
RUN apk add --no-cache espeak-ng ffmpeg
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER node
CMD ["node", "dist/index.js"]