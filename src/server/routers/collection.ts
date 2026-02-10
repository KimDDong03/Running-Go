import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { filterLowAccuracyPoints, validateCollection } from '@/lib/path-matching';

const PathPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  timestamp: z.number(),
  accuracy: z.number(),
});

const CourseWaypointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  order: z.number(),
});

export const collectionRouter = createTRPCRouter({
  listByUser: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }).optional()
    )
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
      const limit = input?.limit ?? 20;
      const cursor = input?.cursor;
      const collections = await prisma.collection.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          userId,
          course: { creatorId: { not: userId } },
        },
        orderBy: { lastAt: 'desc' },
        include: {
          course: true,
        },
      });

      let nextCursor: string | undefined = undefined;
      if (collections.length > limit) {
        const nextItem = collections.pop();
        nextCursor = nextItem!.id;
      }

      return {
        collections: collections.map((collection) => ({
          id: collection.id,
          count: collection.count,
          course: {
            id: collection.course.id,
            title: collection.course.title,
            thumbnailUrl: collection.course.thumbnailUrl,
            totalDistance: collection.course.totalDistance,
            difficulty: collection.course.difficulty,
            tags: collection.course.tags,
          },
          lastAt: collection.lastAt,
        })),
        nextCursor,
      };
    }),
  collect: publicProcedure
    .input(
      z.object({
        courseId: z.string(),
        path: z.array(PathPointSchema).min(2),
        distance: z.number().positive(),
        duration: z.number().int().positive(),
        calories: z.number().int().optional(),
        startedAt: z.date().optional(),
        endedAt: z.date().optional(),
      })
    )
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
      const course = await prisma.course.findUnique({
        where: { id: input.courseId },
      });

      if (!course || course.status === 'DELETED') {
        throw new Error('Course not found');
      }

      const waypointParse = z.array(CourseWaypointSchema).safeParse(course.waypoints);
      if (!waypointParse.success) {
        throw new Error('Invalid course waypoints');
      }

      const filteredPath = filterLowAccuracyPoints(input.path);
      const courseWaypoints = [...waypointParse.data]
        .sort((a, b) => a.order - b.order)
        .map((point) => ({
          lat: point.lat,
          lng: point.lng,
        }));
      const validation = validateCollection(courseWaypoints, filteredPath);

      const pace = input.distance > 0
        ? (input.duration / 60) / input.distance
        : 0;

      const isCollector = course.creatorId !== userId;
      let collectionId: string | null = null;
      let isFirstCollection = false;

      if (validation.isValid && isCollector) {
        const existingCollection = await prisma.collection.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId: input.courseId,
            },
          },
        });

        if (existingCollection) {
          const updated = await prisma.collection.update({
            where: {
              userId_courseId: {
                userId,
                courseId: input.courseId,
              },
            },
            data: { count: { increment: 1 } },
          });
          collectionId = updated.id;
        } else {
          const created = await prisma.collection.create({
            data: {
              userId,
              courseId: input.courseId,
            },
          });
          collectionId = created.id;
          isFirstCollection = true;
        }
      }

      const shouldPublish = course.creatorId === userId && course.status !== 'ACTIVE';

      await prisma.course.update({
        where: { id: input.courseId },
        data: {
          runCount: { increment: 1 },
          ...(isFirstCollection ? { collectCount: { increment: 1 } } : {}),
          ...(shouldPublish ? { status: 'ACTIVE' } : {}),
        },
      });

      const endedAt = input.endedAt ?? new Date();
      const startedAt = input.startedAt ?? new Date(endedAt.getTime() - input.duration * 1000);

      const runSession = await prisma.runSession.create({
        data: {
          userId,
          courseId: input.courseId,
          path: input.path,
          distance: input.distance,
          duration: input.duration,
          pace,
          calories: input.calories,
          matchRate: validation.matchRate,
          isCollected: validation.isValid && isCollector,
          collectionId,
          startedAt,
          endedAt,
        },
      });

      return {
        isCollected: validation.isValid && isCollector,
        matchRate: validation.matchRate,
        reason: validation.isValid
          ? (isCollector ? undefined : '제작한 코스는 수집되지 않습니다')
          : validation.reason,
        runSessionId: runSession.id,
        collectionId,
      };
    }),
});
