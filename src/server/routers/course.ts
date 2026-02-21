import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

const WaypointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  order: z.number(),
});

const CreateCourseInput = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  waypoints: z.array(WaypointSchema).min(5).max(400),
  totalDistance: z.number().min(0.5).max(50),
  estimatedTime: z.number().int().positive(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  centerLat: z.number(),
  centerLng: z.number(),
  region: z.string().optional(),
});

const CourseListSortSchema = z.enum([
  'LATEST',
  'LIKES_DESC',
  'NEAREST',
  'COURSE_DISTANCE_ASC',
  'COURSE_DISTANCE_DESC',
]);

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

export const courseRouter = createTRPCRouter({
  // List courses with pagination and filters
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
        sortBy: CourseListSortSchema.optional(),
        location: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180),
        }).optional(),
        filters: z.object({
          difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
          minDistance: z.number().optional(),
          maxDistance: z.number().optional(),
          tags: z.array(z.string()).optional(),
        }).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const limit = input?.limit ?? 20;
      const cursor = input?.cursor;
      const filters = input?.filters;
      const sortBy = input?.sortBy ?? 'LATEST';
      const location = input?.location;

      const toRadians = (value: number) => (value * Math.PI) / 180;
      const computeDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const earthRadius = 6371;
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(toRadians(lat1))
            * Math.cos(toRadians(lat2))
            * Math.sin(dLng / 2)
            * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
      };

      const totalDistanceFilter = {
        ...(filters?.minDistance !== undefined ? { gte: filters.minDistance } : {}),
        ...(filters?.maxDistance !== undefined ? { lte: filters.maxDistance } : {}),
      };

      const where = {
        isPublic: true,
        status: 'ACTIVE' as const,
        ...(filters?.difficulty && { difficulty: filters.difficulty }),
        ...(Object.keys(totalDistanceFilter).length > 0 ? { totalDistance: totalDistanceFilter } : {}),
        ...(filters?.tags && { tags: { hasSome: filters.tags } }),
      };

      if (sortBy === 'NEAREST' && location) {
        const nearestCandidateTake = Math.min(500, Math.max(limit * 8, 120));
        const candidateLocations = await prisma.course.findMany({
          where,
          take: nearestCandidateTake,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            centerLat: true,
            centerLng: true,
          },
        });

        const nearestCandidates = candidateLocations
          .map((course) => ({
            courseId: course.id,
            distanceFromUserKm: computeDistanceKm(
              location.lat,
              location.lng,
              course.centerLat,
              course.centerLng
            ),
          }))
          .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm)
          .slice(0, limit);

        const nearestCourseIds = nearestCandidates.map(({ courseId }) => courseId);
        const nearestCourses = nearestCourseIds.length > 0
          ? await prisma.course.findMany({
              where: { id: { in: nearestCourseIds } },
              include: {
                _count: {
                  select: { likes: true, collections: true },
                },
              },
            })
          : [];
        const nearestCourseById = new Map(nearestCourses.map((course) => [course.id, course]));
        const likedCourseIdSet = ctx.userId && nearestCourseIds.length > 0
          ? new Set(
              (
                await prisma.like.findMany({
                  where: {
                    userId: ctx.userId,
                    courseId: { in: nearestCourseIds },
                  },
                  select: { courseId: true },
                })
              ).map((like) => like.courseId)
            )
          : new Set<string>();

        const courses = nearestCandidates
          .map(({ courseId }) => nearestCourseById.get(courseId))
          .filter((course): course is NonNullable<typeof course> => Boolean(course))
          .map((course) => ({
            id: course.id,
            title: course.title,
            description: course.description,
            totalDistance: course.totalDistance,
            estimatedTime: course.estimatedTime,
            difficulty: course.difficulty,
            centerLat: course.centerLat,
            centerLng: course.centerLng,
            thumbnailUrl: course.thumbnailUrl,
            waypoints: course.waypoints,
            tags: course.tags,
            likeCount: course._count.likes,
            isLiked: likedCourseIdSet.has(course.id),
            collectCount: course._count.collections,
            creatorId: course.creatorId,
            createdAt: course.createdAt,
          }));

        return {
          courses,
          nextCursor: undefined,
        };
      }

      const orderBy =
        sortBy === 'LIKES_DESC'
          ? [{ likes: { _count: 'desc' as const } }, { createdAt: 'desc' as const }]
          : sortBy === 'COURSE_DISTANCE_ASC'
            ? [{ totalDistance: 'asc' as const }, { createdAt: 'desc' as const }]
            : sortBy === 'COURSE_DISTANCE_DESC'
              ? [{ totalDistance: 'desc' as const }, { createdAt: 'desc' as const }]
            : [{ createdAt: 'desc' as const }];

      const courses = await prisma.course.findMany({
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        where,
        orderBy,
        include: {
          _count: {
            select: { likes: true, collections: true },
          },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (courses.length > limit) {
        const nextItem = courses.pop();
        nextCursor = nextItem?.id;
      }

      const courseIds = courses.map((course) => course.id);
      const likedCourseIdSet = ctx.userId && courseIds.length > 0
        ? new Set(
            (
              await prisma.like.findMany({
                where: {
                  userId: ctx.userId,
                  courseId: { in: courseIds },
                },
                select: { courseId: true },
              })
            ).map((like) => like.courseId)
          )
        : new Set<string>();

      // Simplified return to avoid complex type inference
      const courseList = courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        totalDistance: course.totalDistance,
        estimatedTime: course.estimatedTime,
        difficulty: course.difficulty,
        centerLat: course.centerLat,
        centerLng: course.centerLng,
        thumbnailUrl: course.thumbnailUrl,
        waypoints: course.waypoints,
        tags: course.tags,
        likeCount: course._count.likes,
        isLiked: likedCourseIdSet.has(course.id),
        collectCount: course._count.collections,
        creatorId: course.creatorId,
        createdAt: course.createdAt,
      }));

      return {
        courses: courseList,
        nextCursor,
      };
    }),

  nearby: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radiusKm: z.number().min(0.5).max(20).default(5),
        limit: z.number().min(1).max(50).default(30),
      })
    )
    .query(async ({ input, ctx }) => {
      const latDelta = input.radiusKm / 111;
      const longitudeScale = Math.cos((input.lat * Math.PI) / 180);
      const lngDelta = input.radiusKm / Math.max(0.1, 111 * Math.abs(longitudeScale));

      const candidates = await prisma.course.findMany({
        where: {
          isPublic: true,
          status: 'ACTIVE',
          centerLat: {
            gte: input.lat - latDelta,
            lte: input.lat + latDelta,
          },
          centerLng: {
            gte: input.lng - lngDelta,
            lte: input.lng + lngDelta,
          },
        },
        take: input.limit,
        orderBy: { createdAt: 'desc' },
      });

      const toRadians = (value: number) => (value * Math.PI) / 180;
      const computeDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const earthRadius = 6371;
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(toRadians(lat1))
            * Math.cos(toRadians(lat2))
            * Math.sin(dLng / 2)
            * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadius * c;
      };

      const likedCandidateIdSet = ctx.userId && candidates.length > 0
        ? new Set(
            (
              await prisma.like.findMany({
                where: {
                  userId: ctx.userId,
                  courseId: { in: candidates.map((course) => course.id) },
                },
                select: { courseId: true },
              })
            ).map((like) => like.courseId)
          )
        : new Set<string>();

      const courses = candidates
        .map((course) => {
          const distanceFromUserKm = computeDistanceKm(
            input.lat,
            input.lng,
            course.centerLat,
            course.centerLng
          );

          return {
            id: course.id,
            title: course.title,
            centerLat: course.centerLat,
            centerLng: course.centerLng,
            totalDistance: course.totalDistance,
            estimatedTime: course.estimatedTime,
            difficulty: course.difficulty,
            distanceFromUserKm,
            isLiked: likedCandidateIdSet.has(course.id),
          };
        })
        .filter((course) => course.distanceFromUserKm <= input.radiusKm)
        .sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);

      return { courses };
    }),

  // Get single course by ID
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const course = await prisma.course.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: { likes: true, collections: true },
          },
        },
      });

      if (!course || course.status === 'DELETED') {
        throw new Error('Course not found');
      }

      if (course.status === 'HIDDEN' && ctx.userId !== course.creatorId) {
        const guest = await prisma.user.findUnique({
          where: { providerId: 'guest' },
        });
        if (!guest || guest.id !== course.creatorId || ctx.userId) {
          throw new Error('Course not found');
        }
      }

      const isLiked = ctx.userId
        ? Boolean(
            await prisma.like.findUnique({
              where: {
                userId_courseId: {
                  userId: ctx.userId,
                  courseId: course.id,
                },
              },
              select: { id: true },
            })
          )
        : false;

      // Simplified return
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        waypoints: course.waypoints,
        totalDistance: course.totalDistance,
        estimatedTime: course.estimatedTime,
        difficulty: course.difficulty,
        centerLat: course.centerLat,
        centerLng: course.centerLng,
        thumbnailUrl: course.thumbnailUrl,
        tags: course.tags,
        isPublic: course.isPublic,
        likeCount: course._count.likes,
        isLiked,
        collectCount: course._count.collections,
        creatorId: course.creatorId,
        creator: {
          id: 'temp',
          name: null,
          image: null,
        },
        createdAt: course.createdAt,
      };
    }),

  // Create new course
  create: protectedProcedure
    .input(CreateCourseInput)
    .mutation(async ({ input, ctx }) => {
      if (input.totalDistance < 0.5 || input.totalDistance > 50) {
        throw new Error('Course distance must be between 500m and 50km');
      }

      const course = await prisma.course.create({
        data: {
          ...input,
          creatorId: ctx.userId,
          tags: [],
          isPublic: true,
          status: 'ACTIVE',
        },
        include: {
          creator: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      return course;
    }),

  // Delete course
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const course = await prisma.course.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          creatorId: true,
          status: true,
          _count: {
            select: {
              collections: true,
            },
          },
        },
      });

      if (!course || course.status === 'DELETED') {
        throw new TRPCError({ code: 'NOT_FOUND', message: '삭제할 코스를 찾을 수 없습니다' });
      }

      if (course.creatorId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '내가 만든 코스만 삭제할 수 있습니다' });
      }

      if (course._count.collections === 0) {
        await prisma.$transaction([
          prisma.runSession.deleteMany({ where: { courseId: input.id } }),
          prisma.course.delete({ where: { id: input.id } }),
        ]);

        return { success: true, deletedCompletely: true };
      }

      await prisma.course.update({
        where: { id: input.id },
        data: {
          status: 'DELETED',
          isPublic: false,
        },
      });

      return { success: true, deletedCompletely: false };
    }),

  // Update course (description only)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          title: z.string().min(1).max(100).optional(),
          description: z.string().max(500).optional(),
          isPublic: z.boolean().optional(),
          tags: z.array(z.string()).max(5).optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const courseBeforeUpdate = await prisma.course.findUnique({
        where: { id: input.id },
        select: {
          creatorId: true,
          status: true,
        },
      });

      if (!courseBeforeUpdate || courseBeforeUpdate.status === 'DELETED') {
        throw new TRPCError({ code: 'NOT_FOUND', message: '코스를 찾을 수 없습니다' });
      }

      if (courseBeforeUpdate.creatorId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '내가 만든 코스만 수정할 수 있습니다' });
      }

      const course = await prisma.course.update({
        where: { id: input.id },
        data: input.data,
      });

      return course;
    }),

  // List courses by user
  listByUser: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const courses = await prisma.course.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        where: {
          creatorId: ctx.userId,
          status: { not: 'DELETED' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          totalDistance: true,
          difficulty: true,
          centerLat: true,
          centerLng: true,
          waypoints: true,
          thumbnailUrl: true,
          status: true,
          createdAt: true,
          _count: {
            select: { likes: true },
          },
        },
      });

      let nextCursor: string | undefined = undefined;
      if (courses.length > input.limit) {
        const nextItem = courses.pop();
        nextCursor = nextItem!.id;
      }

      return {
        courses: courses.map((course) => ({
          id: course.id,
          title: course.title,
          totalDistance: course.totalDistance,
          difficulty: course.difficulty,
          centerLat: course.centerLat,
          centerLng: course.centerLng,
          waypoints: sampleWaypoints(course.waypoints),
          thumbnailUrl: course.thumbnailUrl,
          status: course.status,
          createdAt: course.createdAt,
          likeCount: course._count.likes,
        })),
        nextCursor,
      };
    }),

  listByCreator: publicProcedure
    .input(
      z.object({
        creatorId: z.string(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const courses = await prisma.course.findMany({
        where: {
          creatorId: input.creatorId,
          status: 'ACTIVE',
          isPublic: true,
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: {
          _count: {
            select: { likes: true },
          },
          creator: {
            select: { name: true },
          },
        },
      });

      return {
        courses: courses.map((course) => ({
          id: course.id,
          title: course.title,
          totalDistance: course.totalDistance,
          difficulty: course.difficulty,
          centerLat: course.centerLat,
          centerLng: course.centerLng,
          waypoints: sampleWaypoints(course.waypoints),
          thumbnailUrl: course.thumbnailUrl,
          likeCount: course._count.likes,
          creatorName: course.creator.name,
        })),
      };
    }),
});
