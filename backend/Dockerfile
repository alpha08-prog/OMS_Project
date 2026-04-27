FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY . .

# Build TypeScript
RUN npm install --no-save typescript @types/node && npm run build

# Drop dev tooling to keep the image lean
RUN npm prune --omit=dev

EXPOSE 5000

CMD ["npm", "start"]
