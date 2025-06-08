FROM node:20-slim AS builder

# Create app directory
WORKDIR /app

# Install dependencies including Python for certain npm packages
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Install production dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set environment to production
ENV NODE_ENV=production

# Copy package.json files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy build files from the builder stage
COPY --from=builder /app/dist ./dist

# Create temp directory for test files
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Create an unprivileged user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeuser \
    && chown -R nodeuser:nodejs /app

# Set the user
USER nodeuser

# Run the app
CMD ["node", "dist/index.js"]