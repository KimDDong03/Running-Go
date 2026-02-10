import { createTRPCRouter, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { getTier } from '@/lib/tier';

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

export const profileRouter = createTRPCRouter({
  summary: publicProcedure.query(async ({ ctx }) => {
    const userId = await getOrCreateGuestUserId(ctx.userId);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    const [createdCount, collectionCount, runStats, runCount, createdCourses] = await Promise.all([
      prisma.course.count({
        where: { creatorId: userId, status: { not: 'DELETED' } },
      }),
      prisma.collection.count({
        where: { userId, course: { creatorId: { not: userId } } },
      }),
      prisma.runSession.aggregate({
        where: { userId },
        _sum: { distance: true, duration: true },
      }),
      prisma.runSession.count({ where: { userId } }),
      prisma.course.findMany({
        where: { creatorId: userId, status: { not: 'DELETED' } },
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: { _count: { select: { likes: true } } },
      }),
    ]);

    return {
      user: {
        name: user?.name ?? '게스트',
        isGuest: user?.provider === 'guest',
      },
      stats: {
        createdCourses: createdCount,
        collectedCourses: collectionCount,
        runCount,
        totalDistance: runStats._sum.distance ?? 0,
        totalDuration: runStats._sum.duration ?? 0,
      },
      tier: getTier(collectionCount),
      createdCoursePreview: createdCourses.map((course) => ({
        id: course.id,
        title: course.title,
        totalDistance: course.totalDistance,
        likeCount: course._count.likes,
      })),
    };
  }),
});
