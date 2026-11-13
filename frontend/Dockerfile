# syntax=docker/dockerfile:1

# Build the static bundle.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# Vite reads these while building and writes them into the bundle, so they are
# build arguments, not runtime environment. The Mapbox token is a public (pk.)
# token; never pass a secret here.
ARG VITE_MAPBOX_TOKEN=""
ARG VITE_FIXTURE_URL=""
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_FIXTURE_URL=$VITE_FIXTURE_URL
RUN pnpm build

# Serve it. Runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
