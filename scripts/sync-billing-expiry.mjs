import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const run = async () => {
  const now = new Date();

  const overdueSubscriptions = await prisma.subscription.findMany({
    where: {
      status: {
        in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
      },
      currentPeriodEnd: {
        not: null,
        lte: now,
      },
    },
    select: {
      id: true,
      userId: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
    },
  });

  let canceledSubscriptions = 0;
  let expiredSubscriptions = 0;
  let entitlementsFromSubscription = 0;

  for (const subscription of overdueSubscriptions) {
    const nextStatus = subscription.cancelAtPeriodEnd ? 'CANCELED' : 'EXPIRED';
    const effectiveEnd = subscription.currentPeriodEnd ?? now;

    const [, entitlementResult] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          ...(nextStatus === 'CANCELED' ? { canceledAt: effectiveEnd } : {}),
        },
      }),
      prisma.entitlement.updateMany({
        where: {
          userId: subscription.userId,
          sourceRef: subscription.id,
          isActive: true,
        },
        data: {
          isActive: false,
          endsAt: effectiveEnd,
        },
      }),
    ]);

    entitlementsFromSubscription += entitlementResult.count;

    if (nextStatus === 'CANCELED') {
      canceledSubscriptions += 1;
    } else {
      expiredSubscriptions += 1;
    }
  }

  const staleEntitlements = await prisma.entitlement.updateMany({
    where: {
      isActive: true,
      endsAt: {
        not: null,
        lte: now,
      },
    },
    data: {
      isActive: false,
    },
  });

  console.log(
    `[billing-expiry] subscriptions: canceled=${canceledSubscriptions}, expired=${expiredSubscriptions}`
  );
  console.log(
    `[billing-expiry] entitlements: via-subscription=${entitlementsFromSubscription}, stale=${staleEntitlements.count}`
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
