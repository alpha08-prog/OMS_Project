"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.withRetry = withRetry;
require("dotenv/config");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
}
function createPrismaClient() {
    const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    return new client_1.PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
}
const prisma = globalThis.prisma || createPrismaClient();
exports.prisma = prisma;
if (process.env.NODE_ENV !== 'production') {
    globalThis.prisma = prisma;
}
// Retry wrapper for transient connection errors (Neon serverless cold starts)
async function withRetry(operation, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            const isTransient = error?.code === 'P1001' ||
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
exports.default = prisma;
//# sourceMappingURL=prisma.js.map