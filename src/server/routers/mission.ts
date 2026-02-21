import { createTRPCRouter, protectedProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';

type MissionCategory = 'DAILY' | 'CREATOR' | 'COLLECTOR' | 'SOCIAL' | 'MILESTONE';

type MissionReward = {
  xp: number;
  badge?: string;
  cosmetic?: string;
};

type MissionItem = {
  id: string;
  category: MissionCategory;
  titleKo: string;
  titleEn: string;
  descriptionKo: string;
  descriptionEn: string;
  progress: number;
  target: number;
  completed: boolean;
  actionPath: string;
  actionLabelKo: string;
  actionLabelEn: string;
  reward: MissionReward;
};

type MissionTemplate = Omit<MissionItem, 'progress' | 'completed'> & {
  metricKey:
    | 'createdCourses'
    | 'collectedCourses'
    | 'todayRuns'
    | 'weeklyRuns'
    | 'totalRuns'
    | 'totalDistanceKm'
    | 'likedCourses';
};

const getLevelProgress = (xp: number) => {
  let level = 1;
  let xpForNextLevel = 120;
  let currentLevelXp = xp;

  while (currentLevelXp >= xpForNextLevel) {
    currentLevelXp -= xpForNextLevel;
    level += 1;
    xpForNextLevel = 120 + (level - 1) * 40;
  }

  return {
    level,
    currentLevelXp,
    xpForNextLevel,
    levelProgressPercent: Math.round((currentLevelXp / Math.max(1, xpForNextLevel)) * 100),
  };
};

const missionTemplates: MissionTemplate[] = [
  {
    id: 'FIRST_CREATE',
    category: 'CREATOR',
    titleKo: '첫 제작 미션',
    titleEn: 'First Creator Mission',
    descriptionKo: '첫 코스를 직접 만들어보세요.',
    descriptionEn: 'Create your first course.',
    target: 1,
    actionPath: '/create',
    actionLabelKo: '지금 만들기',
    actionLabelEn: 'Create now',
    metricKey: 'createdCourses',
    reward: { xp: 100, badge: 'Creator Starter', cosmetic: '프로필 테두리' },
  },
  {
    id: 'CREATE_3',
    category: 'CREATOR',
    titleKo: '제작 숙련 미션',
    titleEn: 'Creator Growth',
    descriptionKo: '코스 3개를 제작해보세요.',
    descriptionEn: 'Create 3 courses.',
    target: 3,
    actionPath: '/create',
    actionLabelKo: '코스 제작',
    actionLabelEn: 'Create course',
    metricKey: 'createdCourses',
    reward: { xp: 160, badge: 'Route Builder' },
  },
  {
    id: 'FIRST_COLLECT',
    category: 'COLLECTOR',
    titleKo: '첫 수집 미션',
    titleEn: 'First Collect Mission',
    descriptionKo: '다른 사용자의 코스를 처음 수집해보세요.',
    descriptionEn: 'Collect your first course from others.',
    target: 1,
    actionPath: '/?sort=NEAREST',
    actionLabelKo: '코스 찾기',
    actionLabelEn: 'Find course',
    metricKey: 'collectedCourses',
    reward: { xp: 100, badge: 'Collector Starter', cosmetic: '하트 마커 스킨' },
  },
  {
    id: 'COLLECT_10',
    category: 'COLLECTOR',
    titleKo: '수집가 미션',
    titleEn: 'Collector Growth',
    descriptionKo: '코스 10개를 수집해보세요.',
    descriptionEn: 'Collect 10 courses.',
    target: 10,
    actionPath: '/?sort=NEAREST',
    actionLabelKo: '주변 탐색',
    actionLabelEn: 'Explore nearby',
    metricKey: 'collectedCourses',
    reward: { xp: 200, badge: 'Path Collector' },
  },
  {
    id: 'DAILY_RUN',
    category: 'DAILY',
    titleKo: '오늘의 러닝',
    titleEn: 'Daily Run',
    descriptionKo: '오늘 러닝 1회를 완료하세요.',
    descriptionEn: 'Complete one run today.',
    target: 1,
    actionPath: '/run',
    actionLabelKo: '러닝 시작',
    actionLabelEn: 'Start run',
    metricKey: 'todayRuns',
    reward: { xp: 40 },
  },
  {
    id: 'WEEKLY_RUN_3',
    category: 'DAILY',
    titleKo: '주간 러닝 목표',
    titleEn: 'Weekly Run Goal',
    descriptionKo: '최근 7일 내 러닝 3회를 완료하세요.',
    descriptionEn: 'Complete 3 runs in the last 7 days.',
    target: 3,
    actionPath: '/run',
    actionLabelKo: '기록 채우기',
    actionLabelEn: 'Fill progress',
    metricKey: 'weeklyRuns',
    reward: { xp: 120 },
  },
  {
    id: 'RUN_10_TOTAL',
    category: 'MILESTONE',
    titleKo: '러닝 습관 미션',
    titleEn: 'Running Habit',
    descriptionKo: '누적 러닝 10회를 달성하세요.',
    descriptionEn: 'Reach 10 total runs.',
    target: 10,
    actionPath: '/run',
    actionLabelKo: '러닝하기',
    actionLabelEn: 'Run now',
    metricKey: 'totalRuns',
    reward: { xp: 180 },
  },
  {
    id: 'DISTANCE_20K',
    category: 'MILESTONE',
    titleKo: '거리 누적 미션',
    titleEn: 'Distance Milestone',
    descriptionKo: '누적 20km를 달려보세요.',
    descriptionEn: 'Run a total of 20km.',
    target: 20,
    actionPath: '/run',
    actionLabelKo: '거리 달성',
    actionLabelEn: 'Build distance',
    metricKey: 'totalDistanceKm',
    reward: { xp: 220, cosmetic: '스피드 트레일 효과' },
  },
  {
    id: 'LIKE_5',
    category: 'SOCIAL',
    titleKo: '탐험 큐레이션 미션',
    titleEn: 'Curation Mission',
    descriptionKo: '코스 5개에 좋아요를 눌러보세요.',
    descriptionEn: 'Like 5 courses.',
    target: 5,
    actionPath: '/',
    actionLabelKo: '코스 둘러보기',
    actionLabelEn: 'Browse courses',
    metricKey: 'likedCourses',
    reward: { xp: 80 },
  },
];

const buildMission = (item: Omit<MissionItem, 'completed'>): MissionItem => ({
  ...item,
  completed: item.progress >= item.target,
});

export const missionRouter = createTRPCRouter({
  summary: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(todayStart.getDate() + 1);
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - 6);

      const [createdCourses, collectedCourses, todayRuns, weeklyRuns, totalRuns, runDistanceSum, likedCourses] = await Promise.all([
        prisma.course.count({
          where: {
            creatorId: userId,
            status: { not: 'DELETED' },
          },
        }),
        prisma.collection.count({
          where: {
            userId,
            course: { creatorId: { not: userId } },
          },
        }),
        prisma.runSession.count({
          where: {
            userId,
            createdAt: {
              gte: todayStart,
              lt: tomorrowStart,
            },
          },
        }),
        prisma.runSession.count({
          where: {
            userId,
            createdAt: {
              gte: weekStart,
              lt: tomorrowStart,
            },
          },
        }),
        prisma.runSession.count({
          where: {
            userId,
          },
        }),
        prisma.runSession.aggregate({
          where: {
            userId,
          },
          _sum: {
            distance: true,
          },
        }),
        prisma.like.count({
          where: {
            userId,
          },
        }),
      ]);

      const metricValueMap = {
        createdCourses,
        collectedCourses,
        todayRuns,
        weeklyRuns,
        totalRuns,
        totalDistanceKm: runDistanceSum._sum.distance ?? 0,
        likedCourses,
      };

      const missions: MissionItem[] = missionTemplates.map((template) => {
        const rawProgress = metricValueMap[template.metricKey];
        return buildMission({
          id: template.id,
          category: template.category,
          titleKo: template.titleKo,
          titleEn: template.titleEn,
          descriptionKo: template.descriptionKo,
          descriptionEn: template.descriptionEn,
          progress: Math.min(rawProgress, template.target),
          target: template.target,
          actionPath: template.actionPath,
          actionLabelKo: template.actionLabelKo,
          actionLabelEn: template.actionLabelEn,
          reward: template.reward,
        });
      });

      const earnedXp = missions
        .filter((mission) => mission.completed)
        .reduce((sum, mission) => sum + mission.reward.xp, 0);
      const progressXp = missions.reduce((sum, mission) => {
        const ratio = mission.progress / Math.max(1, mission.target);
        return sum + Math.floor(mission.reward.xp * ratio);
      }, 0);
      const totalXp = missions.reduce((sum, mission) => sum + mission.reward.xp, 0);
      const level = getLevelProgress(progressXp);

      return {
        missions: [...missions].sort((a, b) => Number(a.completed) - Number(b.completed)),
        earnedXp,
        progressXp,
        totalXp,
        level,
      };
    }),
});
