import { Response } from 'express';
import { NewsPriority } from '@prisma/client';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, sendNotFound, sendServerError } from '../utils/response';
import { parsePagination, calculatePaginationMeta } from '../utils/pagination';
import type { AuthenticatedRequest, NewsFilters } from '../types';

/**
 * Create news intelligence entry
 * POST /api/news
 */
export async function createNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const {
      headline,
      category,
      priority,
      mediaSource,
      region,
      description,
      imageUrl,
    } = req.body;

    const news = await prisma.newsIntelligence.create({
      data: {
        headline,
        category,
        priority: priority || NewsPriority.NORMAL,
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

    sendSuccess(res, news, 'News intelligence created successfully', 201);
  } catch (error) {
    sendServerError(res, 'Failed to create news intelligence', error);
  }
}

/**
 * Get all news with pagination and filters
 * GET /api/news
 */
export async function getNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { page, limit, skip } = parsePagination(req.query as { page?: string; limit?: string });
    const filters = req.query as NewsFilters;

    // Build where clause
    const where: any = {};

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
      prisma.newsIntelligence.count({ where }),
      prisma.newsIntelligence.findMany({
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

    const meta = calculatePaginationMeta(total, page, limit);
    sendSuccess(res, newsList, 'News retrieved successfully', 200, meta);
  } catch (error) {
    sendServerError(res, 'Failed to get news', error);
  }
}

/**
 * Get single news by ID
 * GET /api/news/:id
 */
export async function getNewsById(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    const news = await prisma.newsIntelligence.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!news) {
      sendNotFound(res, 'News not found');
      return;
    }

    sendSuccess(res, news, 'News retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get news', error);
  }
}

/**
 * Update news
 * PUT /api/news/:id
 */
export async function updateNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    delete updateData.id;
    delete updateData.createdById;
    delete updateData.createdAt;

    const news = await prisma.newsIntelligence.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, news, 'News updated successfully');
  } catch (error) {
    sendServerError(res, 'Failed to update news', error);
  }
}

/**
 * Delete news
 * DELETE /api/news/:id
 */
export async function deleteNews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.newsIntelligence.delete({
      where: { id },
    });

    sendSuccess(res, null, 'News deleted successfully');
  } catch (error) {
    sendServerError(res, 'Failed to delete news', error);
  }
}

/**
 * Get critical news alerts
 * GET /api/news/alerts/critical
 */
export async function getCriticalAlerts(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const news = await prisma.newsIntelligence.findMany({
      where: {
        priority: NewsPriority.CRITICAL,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    sendSuccess(res, news, 'Critical alerts retrieved successfully');
  } catch (error) {
    sendServerError(res, 'Failed to get critical alerts', error);
  }
}
