FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build && npm prune --omit=dev
FROM node:24-alpine
LABEL org.opencontainers.image.source="https://github.com/s3tupw1zard/opencode-context-relay"
LABEL org.opencontainers.image.description="Read-only ChatGPT MCP bridge for OpenCode Context Relay"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist/src ./dist/src
USER node
EXPOSE 8787
CMD ["node","dist/src/main.js"]
