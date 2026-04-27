/**
 * List existing users from Prisma User table for E2E testing.
 */
import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true },
    take: 10,
  });
  console.log('Existing users in Prisma:');
  for (const u of users) {
    console.log(`  ${u.role.padEnd(12)}  ${u.email}  (${u.name})  isActive=${u.isActive}  id=${u.id}`);
  }
  await prisma.$disconnect();
}

main();
