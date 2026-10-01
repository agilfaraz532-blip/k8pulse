# Multi-stage build for React + Vite Frontend
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production Nginx Serving Stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# The nginx image renders /etc/nginx/templates/*.template into /etc/nginx/conf.d/ at startup.
# Only the listed variables are substituted, so nginx's own $variables are left intact.
COPY templates/ /etc/nginx/templates/
ENV BACKEND_UPSTREAM=backend:8000 \
    DNS_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_FILTER="^(BACKEND_UPSTREAM|DNS_RESOLVER)$"

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
