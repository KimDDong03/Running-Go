import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { getCollectorTier, getCreatorTier } from '@/lib/tier';

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
  updateAvatar: protectedProcedure
    .input(z.object({ image: z.string().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const image = input.image?.trim() ?? null;

      if (image) {
        const isDataImage = image.startsWith('data:image/');
        const isRemoteImage = image.startsWith('https://') || image.startsWith('http://');

        if (!isDataImage && !isRemoteImage) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '지원하지 않는 이미지 형식입니다' });
        }

        if (isDataImage && image.length > 1_500_000) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '이미지 용량이 너무 큽니다. 더 작은 이미지를 사용해주세요' });
        }
      }

      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: { image },
      });

      return {
        image: user.image,
      };
    }),

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
        image: user?.image ?? null,
        isGuest: user?.provider === 'guest',
      },
      stats: {
        createdCourses: createdCount,
        collectedCourses: collectionCount,
        runCount,
        totalDistance: runStats._sum.distance ?? 0,
        totalDuration: runStats._sum.duration ?? 0,
      },
      collectorTier: getCollectorTier(collectionCount),
      creatorTier: getCreatorTier(createdCount),
      createdCoursePreview: createdCourses.map((course) => ({
        id: course.id,
        title: course.title,
        totalDistance: course.totalDistance,
        likeCount: course._count.likes,
      })),
    };
  }),
});
