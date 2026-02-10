import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERIODS = ['WEEKLY', 'MONTHLY', 'ALL_TIME'];

const startOfWeek = (date) => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.getFullYear(), date.getMonth(), diff);
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const getWeekOfYear = (date) => {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
};

const periodMeta = (period, now) => {
  if (period === 'WEEKLY') {
    return {
      start: startOfWeek(now),
      weekOfYear: getWeekOfYear(now),
      month: null,
      year: now.getFullYear(),
    };
  }
  if (period === 'MONTHLY') {
    return {
      start: startOfMonth(now),
      weekOfYear: null,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };
  }
  return {
    start: null,
    weekOfYear: null,
    month: null,
    year: now.getFullYear(),
  };
};

const upsertUserRankings = async ({ period, start, weekOfYear, month, year }) => {
  const collectionWhere = start ? { lastAt: { gte: start } } : {};
  const collectorCounts = await prisma.collection.groupBy({
    by: ['userId'],
    where: collectionWhere,
    _count: { _all: true },
  });

  const likeWhere = start ? { createdAt: { gte: start } } : {};
  const likes = await prisma.like.findMany({
    where: likeWhere,
    include: { course: true },
  });

  const creatorScores = new Map();
  for (const like of likes) {
    if (!like.course) continue;
    const current = creatorScores.get(like.course.creatorId) ?? 0;
    creatorScores.set(like.course.creatorId, current + 1);
  }

  await prisma.userRanking.deleteMany({
    where: { period },
  });

  if (collectorCounts.length > 0) {
    await prisma.userRanking.createMany({
      data: collectorCounts.map((entry) => ({
        userId: entry.userId,
        type: 'COLLECTOR',
        score: entry._count._all,
        period,
        weekOfYear,
        month,
        year,
      })),
    });
  }

  if (creatorScores.size > 0) {
    await prisma.userRanking.createMany({
      data: Array.from(creatorScores.entries()).map(([userId, score]) => ({
        userId,
        type: 'CREATOR',
        score,
        period,
        weekOfYear,
        month,
        year,
      })),
    });
  }
};

const recomputeCourseRankings = async () => {
  const stats = await prisma.runSession.groupBy({
    by: ['courseId', 'userId'],
    where: { courseId: { not: null } },
    _count: { _all: true },
    _min: { duration: true },
  });

  await prisma.courseRanking.deleteMany();

  if (stats.length === 0) return;

  await prisma.courseRanking.createMany({
    data: stats.map((entry) => ({
      courseId: entry.courseId,
      userId: entry.userId,
      runCount: entry._count._all,
      bestTime: entry._min.duration ?? null,
    })),
  });
};

export const recomputeRankings = async () => {
  const now = new Date();
  for (const period of PERIODS) {
    await upsertUserRankings({ period, ...periodMeta(period, now) });
  }
  await recomputeCourseRankings();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  recomputeRankings()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
