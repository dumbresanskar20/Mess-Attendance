# Multi-arch Dockerfile for Device Bridge (PC / Raspberry Pi)
# Stage 1: Build TypeScript source
FROM node:20-slim AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies for compilation
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile TypeScript to JavaScript in /app/dist
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4001
ENV BRIDGE_PORT=4001

# Copy compiled files and package files
COPY package*.json ./
COPY --from=builder /app/dist ./dist

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Expose device bridge HTTP port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4001/status').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start device bridge
CMD ["node", "dist/index.js"]
