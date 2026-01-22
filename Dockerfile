# Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage with both nginx and node
FROM node:20-alpine

# Install nginx and apache2-utils for htpasswd
RUN apk add --no-cache nginx apache2-utils

WORKDIR /app

# Copy package files and install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy server code
COPY server ./server

# Copy built frontend
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Create htpasswd file (admin:admin)
RUN htpasswd -cb /etc/nginx/.htpasswd admin admin

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Create startup script
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'nginx' >> /start.sh && \
    echo 'exec node --experimental-strip-types server/index.ts' >> /start.sh && \
    chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"]
