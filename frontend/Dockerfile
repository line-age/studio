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
# "store" reads the Lineage store through /store instead of a fixture file.
ARG VITE_DATA_SOURCE=""
ARG VITE_STORE_NETWORK=""
# "local": no sign-in; store is asked who this is and nginx sends the fixed
# local token (see compose.store.yaml). Anything else: sign in through the gate.
ARG VITE_AUTH=""
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_FIXTURE_URL=$VITE_FIXTURE_URL \
    VITE_DATA_SOURCE=$VITE_DATA_SOURCE \
    VITE_STORE_NETWORK=$VITE_STORE_NETWORK \
    VITE_AUTH=$VITE_AUTH
RUN pnpm build
# nginx with the local token only in the local build; any other image adds
# no token and leaves /store to the gate.
RUN if [ "$VITE_AUTH" = "local" ]; then cp nginx.local.conf.template nginx.conf.chosen; \
    else cp nginx.conf.template nginx.conf.chosen; fi

# Serve it. Runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:stable-alpine
# Where /store is passed on to, read when the container starts.
ENV STORE_URL=http://api:8000
COPY --from=build /app/nginx.conf.chosen /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
