FROM node:20-alpine AS base
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

# task-queue-worker
FROM node:20-alpine AS task-queue-worker
COPY --from=base /app/build/src /app/package*.json app/
WORKDIR /app/
RUN npm install
CMD node /app/workers/task-queue-worker/main.js

# job-search-worker
FROM mcr.microsoft.com/playwright:v1.41.1-jammy AS job-search-worker
COPY --from=base /app/build/src /app/package*.json app/
WORKDIR /app/
RUN npm install
CMD node /app/workers/job-search-worker/main.js

# job-apply-worker
FROM mcr.microsoft.com/playwright:v1.41.1-jammy AS job-apply-worker
COPY --from=base /app/build/src /app/package*.json app/
WORKDIR /app/
RUN npm install
CMD node /app/workers/job-apply-worker/main.js


