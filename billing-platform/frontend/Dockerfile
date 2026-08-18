# The browser app.
#
# Builds the static bundle, then serves it from nginx. The runtime image has no
# Node in it at all — what ships is HTML, CSS and JavaScript.

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src

# Baked in at build time, because a static bundle has no server to read env from.
#
# Empty (the default) means "same origin" — correct when nginx proxies /api to
# the backend, which is what this image does. Set it only when the browser app
# is served from a different host than the API, as on GitHub Pages:
#   docker build --build-arg VITE_API_URL=https://api.example.com .
ARG VITE_API_URL=""
ARG VITE_BASE="/"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE=$VITE_BASE

RUN npm run build


FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

# Unprivileged nginx already runs as uid 101 and listens on 8080, so no
# capability to bind a low port is needed.
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/index.html || exit 1
