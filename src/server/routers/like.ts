import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

export const likeRouter = createTRPCRouter({
  listByUser: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ input, ctx }) => {
      const likes = await prisma.like.findMany({
        where: {
          userId: ctx.userId,
          course: {
            status: 'ACTIVE',
            isPublic: true,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input?.limit ?? 50,
        include: {
          course: {
            include: {
              _count: { select: { likes: true } },
              collections: {
                where: { userId: ctx.userId },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });

      return {
        likes: likes.map((like) => ({
          id: like.id,
          likedAt: like.createdAt,
          isCollected: like.course.collections.length > 0,
          course: {
            id: like.course.id,
            title: like.course.title,
            thumbnailUrl: like.course.thumbnailUrl,
            waypoints: like.course.waypoints,
            centerLat: like.course.centerLat,
            centerLng: like.course.centerLng,
            totalDistance: like.course.totalDistance,
            difficulty: like.course.difficulty,
            likeCount: like.course._count.likes,
          },
        })),
      };
    }),

  status: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId
        ?? (await prisma.user.upsert({
          where: { providerId: 'guest' },
          update: {},
          create: {
            email: 'guest@running-go.local',
            name: '게스트',
            image: null,
            provider: 'guest',
            providerId: 'guest',
          },
        })).id;
      const [like, count] = await Promise.all([
        userId
          ? prisma.like.findUnique({
            where: {
              userId_courseId: {
                userId,
                courseId: input.courseId,
              },
            },
          })
          : Promise.resolve(null),
        prisma.like.count({
          where: { courseId: input.courseId },
        }),
      ]);

      return {
        isLiked: Boolean(like),
        likeCount: count,
      };
    }),
  toggle: publicProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId
        ?? (await prisma.user.upsert({
          where: { providerId: 'guest' },
          update: {},
          create: {
            email: 'guest@running-go.local',
            name: '게스트',
            image: null,
            provider: 'guest',
            providerId: 'guest',
          },
        })).id;
      const existing = await prisma.like.findUnique({
        where: {
          userId_courseId: {
            userId,
            courseId: input.courseId,
          },
        },
      });

      if (existing) {
        await prisma.like.delete({
          where: {
            userId_courseId: {
              userId,
              courseId: input.courseId,
            },
          },
        });
      } else {
        await prisma.like.create({
          data: {
            userId,
            courseId: input.courseId,
          },
        });
      }

      const count = await prisma.like.count({
        where: { courseId: input.courseId },
      });

      return {
        isLiked: !existing,
        likeCount: count,
      };
    }),
});
