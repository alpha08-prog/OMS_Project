import { PrismaClient, UserRole, GrievanceType, GrievanceStatus, ActionRequired, NewsPriority, NewsCategory, TrainRequestStatus, TourDecision } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ===========================================
  // Create Users
  // ===========================================
  console.log('Creating users...');

  const superAdminPassword = await hashPassword('SuperAdmin@123');
  const adminPassword = await hashPassword('Admin@123');
  const staffPassword = await hashPassword('Staff@123');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@oms.gov.in' },
    update: {},
    create: {
      name: 'Super Administrator',
      email: 'superadmin@oms.gov.in',
      phone: '9000000001',
      password: superAdminPassword,
      role: UserRole.SUPER_ADMIN,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@oms.gov.in' },
    update: {},
    create: {
      name: 'Office Administrator',
      email: 'admin@oms.gov.in',
      phone: '9000000002',
      password: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@oms.gov.in' },
    update: {},
    create: {
      name: 'Data Entry Staff',
      email: 'staff@oms.gov.in',
      phone: '9000000003',
      password: staffPassword,
      role: UserRole.STAFF,
    },
  });

  console.log('✅ Users created');
  console.log('   - Super Admin: superadmin@oms.gov.in / SuperAdmin@123');
  console.log('   - Admin: admin@oms.gov.in / Admin@123');
  console.log('   - Staff: staff@oms.gov.in / Staff@123\n');

  // ===========================================
  // Create Grievances
  // ===========================================
  console.log('Creating sample grievances...');

  const grievances = [
    {
      petitionerName: 'Rajesh Kumar',
      mobileNumber: '9876543210',
      constituency: 'Ward 12',
      grievanceType: GrievanceType.WATER,
      description: 'Water supply has been irregular for the past 2 weeks. Residents are facing severe issues.',
      monetaryValue: 25000,
      actionRequired: ActionRequired.GENERATE_LETTER,
      referencedBy: 'Local Councillor',
      status: GrievanceStatus.OPEN,
      createdById: staff.id,
    },
    {
      petitionerName: 'Priya Sharma',
      mobileNumber: '9876543211',
      constituency: 'Central Ward',
      grievanceType: GrievanceType.ROAD,
      description: 'Major potholes on main road causing accidents. Urgent repair needed.',
      monetaryValue: 150000,
      actionRequired: ActionRequired.FORWARD_TO_DEPT,
      referencedBy: 'MLA Office',
      status: GrievanceStatus.IN_PROGRESS,
      createdById: staff.id,
    },
    {
      petitionerName: 'Mohammad Ali',
      mobileNumber: '9876543212',
      constituency: 'West Zone',
      grievanceType: GrievanceType.HEALTH,
      description: 'PHC not operational for 3 days. Patients being turned away.',
      monetaryValue: null,
      actionRequired: ActionRequired.CALL_OFFICIAL,
      referencedBy: 'DC Office',
      status: GrievanceStatus.VERIFIED,
      isVerified: true,
      verifiedById: admin.id,
      createdById: staff.id,
    },
    {
      petitionerName: 'Anita Gupta',
      mobileNumber: '9876543213',
      constituency: 'East Division',
      grievanceType: GrievanceType.FINANCIAL_AID,
      description: 'Request for financial assistance for daughter\'s higher education.',
      monetaryValue: 50000,
      actionRequired: ActionRequired.SCHEDULE_MEETING,
      referencedBy: 'Party Worker',
      status: GrievanceStatus.OPEN,
      createdById: staff.id,
    },
    {
      petitionerName: 'Vikram Singh',
      mobileNumber: '9876543214',
      constituency: 'Ward 5',
      grievanceType: GrievanceType.ELECTRICITY,
      description: 'Frequent power cuts affecting local businesses. Need transformer upgrade.',
      monetaryValue: 200000,
      actionRequired: ActionRequired.FORWARD_TO_DEPT,
      referencedBy: 'Business Association',
      status: GrievanceStatus.RESOLVED,
      isVerified: true,
      verifiedById: admin.id,
      createdById: staff.id,
    },
  ];

  for (const grievance of grievances) {
    await prisma.grievance.create({ data: grievance });
  }

  console.log(`✅ ${grievances.length} grievances created\n`);

  // ===========================================
  // Create Visitors
  // ===========================================
  console.log('Creating sample visitors...');

  const today = new Date();
  const visitors = [
    {
      name: 'Suresh Patel',
      designation: 'Party Worker',
      phone: '9876543220',
      purpose: 'Discussion on upcoming election strategy',
      referencedBy: 'District President',
      createdById: staff.id,
    },
    {
      name: 'Dr. Meera Joshi',
      designation: 'Official',
      phone: '9876543221',
      purpose: 'Health department coordination meeting',
      referencedBy: 'CMO Office',
      createdById: staff.id,
    },
    {
      name: 'Ramesh Verma',
      designation: 'Public',
      phone: '9876543222',
      purpose: 'Job recommendation letter request',
      referencedBy: 'Self',
      createdById: staff.id,
    },
  ];

  for (const visitor of visitors) {
    await prisma.visitor.create({ data: visitor });
  }

  console.log(`✅ ${visitors.length} visitors created\n`);

  // ===========================================
  // Create Birthdays (Separate from Visitors)
  // ===========================================
  console.log('Creating sample birthday entries...');

  const birthdays = [
    {
      name: 'Rajendra Singh',
      phone: '9876543300',
      dob: new Date(1980, today.getMonth(), today.getDate()), // Today's birthday
      relation: 'Party Worker',
      notes: 'Active party worker since 2010',
      createdById: staff.id,
    },
    {
      name: 'Smt. Kamala Devi',
      phone: '9876543301',
      dob: new Date(1965, today.getMonth(), today.getDate()), // Today's birthday
      relation: 'VIP',
      notes: 'Senior party leader, ex-MLA',
      createdById: staff.id,
    },
    {
      name: 'Dr. Anil Sharma',
      phone: '9876543302',
      dob: new Date(1975, 5, 15),
      relation: 'Official',
      notes: 'District Collector',
      createdById: staff.id,
    },
    {
      name: 'Shri Mohan Lal',
      phone: '9876543303',
      dob: new Date(1970, 8, 20),
      relation: 'Supporter',
      notes: 'Major donor and supporter',
      createdById: staff.id,
    },
  ];

  for (const birthday of birthdays) {
    await prisma.birthday.create({ data: birthday });
  }

  console.log(`✅ ${birthdays.length} birthday entries created\n`);

  // ===========================================
  // Create News Intelligence
  // ===========================================
  console.log('Creating sample news intelligence...');

  const newsItems = [
    {
      headline: 'Opposition Rally Announced for Next Week',
      category: NewsCategory.OPPOSITION,
      priority: NewsPriority.CRITICAL,
      mediaSource: 'Social Media - Twitter',
      region: 'Central Ward',
      description: 'Opposition party has announced a major rally in the constituency next Saturday.',
      createdById: staff.id,
    },
    {
      headline: 'New Development Project Approved',
      category: NewsCategory.DEVELOPMENT_WORK,
      priority: NewsPriority.NORMAL,
      mediaSource: 'Local Newspaper - Dainik Bhaskar',
      region: 'Ward 12',
      description: 'Rs. 5 crore development project approved for infrastructure improvement.',
      createdById: staff.id,
    },
    {
      headline: 'Fake News Spreading About Water Scarcity',
      category: NewsCategory.CONSPIRACY_FAKE_NEWS,
      priority: NewsPriority.HIGH,
      mediaSource: 'WhatsApp Forward',
      region: 'West Zone',
      description: 'Misleading information being circulated about water department.',
      createdById: staff.id,
    },
  ];

  for (const news of newsItems) {
    await prisma.newsIntelligence.create({ data: news });
  }

  console.log(`✅ ${newsItems.length} news items created\n`);

  // ===========================================
  // Create Train Requests
  // ===========================================
  console.log('Creating sample train requests...');

  const trainRequests = [
    {
      passengerName: 'Ashok Mehta',
      pnrNumber: '4521678903',
      trainName: 'Rajdhani Express',
      trainNumber: '12301',
      journeyClass: 'AC 2 Tier',
      dateOfJourney: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      fromStation: 'NDLS',
      toStation: 'HWH',
      route: 'New Delhi - Howrah',
      referencedBy: 'MLA Office',
      status: TrainRequestStatus.PENDING,
      createdById: staff.id,
    },
    {
      passengerName: 'Sunita Devi',
      pnrNumber: '4521678904',
      trainName: 'Shatabdi Express',
      trainNumber: '12002',
      journeyClass: 'AC Chair Car',
      dateOfJourney: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      fromStation: 'NDLS',
      toStation: 'BCT',
      route: 'New Delhi - Mumbai Central',
      referencedBy: 'Party Office',
      status: TrainRequestStatus.APPROVED,
      approvedById: admin.id,
      createdById: staff.id,
    },
  ];

  for (const request of trainRequests) {
    await prisma.trainRequest.create({ data: request });
  }

  console.log(`✅ ${trainRequests.length} train requests created\n`);

  // ===========================================
  // Create Tour Programs
  // ===========================================
  console.log('Creating sample tour programs...');

  const tourPrograms = [
    {
      eventName: 'Ward Office Inauguration',
      organizer: 'Local MLA Office',
      dateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      venue: 'Ward 12 Community Hall',
      venueLink: 'https://maps.google.com/?q=Ward+12+Community+Hall',
      description: 'Inauguration ceremony for new ward office building',
      referencedBy: 'District Collector',
      decision: TourDecision.ACCEPTED,
      createdById: staff.id,
    },
    {
      eventName: 'School Annual Day',
      organizer: 'Government School, Sector 5',
      dateTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      venue: 'School Auditorium',
      venueLink: 'https://maps.google.com/?q=Govt+School+Sector+5',
      description: 'Chief guest invitation for annual day function',
      referencedBy: 'Education Department',
      decision: TourDecision.PENDING,
      createdById: staff.id,
    },
    {
      eventName: 'CSR Fund Distribution',
      organizer: 'Chamber of Commerce',
      dateTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      venue: 'Conference Hall, District Office',
      venueLink: null,
      description: 'Distribution of CSR funds to beneficiaries',
      referencedBy: 'Industries Department',
      decision: TourDecision.ACCEPTED,
      createdById: staff.id,
    },
  ];

  for (const program of tourPrograms) {
    await prisma.tourProgram.create({ data: program });
  }

  console.log(`✅ ${tourPrograms.length} tour programs created\n`);

  // ===========================================
  // Create Letter Templates
  // ===========================================
  console.log('Creating letter templates...');

  const templates = [
    {
      name: 'To DC',
      subject: 'Request for Action on Grievance',
      body: 'Dear Sir/Madam,\n\nThis is to bring to your notice the grievance submitted by [PETITIONER_NAME] regarding [GRIEVANCE_TYPE].\n\nPlease take necessary action.\n\nRegards',
      department: 'District Collector Office',
    },
    {
      name: 'To Police Commissioner',
      subject: 'Law and Order Matter',
      body: 'Dear Sir,\n\nKindly look into the matter raised by [PETITIONER_NAME].\n\nYour immediate attention is requested.\n\nRegards',
      department: 'Police Department',
    },
    {
      name: 'To PWD',
      subject: 'Road/Infrastructure Complaint',
      body: 'Dear Sir,\n\nThis is regarding a road repair request in [CONSTITUENCY].\n\nPlease arrange for inspection and repair.\n\nRegards',
      department: 'Public Works Department',
    },
  ];

  for (const template of templates) {
    await prisma.letterTemplate.upsert({
      where: { name: template.name },
      update: {},
      create: template,
    });
  }

  console.log(`✅ ${templates.length} letter templates created\n`);

  // ===========================================
  // Summary
  // ===========================================
  console.log('════════════════════════════════════════════════');
  console.log('🎉 Database seeding completed successfully!');
  console.log('════════════════════════════════════════════════\n');
  console.log('Test Credentials:');
  console.log('─────────────────');
  console.log('Super Admin: superadmin@oms.gov.in / SuperAdmin@123');
  console.log('Admin:       admin@oms.gov.in / Admin@123');
  console.log('Staff:       staff@oms.gov.in / Staff@123\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
