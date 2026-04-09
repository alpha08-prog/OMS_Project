"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBirthday = createBirthday;
exports.getBirthdays = getBirthdays;
exports.getTodayBirthdays = getTodayBirthdays;
exports.getUpcomingBirthdays = getUpcomingBirthdays;
exports.getBirthdayById = getBirthdayById;
exports.updateBirthday = updateBirthday;
exports.deleteBirthday = deleteBirthday;
exports.getTodayBirthdayCount = getTodayBirthdayCount;
const prisma_1 = __importDefault(require("../lib/prisma"));
const response_1 = require("../utils/response");
const pagination_1 = require("../utils/pagination");
/**
 * Create a new birthday entry
 * POST /api/birthdays
 */
async function createBirthday(req, res) {
    try {
        const { name, phone, dob, relation, notes } = req.body;
        const userId = req.user.id;
        // Prevent duplicate entries by full name (case-insensitive)
        const duplicate = await prisma_1.default.birthday.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (duplicate) {
            (0, response_1.sendError)(res, `A birthday entry for "${name}" already exists`, 409);
            return;
        }
        const birthday = await prisma_1.default.birthday.create({
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
        (0, response_1.sendSuccess)(res, birthday, 'Birthday entry created successfully', 201);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to create birthday entry', error);
    }
}
/**
 * Get all birthday entries with pagination
 * GET /api/birthdays
 */
async function getBirthdays(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.getPagination)(req.query);
        const { search, relation, month } = req.query;
        // Build where clause
        const where = {};
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
                const birthdays = await prisma_1.default.$queryRaw `
          SELECT b.*, u.name as "createdByName", u.email as "createdByEmail"
          FROM birthdays b
          LEFT JOIN users u ON b."createdById" = u.id
          WHERE EXTRACT(MONTH FROM b.dob) = ${monthNum}
          ORDER BY EXTRACT(DAY FROM b.dob) ASC
          LIMIT ${limit} OFFSET ${skip}
        `;
                const countResult = await prisma_1.default.$queryRaw `
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
            prisma_1.default.birthday.findMany({
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
            prisma_1.default.birthday.count({ where }),
        ]);
        res.json((0, pagination_1.getPaginatedResponse)(birthdays, total, page, limit));
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get birthdays', error);
    }
}
/**
 * Get today's birthdays
 * GET /api/birthdays/today
 */
async function getTodayBirthdays(req, res) {
    try {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();
        // Use raw query to filter by month and day
        const birthdays = await prisma_1.default.$queryRaw `
      SELECT id, name, phone, dob, relation, notes, "createdAt"
      FROM birthdays
      WHERE EXTRACT(MONTH FROM dob) = ${month}
        AND EXTRACT(DAY FROM dob) = ${day}
      ORDER BY name ASC
    `;
        (0, response_1.sendSuccess)(res, birthdays, "Today's birthdays retrieved successfully");
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get birthdays', error);
    }
}
/**
 * Get upcoming birthdays (next 7 days)
 * GET /api/birthdays/upcoming
 */
async function getUpcomingBirthdays(req, res) {
    try {
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();
        // Get birthdays for the next 7 days (handling month boundaries)
        const birthdays = await prisma_1.default.$queryRaw `
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
        (0, response_1.sendSuccess)(res, birthdays, 'Upcoming birthdays retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get upcoming birthdays', error);
    }
}
/**
 * Get a single birthday entry
 * GET /api/birthdays/:id
 */
async function getBirthdayById(req, res) {
    try {
        const { id } = req.params;
        const birthday = await prisma_1.default.birthday.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        if (!birthday) {
            (0, response_1.sendNotFound)(res, 'Birthday entry not found');
            return;
        }
        (0, response_1.sendSuccess)(res, birthday, 'Birthday entry retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get birthday entry', error);
    }
}
/**
 * Update a birthday entry
 * PUT /api/birthdays/:id
 */
async function updateBirthday(req, res) {
    try {
        const { id } = req.params;
        const { name, phone, dob, relation, notes } = req.body;
        const existing = await prisma_1.default.birthday.findUnique({ where: { id } });
        if (!existing) {
            (0, response_1.sendNotFound)(res, 'Birthday entry not found');
            return;
        }
        const birthday = await prisma_1.default.birthday.update({
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
        (0, response_1.sendSuccess)(res, birthday, 'Birthday entry updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update birthday entry', error);
    }
}
/**
 * Delete a birthday entry
 * DELETE /api/birthdays/:id
 */
async function deleteBirthday(req, res) {
    try {
        const { id } = req.params;
        const existing = await prisma_1.default.birthday.findUnique({ where: { id } });
        if (!existing) {
            (0, response_1.sendNotFound)(res, 'Birthday entry not found');
            return;
        }
        await prisma_1.default.birthday.delete({ where: { id } });
        (0, response_1.sendSuccess)(res, null, 'Birthday entry deleted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete birthday entry', error);
    }
}
/**
 * Get birthday count for today (for dashboard stats)
 */
async function getTodayBirthdayCount() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    const result = await prisma_1.default.$queryRaw `
    SELECT COUNT(*) as count FROM birthdays
    WHERE EXTRACT(MONTH FROM dob) = ${month}
      AND EXTRACT(DAY FROM dob) = ${day}
  `;
    return Number(result[0]?.count || 0);
}
//# sourceMappingURL=birthday.controller.js.map