FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache ttf-dejavu

ENV REDIS_URL=redis://redis:6379
ENV EXPORT_DIR=/app/exports

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
RUN mkdir -p /app/exports

CMD ["node", "dist/index.js"]
