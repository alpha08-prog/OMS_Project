
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const today = new Date('2026-01-25T00:00:00Z');
        const requests = await prisma.trainRequest.findMany({
            where: {
                createdAt: {
                    gte: today,
                },
            },
            select: {
                passengerName: true,
                contactNumber: true,
                createdAt: true,
            },
        });

        console.log(`FOUND ${requests.length} REQUESTS CREATED TODAY`);
        requests.forEach(r => {
            console.log(`PASSENGER: ${r.passengerName}`);
            console.log(`CONTACT: ${r.contactNumber}`);
            console.log(`DATE: ${r.createdAt}`);
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
