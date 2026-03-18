FROM node:20-alpine

WORKDIR /app

# Install openssl for Prisma compatibility
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript code
RUN npm run build

# Expose backend port
EXPOSE 5000

# Run database migrations and start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
