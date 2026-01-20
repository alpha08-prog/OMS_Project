import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthenticatedRequest } from '../types';
import { sendSuccess, sendError, sendNotFound, sendServerError } from '../utils/response';
import { getPagination, getPaginatedResponse } from '../utils/pagination';

/**
 * Create a new birthday entry
 * POST /api/birthdays
 */
export async function createBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { name, phone, dob, relation, notes } = req.body;
    const userId = req.user!.id;

    const birthday = await prisma.birthday.create({
      data: {
        name,
        phone,
        dob: new Date(dob),
        relation,
        notes,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, birthday, 'Birthday entry created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create birthday entry', error);
  }
}

/**
 * Get all birthday entries with pagination
 * GET /api/birthdays
 */
export async function getBirthdays(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { search, relation, month } = req.query;

    // Build where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search) } },
      ];
    }

    if (relation) {
      where.relation = String(relation);
    }

    // Filter by birth month
    if (month) {
      const monthNum = parseInt(String(month));
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        // Use raw query for month filtering
        const birthdays = await prisma.$queryRaw`
          SELECT b.*, u.name as "createdByName", u.email as "createdByEmail"
          FROM birthdays b
          LEFT JOIN users u ON b."createdById" = u.id
          WHERE EXTRACT(MONTH FROM b.dob) = ${monthNum}
          ORDER BY EXTRACT(DAY FROM b.dob) ASC
          LIMIT ${limit} OFFSET ${skip}
        `;
        
        const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) as count FROM birthdays
          WHERE EXTRACT(MONTH FROM dob) = ${monthNum}
        `;
        
        const total = Number(countResult[0]?.count || 0);
        
        res.json({
          success: true,
          data: birthdays,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
        return;
      }
    }

    const [birthdays, total] = await Promise.all([
      prisma.birthday.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { dob: 'asc' },
        skip,
        take: limit,
      }),
      prisma.birthday.count({ where }),
    ]);

    res.json(getPaginatedResponse(birthdays, total, page, limit));
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/**
 * Get today's birthdays
 * GET /api/birthdays/today
 */
export async function getTodayBirthdays(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Use raw query to filter by month and day
    const birthdays = await prisma.$queryRaw`
      SELECT id, name, phone, dob, relation, notes, "createdAt"
      FROM birthdays
      WHERE EXTRACT(MONTH FROM dob) = ${month}
        AND EXTRACT(DAY FROM dob) = ${day}
      ORDER BY name ASC
    `;

    sendSuccess(res, birthdays, "Today's birthdays retrieved successfully");
  } catch (error) {
    sendServerError(res, 'Failed to get birthdays', error);
  }
}

/**
 * Get upcoming birthdays (next 7 days)
 * GET /api/birthdays/upcoming
 */
export async function getUpcomingBirthdays(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    // Get birthdays for the next 7 days (handling month boundaries)
    const birthdays = await prisma.$queryRaw`
      SELECT id, name, phone, dob, relation, notes, "createdAt",
        CASE 
          WHEN EXTRACT(MONTH FROM dob) = ${currentMonth} AND EXTRACT(DAY FROM dob) >= ${currentDay}
            THEN EXTRACT(DAY FROM dob) - ${currentDay}
          WHEN EXTRACT(MONTH FROM dob) = ${currentMonth + 1 > 12 ? 1 : currentMonth + 1}
            THEN (
              CASE 
                WHEN ${currentMonth} IN (1,3,5,7,8,10,12) THEN 31 - ${currentDay} + EXTRACT(DAY FROM dob)
                WHEN ${currentMonth} IN (4,6,9,11) THEN 30 - ${currentDay} + EXTRACT(DAY FROM dob)
                ELSE 28 - ${currentDay} + EXTRACT(DAY FROM dob)
              END
            )
          ELSE 999
        END as days_until
      FROM birthdays
      WHERE (
        (EXTRACT(MONTH FROM dob) = ${currentMonth} AND EXTRACT(DAY FROM dob) >= ${currentDay} AND EXTRACT(DAY FROM dob) <= ${currentDay + 7})
        OR
        (EXTRACT(MONTH FROM dob) = ${currentMonth + 1 > 12 ? 1 : currentMonth + 1} AND EXTRACT(DAY FROM dob) <= 7)
      )
      ORDER BY days_until ASC
      LIMIT 10
    `;

    sendSuccess(res, birthdays, 'Upcoming birthdays retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get upcoming birthdays', error);
  }
}

/**
 * Get a single birthday entry
 * GET /api/birthdays/:id
 */
export async function getBirthdayById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const birthday = await prisma.birthday.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!birthday) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }

    sendSuccess(res, birthday, 'Birthday entry retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get birthday entry', error);
  }
}

/**
 * Update a birthday entry
 * PUT /api/birthdays/:id
 */
export async function updateBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { name, phone, dob, relation, notes } = req.body;

    const existing = await prisma.birthday.findUnique({ where: { id } });
    if (!existing) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }

    const birthday = await prisma.birthday.update({
      where: { id },
      data: {
        name,
        phone,
        dob: dob ? new Date(dob) : undefined,
        relation,
        notes,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, birthday, 'Birthday entry updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update birthday entry', error);
  }
}

/**
 * Delete a birthday entry
 * DELETE /api/birthdays/:id
 */
export async function deleteBirthday(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const existing = await prisma.birthday.findUnique({ where: { id } });
    if (!existing) {
      sendNotFound(res, 'Birthday entry not found');
      return;
    }

    await prisma.birthday.delete({ where: { id } });

    sendSuccess(res, null, 'Birthday entry deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete birthday entry', error);
  }
}

/**
 * Get birthday count for today (for dashboard stats)
 */
export async function getTodayBirthdayCount(): Promise<number> {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM birthdays
    WHERE EXTRACT(MONTH FROM dob) = ${month}
      AND EXTRACT(DAY FROM dob) = ${day}
  `;

  return Number(result[0]?.count || 0);
}
