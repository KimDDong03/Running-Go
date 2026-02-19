import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

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
            waypoints: sampleWaypoints(like.course.waypoints),
            centerLat: like.course.centerLat,
            centerLng: like.course.centerLng,
            totalDistance: like.course.totalDistance,
            difficulty: like.course.difficulty,
            likeCount: like.course._count.likes,
          },
        })),
      };
    }),

  status: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const [like, count] = await Promise.all([
        prisma.like.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId: input.courseId,
            },
          },
        }),
        prisma.like.count({
          where: { courseId: input.courseId },
        }),
      ]);

      return {
        isLiked: Boolean(like),
        likeCount: count,
      };
    }),
  toggle: protectedProcedure
    .input(z.object({ courseId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
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
