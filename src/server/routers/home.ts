import { createTRPCRouter, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

export const homeRouter = createTRPCRouter({
  summary: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [runStats, collectionCount, popularCourses] = await Promise.all([
        prisma.runSession.aggregate({
          where: {
            userId,
            createdAt: { gte: monthStart, lte: now },
          },
          _sum: { distance: true, duration: true },
        }),
        prisma.collection.count({
          where: { userId, course: { creatorId: { not: userId } } },
        }),
        prisma.course.findMany({
          where: { isPublic: true, status: 'ACTIVE' },
          orderBy: { likes: { _count: 'desc' } },
          take: 3,
          include: { _count: { select: { likes: true } } },
        }),
      ]);

      const recommended = popularCourses[0] ?? null;

      return {
        stats: {
          distanceKm: runStats._sum.distance ?? 0,
          durationSec: runStats._sum.duration ?? 0,
          collectionCount,
        },
        recommended: recommended
          ? {
            id: recommended.id,
            title: recommended.title,
            totalDistance: recommended.totalDistance,
            likeCount: recommended._count.likes,
            centerLat: recommended.centerLat,
            centerLng: recommended.centerLng,
            waypoints: recommended.waypoints,
          }
          : null,
        popular: popularCourses.map((course) => ({
          id: course.id,
          title: course.title,
          totalDistance: course.totalDistance,
          likeCount: course._count.likes,
          centerLat: course.centerLat,
          centerLng: course.centerLng,
          waypoints: course.waypoints,
        })),
      };
    }),
});
