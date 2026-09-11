# ── Stage 1: Build frontend ──
FROM node:22-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npx vite build

# ── Stage 2: Production backend + static frontend ──
FROM node:22-alpine
WORKDIR /app

# Backend deps
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Backend source
COPY backend/ ./

# Frontend build output → served at /app/public/static
COPY --from=frontend-build /build/frontend/dist ./public/static

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "server.js"]
