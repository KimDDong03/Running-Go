import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

const PeriodSchema = z.enum(['WEEKLY', 'MONTHLY', 'ALL_TIME']);

const getPeriodRange = (period: z.infer<typeof PeriodSchema>) => {
  const now = new Date();
  if (period === 'ALL_TIME') {
    return { startAt: null as Date | null, endAt: now };
  }

  const startAt = new Date(now);
  if (period === 'WEEKLY') {
    startAt.setDate(startAt.getDate() - 7);
  } else {
    startAt.setMonth(startAt.getMonth() - 1);
  }

  return { startAt, endAt: now };
};

const buildPeriodFilter = (startAt: Date | null, endAt: Date) => {
  if (!startAt) return undefined;
  return {
    gte: startAt,
    lte: endAt,
  };
};

export const rankingRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ period: PeriodSchema }).optional())
    .query(async ({ input }) => {
      const period = input?.period ?? 'ALL_TIME';
      const { startAt, endAt } = getPeriodRange(period);
      const periodDateFilter = buildPeriodFilter(startAt, endAt);

      const popularCourses = await prisma.course.findMany({
        where: { isPublic: true, status: 'ACTIVE' },
        orderBy: {
          likes: { _count: 'desc' },
        },
        take: 20,
        include: {
          _count: { select: { likes: true } },
          creator: { select: { name: true } },
        },
      });

      const collectorGrouped = await prisma.collection.groupBy({
        by: ['userId'],
        _count: { id: true },
        where: periodDateFilter ? { firstAt: periodDateFilter } : undefined,
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 20,
      });

      const collectorRankSource = (collectorGrouped.length === 0 && period !== 'ALL_TIME')
        ? await prisma.collection.groupBy({
            by: ['userId'],
            _count: { id: true },
            orderBy: {
              _count: {
                id: 'desc',
              },
            },
            take: 20,
          })
        : collectorGrouped;

      const collectorUserIds = collectorRankSource.map((item) => item.userId);
      const collectorUsers = collectorUserIds.length
        ? await prisma.user.findMany({
            where: { id: { in: collectorUserIds } },
            select: { id: true, name: true },
          })
        : [];
      const collectorUserMap = new Map(collectorUsers.map((user) => [user.id, user.name]));

      const creatorGrouped = await prisma.course.groupBy({
        by: ['creatorId'],
        _count: { id: true },
        where: {
          status: 'ACTIVE',
          ...(periodDateFilter ? { createdAt: periodDateFilter } : {}),
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 20,
      });

      const creatorRankingsRaw = (creatorGrouped.length === 0 && period !== 'ALL_TIME')
        ? await prisma.course.groupBy({
            by: ['creatorId'],
            _count: { id: true },
            where: { status: 'ACTIVE' },
            orderBy: {
              _count: {
                id: 'desc',
              },
            },
            take: 20,
          })
            .then((rows) => rows.map((row) => [row.creatorId, row._count.id] as const))
        : creatorGrouped.map((row) => [row.creatorId, row._count.id] as const);

      const creatorUserIds = creatorRankingsRaw.map(([userId]) => userId);
      const creatorUsers = creatorUserIds.length
        ? await prisma.user.findMany({
            where: { id: { in: creatorUserIds } },
            select: { id: true, name: true },
          })
        : [];
      const creatorUserMap = new Map(creatorUsers.map((user) => [user.id, user.name]));

      const courseRunGrouped = await prisma.runSession.groupBy({
        by: ['courseId'],
        _count: { id: true },
        where: {
          courseId: { not: null },
          ...(startAt
            ? {
                createdAt: {
                  gte: startAt,
                  lte: endAt,
                },
              }
            : {}),
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 20,
      });

      const courseIds = courseRunGrouped
        .map((item) => item.courseId)
        .filter((courseId): courseId is string => Boolean(courseId));
      const rankedCourses = courseIds.length
        ? await prisma.course.findMany({
            where: {
              id: { in: courseIds },
              status: 'ACTIVE',
            },
            select: {
              id: true,
              title: true,
            },
          })
        : [];
      const rankedCourseMap = new Map(rankedCourses.map((course) => [course.id, course.title]));

      return {
        popularCourses: popularCourses.map((course) => ({
          id: course.id,
          title: course.title,
          thumbnailUrl: course.thumbnailUrl,
          totalDistance: course.totalDistance,
          likeCount: course._count.likes,
          centerLat: course.centerLat,
          centerLng: course.centerLng,
          waypoints: course.waypoints,
          creatorName: course.creator.name,
        })),
        collectorRankings: collectorRankSource.map((ranking) => ({
          id: `collector-${ranking.userId}`,
          userId: ranking.userId,
          name: collectorUserMap.get(ranking.userId) ?? null,
          score: ranking._count.id,
          collectedCount: ranking._count.id,
        })),
        creatorRankings: creatorRankingsRaw.map(([userId, score]) => ({
          id: `creator-${userId}`,
          userId,
          name: creatorUserMap.get(userId) ?? null,
          score,
          collectedCount: 0,
        })),
        courseRankings: courseRunGrouped
          .filter((ranking) => Boolean(ranking.courseId) && rankedCourseMap.has(ranking.courseId as string))
          .map((ranking) => ({
            id: `course-${ranking.courseId}`,
            courseId: ranking.courseId as string,
            courseTitle: rankedCourseMap.get(ranking.courseId as string) ?? '',
            runCount: ranking._count.id,
          })),
      };
    }),
});
