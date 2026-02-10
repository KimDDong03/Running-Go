import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

const PeriodSchema = z.enum(['WEEKLY', 'MONTHLY', 'ALL_TIME']);

export const rankingRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ period: PeriodSchema }).optional())
    .query(async ({ input }) => {
      const period = input?.period ?? 'ALL_TIME';

      const popularCourses = await prisma.course.findMany({
        where: { isPublic: true, status: 'ACTIVE' },
        orderBy: {
          likes: { _count: 'desc' },
        },
        take: 20,
        include: {
          _count: { select: { likes: true } },
        },
      });

      const userRankings = await prisma.userRanking.findMany({
        where: { period },
        orderBy: { score: 'desc' },
        take: 20,
        include: { user: true },
      });

      const courseRankings = await prisma.courseRanking.findMany({
        orderBy: { runCount: 'desc' },
        take: 20,
        include: { course: true },
      });

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
        })),
        collectorRankings: userRankings
          .filter((ranking) => ranking.type === 'COLLECTOR')
          .map((ranking) => ({
            id: ranking.id,
            userId: ranking.userId,
            name: ranking.user.name,
            score: ranking.score,
            collectedCount: ranking.score,
          })),
        creatorRankings: userRankings
          .filter((ranking) => ranking.type === 'CREATOR')
          .map((ranking) => ({
            id: ranking.id,
            userId: ranking.userId,
            name: ranking.user.name,
            score: ranking.score,
            collectedCount: 0,
          })),
        courseRankings: courseRankings.map((ranking) => ({
          id: ranking.id,
          courseId: ranking.courseId,
          courseTitle: ranking.course.title,
          runCount: ranking.runCount,
        })),
      };
    }),
});
