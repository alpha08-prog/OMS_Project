"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNews = createNews;
exports.getNews = getNews;
exports.getNewsById = getNewsById;
exports.updateNews = updateNews;
exports.deleteNews = deleteNews;
exports.getCriticalAlerts = getCriticalAlerts;
const client_1 = require("@prisma/client");
const prisma_1 = __importDefault(require("../lib/prisma"));
const response_1 = require("../utils/response");
const pagination_1 = require("../utils/pagination");
/**
 * Create news intelligence entry
 * POST /api/news
 */
async function createNews(req, res) {
    try {
        if (!req.user) {
            (0, response_1.sendError)(res, 'Not authenticated', 401);
            return;
        }
        const { headline, category, priority, mediaSource, region, description, imageUrl, } = req.body;
        const news = await prisma_1.default.newsIntelligence.create({
            data: {
                headline,
                category,
                priority: priority || client_1.NewsPriority.NORMAL,
                mediaSource,
                region,
                description,
                imageUrl,
                createdById: req.user.id,
            },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, news, 'News intelligence created successfully', 201);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to create news intelligence', error);
    }
}
/**
 * Get all news with pagination and filters
 * GET /api/news
 */
async function getNews(req, res) {
    try {
        const { page, limit, skip } = (0, pagination_1.parsePagination)(req.query);
        const filters = req.query;
        // Build where clause
        const where = {};
        if (filters.priority) {
            where.priority = filters.priority;
        }
        if (filters.category) {
            where.category = filters.category;
        }
        if (filters.region) {
            where.region = { contains: filters.region, mode: 'insensitive' };
        }
        if (filters.search) {
            where.OR = [
                { headline: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
                { mediaSource: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        const [total, newsList] = await Promise.all([
            prisma_1.default.newsIntelligence.count({ where }),
            prisma_1.default.newsIntelligence.findMany({
                where,
                skip,
                take: limit,
                orderBy: [
                    { priority: 'desc' }, // Critical first
                    { createdAt: 'desc' },
                ],
                include: {
                    createdBy: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
        ]);
        const meta = (0, pagination_1.calculatePaginationMeta)(total, page, limit);
        (0, response_1.sendSuccess)(res, newsList, 'News retrieved successfully', 200, meta);
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get news', error);
    }
}
/**
 * Get single news by ID
 * GET /api/news/:id
 */
async function getNewsById(req, res) {
    try {
        const { id } = req.params;
        const news = await prisma_1.default.newsIntelligence.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        if (!news) {
            (0, response_1.sendNotFound)(res, 'News not found');
            return;
        }
        (0, response_1.sendSuccess)(res, news, 'News retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get news', error);
    }
}
/**
 * Update news
 * PUT /api/news/:id
 */
async function updateNews(req, res) {
    try {
        const { id } = req.params;
        const updateData = req.body;
        delete updateData.id;
        delete updateData.createdById;
        delete updateData.createdAt;
        const news = await prisma_1.default.newsIntelligence.update({
            where: { id },
            data: updateData,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, news, 'News updated successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to update news', error);
    }
}
/**
 * Delete news
 * DELETE /api/news/:id
 */
async function deleteNews(req, res) {
    try {
        const { id } = req.params;
        await prisma_1.default.newsIntelligence.delete({
            where: { id },
        });
        (0, response_1.sendSuccess)(res, null, 'News deleted successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to delete news', error);
    }
}
/**
 * Get critical news alerts
 * GET /api/news/alerts/critical
 */
async function getCriticalAlerts(req, res) {
    try {
        const news = await prisma_1.default.newsIntelligence.findMany({
            where: {
                priority: client_1.NewsPriority.CRITICAL,
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                createdBy: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        (0, response_1.sendSuccess)(res, news, 'Critical alerts retrieved successfully');
    }
    catch (error) {
        (0, response_1.sendServerError)(res, 'Failed to get critical alerts', error);
    }
}
//# sourceMappingURL=news.controller.js.map