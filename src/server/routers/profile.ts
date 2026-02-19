import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { getCollectorTier, getCreatorTier } from '@/lib/tier';

export const profileRouter = createTRPCRouter({
  deleteAccount: protectedProcedure
    .input(z.object({
      confirmText: z.string().trim(),
      confirmEmail: z.string().trim().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.confirmText !== 'DELETE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '확인 문구가 올바르지 않습니다',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { provider: true, email: true },
      });

      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
      }

      if (user.provider === 'guest') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '게스트 계정은 탈퇴할 수 없습니다' });
      }

      if (user.email.toLowerCase() !== input.confirmEmail.toLowerCase()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '이메일 확인 값이 일치하지 않습니다' });
      }

      console.info('[account.delete]', {
        userId: ctx.userId,
        email: user.email,
        deletedAt: new Date().toISOString(),
      });

      await prisma.user.delete({ where: { id: ctx.userId } });

      return { success: true };
    }),

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

  updateNickname: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(20) }))
    .mutation(async ({ input, ctx }) => {
      const userBefore = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { name: true, createdAt: true, updatedAt: true },
      });

      if (!userBefore) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다' });
      }

      if (userBefore.name?.trim() === input.name) {
        return {
          name: userBefore.name,
        };
      }

      const duplicatedUser = await prisma.user.findFirst({
        where: {
          id: { not: ctx.userId },
          name: {
            equals: input.name,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      });

      if (duplicatedUser) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '이미 사용 중인 닉네임입니다',
        });
      }

      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const FIRST_UPDATE_TOLERANCE_MS = 1000;
      const now = Date.now();
      const elapsed = now - userBefore.updatedAt.getTime();
      const isFirstProfileUpdate = Math.abs(userBefore.updatedAt.getTime() - userBefore.createdAt.getTime()) <= FIRST_UPDATE_TOLERANCE_MS;
      if (!isFirstProfileUpdate && elapsed < THIRTY_DAYS_MS) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '닉네임은 30일에 한 번만 변경할 수 있습니다',
        });
      }

      const user = await prisma.user.update({
        where: { id: ctx.userId },
        data: { name: input.name },
      });

      return {
        name: user.name,
      };
    }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;
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
        name: user?.name ?? '사용자',
        image: user?.image ?? null,
        isGuest: false,
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
