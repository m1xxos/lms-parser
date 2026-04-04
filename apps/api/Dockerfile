FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app

ENV API_PORT=4000
ENV EXPORT_DIR=/app/exports

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
RUN mkdir -p /app/exports

EXPOSE 4000
CMD ["node", "dist/index.js"]
