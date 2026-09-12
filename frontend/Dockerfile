# =============================================================================
# Frontend container image
#
# Two targets:
#   dev   – the Vite dev server with hot reload, used by docker-compose
#   serve – nginx serving the production build, for local verification
#
# IMPORTANT: on AWS the React app is NOT run as a container. The `npm run build`
# output is uploaded to a private S3 bucket and served by CloudFront, because a
# static bundle needs no compute — running a permanent container to hand out
# three JavaScript files would cost money and add a failure mode for nothing.
# This image exists so the whole stack is reproducible locally.
# =============================================================================

# -------------------------------------------------------------------- dev ---
FROM node:22-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ------------------------------------------------------------------ build ---
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Baked in at build time — Vite inlines import.meta.env into the bundle.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ------------------------------------------------------------------ serve ---
FROM nginx:1.27-alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback: React Router owns the client-side routes, so any unknown path
# must return index.html rather than a 404. CloudFront is configured with the
# same rule via a custom error response.
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location /assets/ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
