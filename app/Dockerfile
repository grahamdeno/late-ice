# Late Ice server. Build: docker build -t late-ice . ; Run: docker run -p 5000:5000 -e ANTHROPIC_API_KEY=... -v lateice:/data late-ice
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=5000 LATE_ICE_DB=/data/data.db
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/samples ./samples
VOLUME ["/data"]
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
