/**
 * One-time seed: copy existing Prisma User rows into the Catalyst AppUser table.
 *
 * Why? After auth migrates, login + middleware look up users in Catalyst.
 * The 3 seed users (admin, super_admin, staff) need to exist there too,
 * with their original Neon UUIDs preserved as `legacyId` so:
 *   - Existing JWT tokens (signed with UUID) keep validating
 *   - Existing rows in Visitor / Grievance / etc. (createdById = UUID)
 *     still resolve to the right user in lookupUsers()
 *
 * Idempotent: skips users whose legacyId already exists in AppUser.
 *
 * Run from backend/:
 *   npx ts-node scripts/seed-catalyst-users.ts
 */
import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { listAllRows, insertRow } from '../src/lib/catalyst-client';

const APPUSER_TABLE = 'AppUser';

async function main() {
  console.log('=== Seeding Catalyst AppUser from Prisma User ===\n');

  const prismaUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      password: true,
      role: true,
      isActive: true,
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiry: true,
      calendarConnected: true,
    },
  });
  console.log(`Found ${prismaUsers.length} users on Prisma:\n`);

  let existing: Awaited<ReturnType<typeof listAllRows>> = [];
  try {
    existing = await listAllRows(APPUSER_TABLE);
  } catch (err: any) {
    console.error('❌ Could not read Catalyst AppUser table:', err.message);
    process.exit(1);
  }

  const existingByLegacy = new Map<string, any>();
  const existingByEmail = new Map<string, any>();
  for (const r of existing) {
    if (r.legacyId) existingByLegacy.set(String(r.legacyId), r);
    if (r.email) existingByEmail.set(String(r.email).toLowerCase(), r);
  }

  let seeded = 0;
  let skipped = 0;

  for (const u of prismaUsers) {
    const lowerEmail = u.email.toLowerCase();
    if (existingByLegacy.has(u.id)) {
      console.log(`  ⏭  ${u.role.padEnd(12)} ${u.email}  — already in Catalyst (legacyId match)`);
      skipped++;
      continue;
    }
    if (existingByEmail.has(lowerEmail)) {
      console.log(`  ⏭  ${u.role.padEnd(12)} ${u.email}  — already in Catalyst (email match)`);
      skipped++;
      continue;
    }

    try {
      const row = await insertRow(APPUSER_TABLE, {
        name: u.name,
        email: lowerEmail,
        phone: u.phone || null,
        password: u.password, // already bcrypt-hashed in Prisma — copy as-is
        role: u.role,
        isActive: u.isActive,
        legacyId: u.id, // ← preserve old UUID
        googleAccessToken: u.googleAccessToken || null,
        googleRefreshToken: u.googleRefreshToken || null,
        googleTokenExpiry: u.googleTokenExpiry
          ? new Date(u.googleTokenExpiry).toISOString().replace('T', ' ').slice(0, 19)
          : null,
        calendarConnected: u.calendarConnected,
      });
      console.log(
        `  ✅ ${u.role.padEnd(12)} ${u.email}  → Catalyst ROWID ${row.ROWID} (legacyId=${u.id})`
      );
      seeded++;
    } catch (err: any) {
      console.error(`  ❌ ${u.email}: ${err.message}`);
    }
  }

  console.log(`\nSeeded: ${seeded}, Skipped: ${skipped}, Total: ${prismaUsers.length}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
