import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
declare global {
    var prisma: PrismaClient | undefined;
}
declare const prisma: PrismaClient<import("@prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/client").DefaultArgs>;
export declare function withRetry<T>(operation: () => Promise<T>, maxRetries?: number, delayMs?: number): Promise<T>;
export { prisma };
export default prisma;
//# sourceMappingURL=prisma.d.ts.map