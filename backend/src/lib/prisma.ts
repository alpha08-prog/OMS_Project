import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Prevent multiple instances of Prisma Client in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const prisma = globalThis.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}

// Retry wrapper for transient connection errors (Neon serverless cold starts)
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const isTransient =
        error?.code === 'P1001' ||
        error?.code === 'P1008' ||
        error?.message?.includes('connection') ||
        error?.message?.includes('Closed');
      if (isTransient && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Graceful shutdown
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });

export { prisma };
export default prisma;
