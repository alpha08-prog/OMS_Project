FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for build + prisma generate)
RUN npm install

# Copy all files
COPY . .

# Prisma v7 reads DATABASE_URL at config-load time during `prisma generate`.
# We supply a dummy value here — no real DB connection is made during build.
# The actual DATABASE_URL is injected at runtime via Catalyst AppSail env vars.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma client (Wasm-based, no native binaries needed)
RUN npx prisma generate

# Build TypeScript code
RUN npm run build

# Expose backend port
EXPOSE 5000

# Run database migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
