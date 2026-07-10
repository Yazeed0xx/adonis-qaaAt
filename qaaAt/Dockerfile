FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/build/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/build ./
RUN mkdir -p /data/private && chown -R node:node /app /data
USER node
EXPOSE 3333
CMD ["node", "bin/server.js"]
