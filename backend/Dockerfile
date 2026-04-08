FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for build + prisma generate)
RUN npm install

# Copy all files
COPY . .

# Generate Prisma client (Wasm-based, no native binaries needed)
RUN npx prisma generate

# Build TypeScript code
RUN npm run build

# Expose backend port
EXPOSE 5000

# Run database migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
