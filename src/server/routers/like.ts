import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

export const likeRouter = createTRPCRouter({
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
