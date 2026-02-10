import { createTRPCRouter, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

const getOrCreateGuestUserId = async (userId: string | null) => {
  if (userId) return userId;
  const guest = await prisma.user.upsert({
    where: { providerId: 'guest' },
    update: {},
    create: {
      email: 'guest@running-go.local',
      name: '게스트',
      image: null,
      provider: 'guest',
      providerId: 'guest',
    },
  });
  return guest.id;
};

export const homeRouter = createTRPCRouter({
  summary: publicProcedure
    .query(async ({ ctx }) => {
      const userId = await getOrCreateGuestUserId(ctx.userId);
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
