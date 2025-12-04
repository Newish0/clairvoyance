FROM oven/bun:1.3 AS app-builder
WORKDIR /usr/src/app

# Accept build arg for API URL
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
WORKDIR /usr/src/app/transit-app/
RUN bun install --frozen-lockfile
RUN bunx vite build   


# --- Production Nginx image ---
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# Copy Vite build output
COPY --from=app-builder /usr/src/app/transit-app/dist/ ./

# Copy nginx config
COPY ./gateway/nginx.conf /etc/nginx/nginx.conf

# Remove default nginx config to avoid conflicts
RUN rm -f /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
