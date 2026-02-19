import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
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

const sampleWaypoints = (value: unknown, maxPoints: number = 80) => {
  if (!Array.isArray(value)) return [];
  const points = value
    .map((point) => {
      if (!point || typeof point !== 'object') return null;
      const lat = (point as { lat?: unknown }).lat;
      const lng = (point as { lng?: unknown }).lng;
      const order = (point as { order?: unknown }).order;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;
      return { lat, lng, order: typeof order === 'number' ? order : 0 };
    })
    .filter((point): point is { lat: number; lng: number; order: number } => Boolean(point))
    .sort((a, b) => a.order - b.order);

  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: { lat: number; lng: number; order: number }[] = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }
  return sampled;
};

export const collectionRouter = createTRPCRouter({
  listByUser: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;
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
          course: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              waypoints: true,
              centerLat: true,
              centerLng: true,
              totalDistance: true,
              difficulty: true,
            },
          },
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
            waypoints: sampleWaypoints(collection.course.waypoints),
            centerLat: collection.course.centerLat,
            centerLng: collection.course.centerLng,
            totalDistance: collection.course.totalDistance,
            difficulty: collection.course.difficulty,
          },
          lastAt: collection.lastAt,
        })),
        nextCursor,
      };
    }),

  historyByCourse: protectedProcedure
    .input(z.object({ courseId: z.string(), limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;

      const sessions = await prisma.runSession.findMany({
        where: {
          userId,
          courseId: input.courseId,
          isCollected: true,
        },
        orderBy: { endedAt: 'desc' },
        take: input.limit,
        select: {
          id: true,
          distance: true,
          duration: true,
          pace: true,
          matchRate: true,
          endedAt: true,
        },
      });

      return {
        sessions,
      };
    }),

  collect: protectedProcedure
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
      const userId = ctx.userId;
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
