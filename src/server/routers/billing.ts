import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { prisma } from '@/lib/prisma';
import { getServerEnv } from '@/lib/env';

const DEFAULT_PLANS = [
  {
    code: 'PRO_MONTHLY',
    name: '러닝고 프로 월간',
    description: '고급 러닝 인사이트와 제작자 도구를 월 단위로 이용합니다.',
    priceKrw: 6900,
    interval: 'MONTHLY' as const,
  },
  {
    code: 'PRO_YEARLY',
    name: '러닝고 프로 연간',
    description: '러닝고 프로 기능을 연 단위로 이용합니다.',
    priceKrw: 69000,
    interval: 'YEARLY' as const,
  },
];

const PlanRecordSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceKrw: z.number(),
  interval: z.enum(['MONTHLY', 'YEARLY', 'ONE_TIME']),
  isActive: z.boolean(),
});

const PlanRecordNullableSchema = PlanRecordSchema.nullable();
const PlanRecordListSchema = z.array(PlanRecordSchema);

const getPlanDelegate = () => {
  const delegate = (prisma as unknown as { plan?: unknown }).plan;
  if (!delegate || typeof delegate !== 'object') {
    return null;
  }

  return delegate as {
    upsert?: (args: unknown) => Promise<unknown>;
    findMany?: (args: unknown) => Promise<unknown>;
    findFirst?: (args: unknown) => Promise<unknown>;
    findUnique?: (args: unknown) => Promise<unknown>;
  };
};

const hasErrorCode = (error: unknown): error is { code: string } => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if (!('code' in error)) {
    return false;
  }

  return typeof (error as { code?: unknown }).code === 'string';
};

const isMissingMonetizationTableError = (error: unknown) => {
  return hasErrorCode(error) && error.code === 'P2021';
};

const ensureDefaultPlans = async () => {
  const planDelegate = getPlanDelegate();
  if (!planDelegate?.upsert) {
    return false;
  }

  try {
    for (const plan of DEFAULT_PLANS) {
      await planDelegate.upsert({
          where: { code: plan.code },
          update: {
            name: plan.name,
            description: plan.description,
            priceKrw: plan.priceKrw,
            interval: plan.interval,
            isActive: true,
          },
          create: {
            code: plan.code,
            name: plan.name,
            description: plan.description,
            priceKrw: plan.priceKrw,
            interval: plan.interval,
            isActive: true,
          },
        });
    }

    return true;
  } catch (error) {
    if (isMissingMonetizationTableError(error)) {
      return false;
    }

    throw error;
  }
};

const CheckoutInputSchema = z.object({
  planCode: z.string().min(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const ConfirmPaymentInputSchema = z.object({
  transactionId: z.string().min(1),
  orderId: z.string().min(1),
  paymentKey: z.string().min(1),
  amount: z.number().int().positive(),
});

const appendQuery = (url: string, key: string, value: string) => {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
};

const parsePlanCodeFromRawPayload = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const planCode = (value as { planCode?: unknown }).planCode;
  return typeof planCode === 'string' ? planCode : null;
};

const parseUrlFromRawPayload = (value: unknown, key: 'successUrl' | 'cancelUrl') => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const target = (value as { successUrl?: unknown; cancelUrl?: unknown })[key];
  return typeof target === 'string' ? target : null;
};

const getPeriodEnd = (start: Date, interval: 'MONTHLY' | 'YEARLY' | 'ONE_TIME') => {
  const end = new Date(start);
  if (interval === 'MONTHLY') {
    end.setMonth(end.getMonth() + 1);
    return end;
  }

  if (interval === 'YEARLY') {
    end.setFullYear(end.getFullYear() + 1);
    return end;
  }

  end.setDate(end.getDate() + 7);
  return end;
};

export const billingRouter = createTRPCRouter({
  listPlans: publicProcedure.query(async () => {
    const hasMonetizationTables = await ensureDefaultPlans();
    const planDelegate = getPlanDelegate();

    if (!hasMonetizationTables || !planDelegate?.findMany) {
      return {
        plans: DEFAULT_PLANS.map((plan) => ({
          id: `fallback-${plan.code}`,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          priceKrw: plan.priceKrw,
          interval: plan.interval,
        })),
      };
    }

    const rawPlans = await planDelegate.findMany({
      where: { isActive: true },
      orderBy: [{ priceKrw: 'asc' }, { createdAt: 'asc' }],
    });
    const plans = PlanRecordListSchema.parse(rawPlans);

    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        priceKrw: plan.priceKrw,
        interval: plan.interval,
      })),
    };
  }),

  subscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: ctx.userId,
        status: {
          in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
        },
      },
      orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      include: {
        plan: true,
      },
    });

    const entitlements = await prisma.entitlement.findMany({
      where: {
        userId: ctx.userId,
        isActive: true,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            plan: {
              code: subscription.plan.code,
              name: subscription.plan.name,
              priceKrw: subscription.plan.priceKrw,
              interval: subscription.plan.interval,
            },
          }
        : null,
      entitlements: entitlements.map((entitlement: {
        id: string;
        type: string;
        source: string;
        startsAt: Date;
        endsAt: Date | null;
      }) => ({
        id: entitlement.id,
        type: entitlement.type,
        source: entitlement.source,
        startsAt: entitlement.startsAt,
        endsAt: entitlement.endsAt,
      })),
    };
  }),

  createCheckout: protectedProcedure
    .input(CheckoutInputSchema)
    .mutation(async ({ input, ctx }) => {
      const hasMonetizationTables = await ensureDefaultPlans();
      const planDelegate = getPlanDelegate();

      if (!hasMonetizationTables || !planDelegate?.findFirst) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: '결제 시스템 초기 설정이 필요합니다. 운영자에게 문의해주세요.',
        });
      }

      const rawPlan = await planDelegate.findFirst({
        where: {
          code: input.planCode,
          isActive: true,
        },
      });
      const plan = PlanRecordNullableSchema.parse(rawPlan);

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '요금제를 찾을 수 없습니다' });
      }

      const activeSubscription = await prisma.subscription.findFirst({
        where: {
          userId: ctx.userId,
          status: {
            in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
          },
          planId: plan.id,
        },
      });

      if (activeSubscription) {
        throw new TRPCError({ code: 'CONFLICT', message: '이미 구독 중인 요금제입니다' });
      }

      const transaction = await prisma.paymentTransaction.create({
        data: {
          userId: ctx.userId,
          provider: 'TOSS',
          idempotencyKey: crypto.randomUUID(),
          amountKrw: plan.priceKrw,
          status: 'PENDING',
          rawPayload: {
            planCode: plan.code,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
            orderName: plan.name,
          },
        },
      });

      return {
        checkoutUrl: `/billing/checkout?transactionId=${transaction.id}`,
        transactionId: transaction.id,
        orderId: transaction.id,
        provider: 'TOSS' as const,
      };
    }),

  checkoutSession: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      const transaction = await prisma.paymentTransaction.findUnique({
        where: { id: input.transactionId },
      });

      if (!transaction || transaction.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '결제 세션을 찾을 수 없습니다' });
      }

      if (transaction.status !== 'PENDING') {
        throw new TRPCError({ code: 'CONFLICT', message: '이미 처리된 결제입니다' });
      }

      const planCode = parsePlanCodeFromRawPayload(transaction.rawPayload);
      if (!planCode) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '결제 세션에 플랜 정보가 없습니다' });
      }

      const planDelegate = getPlanDelegate();
      if (!planDelegate?.findUnique) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '결제 시스템 초기 설정이 필요합니다.' });
      }

      const rawPlan = await planDelegate.findUnique({ where: { code: planCode } });
      const plan = PlanRecordNullableSchema.parse(rawPlan);
      if (!plan || !plan.isActive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '요금제를 찾을 수 없습니다' });
      }

      const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!tossClientKey) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '결제 클라이언트 키가 설정되지 않았습니다' });
      }

      const env = getServerEnv();
      const successUrlBase =
        parseUrlFromRawPayload(transaction.rawPayload, 'successUrl')
        ?? `${env.NEXTAUTH_URL}/billing/success`;
      const failUrlBase =
        parseUrlFromRawPayload(transaction.rawPayload, 'cancelUrl')
        ?? `${env.NEXTAUTH_URL}/billing/fail`;

      return {
        transactionId: transaction.id,
        clientKey: tossClientKey,
        amount: transaction.amountKrw,
        orderId: transaction.id,
        orderName: plan.name,
        customerName: ctx.session?.user?.name ?? '러닝고 사용자',
        customerEmail: ctx.session?.user?.email ?? undefined,
        successUrl: appendQuery(successUrlBase, 'transactionId', transaction.id),
        failUrl: appendQuery(failUrlBase, 'transactionId', transaction.id),
      };
    }),

  confirmPayment: protectedProcedure
    .input(ConfirmPaymentInputSchema)
    .mutation(async ({ input, ctx }) => {
      const transaction = await prisma.paymentTransaction.findUnique({
        where: { id: input.transactionId },
      });

      if (!transaction || transaction.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '결제 세션을 찾을 수 없습니다' });
      }

      if (transaction.status === 'SUCCEEDED') {
        return {
          success: true,
          alreadyProcessed: true,
          transactionId: transaction.id,
        };
      }

      if (transaction.status !== 'PENDING') {
        throw new TRPCError({ code: 'CONFLICT', message: '결제 상태가 유효하지 않습니다' });
      }

      if (input.orderId !== transaction.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '주문 정보가 일치하지 않습니다' });
      }

      if (input.amount !== transaction.amountKrw) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '결제 금액이 일치하지 않습니다' });
      }

      const tossSecretKey = getServerEnv().TOSS_SECRET_KEY;
      if (!tossSecretKey) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '결제 시크릿 키가 설정되지 않았습니다' });
      }

      const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${tossSecretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: input.amount,
        }),
      });

      const tossPayload = await tossResponse.json();

      if (!tossResponse.ok) {
        const message =
          tossPayload && typeof tossPayload === 'object' && 'message' in tossPayload
            ? String((tossPayload as { message?: unknown }).message)
            : '결제 승인에 실패했습니다';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }

      const planCode = parsePlanCodeFromRawPayload(transaction.rawPayload);
      if (!planCode) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '결제 세션에 플랜 정보가 없습니다' });
      }

      const planDelegate = getPlanDelegate();
      if (!planDelegate?.findUnique) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '결제 시스템 초기 설정이 필요합니다.' });
      }

      const rawPlan = await planDelegate.findUnique({ where: { code: planCode } });
      const plan = PlanRecordNullableSchema.parse(rawPlan);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '요금제를 찾을 수 없습니다' });
      }

      const now = new Date();
      const periodStart = now;
      const periodEnd = getPeriodEnd(periodStart, plan.interval);

      const activeSubscription = await prisma.subscription.findFirst({
        where: {
          userId: ctx.userId,
          planId: plan.id,
          status: {
            in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const subscription = activeSubscription
        ? await prisma.subscription.update({
            where: { id: activeSubscription.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          })
        : await prisma.subscription.create({
            data: {
              userId: ctx.userId,
              planId: plan.id,
              provider: 'TOSS',
              status: 'ACTIVE',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
          });

      await prisma.$transaction([
        prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            subscriptionId: subscription.id,
            providerPaymentId: input.paymentKey,
            status: 'SUCCEEDED',
            paidAt: now,
            rawPayload: tossPayload,
          },
        }),
        prisma.entitlement.updateMany({
          where: {
            userId: ctx.userId,
            type: 'PRO',
            isActive: true,
          },
          data: {
            isActive: false,
            endsAt: now,
          },
        }),
        prisma.entitlement.create({
          data: {
            userId: ctx.userId,
            type: 'PRO',
            source: 'subscription',
            sourceRef: subscription.id,
            startsAt: periodStart,
            endsAt: periodEnd,
            isActive: true,
          },
        }),
      ]);

      return {
        success: true,
        alreadyProcessed: false,
        transactionId: transaction.id,
        subscriptionId: subscription.id,
      };
    }),

  markCheckoutFailed: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().min(1),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const transaction = await prisma.paymentTransaction.findUnique({
        where: { id: input.transactionId },
      });

      if (!transaction || transaction.userId !== ctx.userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '결제 세션을 찾을 수 없습니다' });
      }

      if (transaction.status !== 'PENDING') {
        return { success: true };
      }

      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          failedReason: input.reason,
        },
      });

      return { success: true };
    }),

  cancelSubscription: protectedProcedure
    .input(
      z
        .object({
          immediate: z.boolean().optional(),
        })
        .optional()
    )
    .mutation(async ({ input, ctx }) => {
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: ctx.userId,
          status: {
            in: ['TRIALING', 'ACTIVE', 'PAST_DUE'],
          },
        },
        orderBy: [{ currentPeriodEnd: 'desc' }, { createdAt: 'desc' }],
      });

      if (!subscription) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '활성 구독이 없습니다' });
      }

      const now = new Date();
      const immediate = input?.immediate ?? false;

      if (immediate) {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'CANCELED',
              canceledAt: now,
              currentPeriodEnd: now,
              cancelAtPeriodEnd: false,
            },
          }),
          prisma.entitlement.updateMany({
            where: {
              userId: ctx.userId,
              sourceRef: subscription.id,
              isActive: true,
            },
            data: {
              isActive: false,
              endsAt: now,
            },
          }),
        ]);

        return { success: true, canceledImmediately: true };
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
        },
      });

      return { success: true, canceledImmediately: false };
    }),
});
