
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const requests = await prisma.trainRequest.findMany({
            take: 5,
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                passengerName: true,
                contactNumber: true,
                createdAt: true,
            },
        });

        console.log('--- START DB CHECK ---');
        requests.forEach(r => {
            console.log(`PASSENGER: ${r.passengerName}`);
            console.log(`CONTACT: ${r.contactNumber}`);
            console.log(`DATE: ${r.createdAt}`);
            console.log('---');
        });
        console.log('--- END DB CHECK ---');
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
