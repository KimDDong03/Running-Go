import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { filterLowAccuracyPoints } from '@/lib/path-matching';

const PathPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  timestamp: z.number(),
  accuracy: z.number(),
});

export const runSessionRouter = createTRPCRouter({
  createFreeRun: protectedProcedure
    .input(
      z.object({
        path: z.array(PathPointSchema).min(2),
        distance: z.number().positive(),
        duration: z.number().int().positive(),
        calories: z.number().int().optional(),
        startedAt: z.date().optional(),
        endedAt: z.date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const filteredPath: typeof input.path = filterLowAccuracyPoints(input.path);
      const pace = input.distance > 0
        ? (input.duration / 60) / input.distance
        : 0;

      const endedAt = input.endedAt ?? new Date();
      const startedAt = input.startedAt ?? new Date(endedAt.getTime() - input.duration * 1000);

      const runSession = await prisma.runSession.create({
        data: {
          userId,
          courseId: null,
          path: filteredPath,
          distance: input.distance,
          duration: input.duration,
          pace,
          calories: input.calories,
          startedAt,
          endedAt,
        },
      });

      return {
        runSessionId: runSession.id,
      };
    }),
  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const runSession = await prisma.runSession.findFirst({
        where: { id: input.id, userId },
      });

      if (!runSession) {
        throw new Error('Run session not found');
      }

      return {
        id: runSession.id,
        courseId: runSession.courseId,
        distance: runSession.distance,
        duration: runSession.duration,
        pace: runSession.pace,
        isCollected: runSession.isCollected,
        matchRate: runSession.matchRate,
        createdAt: runSession.createdAt,
      };
    }),
});
