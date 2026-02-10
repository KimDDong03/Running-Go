import { PrismaClient } from '@prisma/client';
import { recomputeRankings } from './rankings.mjs';

const prisma = new PrismaClient();

const seed = async () => {
  await prisma.paymentTransaction.deleteMany();
  await prisma.entitlement.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.like.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.runSession.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  await prisma.plan.createMany({
    data: [
      {
        code: 'PRO_MONTHLY',
        name: '러닝고 프로 월간',
        description: '고급 러닝 인사이트와 제작자 도구를 월 단위로 이용합니다.',
        priceKrw: 6900,
        interval: 'MONTHLY',
      },
      {
        code: 'PRO_YEARLY',
        name: '러닝고 프로 연간',
        description: '러닝고 프로 기능을 연 단위로 이용합니다.',
        priceKrw: 69000,
        interval: 'YEARLY',
      },
    ],
  });

  await prisma.user.createMany({
    data: [
      {
        email: 'demo1@running-go.com',
        name: '러너 하나',
        image: null,
        provider: 'google',
        providerId: 'google-demo-1',
      },
      {
        email: 'demo2@running-go.com',
        name: '러너 둘',
        image: null,
        provider: 'google',
        providerId: 'google-demo-2',
      },
      {
        email: 'demo3@running-go.com',
        name: '러너 셋',
        image: null,
        provider: 'google',
        providerId: 'google-demo-3',
      },
    ],
  });

  const [user1, user2, user3] = await prisma.user.findMany();

  await prisma.course.createMany({
    data: [
      {
        title: '한강 하트런',
        description: '한강을 따라 하트 모양으로 달리는 코스',
        creatorId: user1.id,
        waypoints: [
          { lat: 37.5665, lng: 126.978, order: 0 },
          { lat: 37.567, lng: 126.979, order: 1 },
          { lat: 37.568, lng: 126.98, order: 2 },
          { lat: 37.569, lng: 126.981, order: 3 },
          { lat: 37.57, lng: 126.982, order: 4 },
        ],
        totalDistance: 2.3,
        estimatedTime: 15,
        difficulty: 'EASY',
        centerLat: 37.568,
        centerLng: 126.98,
        region: '서울',
        thumbnailUrl: null,
        isPublic: true,
        tags: ['하트', '야경'],
      },
      {
        title: '홍대 강아지',
        description: '홍대 거리 산책 러닝',
        creatorId: user2.id,
        waypoints: [
          { lat: 37.55, lng: 126.924, order: 0 },
          { lat: 37.551, lng: 126.925, order: 1 },
          { lat: 37.552, lng: 126.926, order: 2 },
          { lat: 37.553, lng: 126.927, order: 3 },
          { lat: 37.554, lng: 126.928, order: 4 },
        ],
        totalDistance: 3.1,
        estimatedTime: 20,
        difficulty: 'MEDIUM',
        centerLat: 37.552,
        centerLng: 126.926,
        region: '서울',
        thumbnailUrl: null,
        isPublic: true,
        tags: ['강아지', '도심'],
      },
      {
        title: '여의도 별코스',
        description: '여의도 공원 별 모양 코스',
        creatorId: user3.id,
        waypoints: [
          { lat: 37.528, lng: 126.924, order: 0 },
          { lat: 37.529, lng: 126.925, order: 1 },
          { lat: 37.53, lng: 126.926, order: 2 },
          { lat: 37.531, lng: 126.927, order: 3 },
          { lat: 37.532, lng: 126.928, order: 4 },
        ],
        totalDistance: 4.7,
        estimatedTime: 30,
        difficulty: 'HARD',
        centerLat: 37.53,
        centerLng: 126.926,
        region: '서울',
        thumbnailUrl: null,
        isPublic: true,
        tags: ['별', '공원'],
      },
    ],
  });

  const [course1, course2, course3] = await prisma.course.findMany();

  await prisma.collection.createMany({
    data: [
      { userId: user1.id, courseId: course1.id, count: 2 },
      { userId: user1.id, courseId: course2.id, count: 1 },
      { userId: user2.id, courseId: course1.id, count: 1 },
    ],
  });

  await prisma.like.createMany({
    data: [
      { userId: user1.id, courseId: course2.id },
      { userId: user2.id, courseId: course1.id },
      { userId: user3.id, courseId: course1.id },
      { userId: user3.id, courseId: course2.id },
    ],
  });

  await prisma.runSession.createMany({
    data: [
      {
        userId: user1.id,
        courseId: course1.id,
        path: [],
        distance: 2.3,
        duration: 900,
        pace: 6.5,
        isCollected: true,
        matchRate: 92,
        startedAt: new Date(Date.now() - 3600 * 1000),
        endedAt: new Date(Date.now() - 2700 * 1000),
      },
      {
        userId: user2.id,
        courseId: course2.id,
        path: [],
        distance: 3.1,
        duration: 1200,
        pace: 6.4,
        isCollected: true,
        matchRate: 88,
        startedAt: new Date(Date.now() - 7200 * 1000),
        endedAt: new Date(Date.now() - 6000 * 1000),
      },
      {
        userId: user3.id,
        courseId: course3.id,
        path: [],
        distance: 4.7,
        duration: 1800,
        pace: 6.3,
        isCollected: false,
        matchRate: 70,
        startedAt: new Date(Date.now() - 5400 * 1000),
        endedAt: new Date(Date.now() - 3600 * 1000),
      },
    ],
  });

  await recomputeRankings();
};

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
