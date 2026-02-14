import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const WEBHOOK_ALLOWED_SKEW_MS = 5 * 60 * 1000;

const BillingWebhookSchema = z.object({
  eventType: z.enum(['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'SUBSCRIPTION_CANCELED']),
  idempotencyKey: z.string().optional(),
  providerPaymentId: z.string().optional(),
  providerSubscriptionId: z.string().optional(),
  userId: z.string().optional(),
  planCode: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  paidAt: z.string().optional(),
  reason: z.string().optional(),
  payload: z.unknown().optional(),
});

const toDateOrNull = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parsePlanCodeFromRawPayload = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const planCode = (value as { planCode?: unknown }).planCode;
  return typeof planCode === 'string' ? planCode : null;
};

const toJsonPayload = (
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

const safeEqualText = (a: string, b: string) => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
};

const safeEqualHex = (a: string, b: string) => {
  try {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
      return false;
    }

    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const extractSignatureValue = (headerValue: string | null) => {
  if (!headerValue) {
    return null;
  }

  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }

  const tagged = trimmed
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('v1='));

  if (tagged) {
    return tagged.slice(3);
  }

  return trimmed;
};

const toTimestampMs = (timestampHeader: string | null) => {
  if (!timestampHeader) {
    return null;
  }

  const parsed = Number(timestampHeader);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed > 1_000_000_000_000) {
    return parsed;
  }

  return parsed * 1000;
};

const verifyWebhookSignature = ({
  secret,
  rawBody,
  timestampHeader,
  signatureHeader,
}: {
  secret: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}) => {
  const signatureValue = extractSignatureValue(signatureHeader);
  const timestampMs = toTimestampMs(timestampHeader);

  if (!signatureValue || !timestampHeader || !timestampMs) {
    return false;
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > WEBHOOK_ALLOWED_SKEW_MS) {
    return false;
  }

  const signedPayload = `${timestampHeader}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return safeEqualHex(signatureValue, expected);
};

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const webhookSecret = process.env.BILLING_WEBHOOK_SECRET;

    if (webhookSecret) {
      const legacySecret = req.headers.get('x-billing-webhook-secret');
      const hasLegacySecret = Boolean(legacySecret);
      const legacySecretValid = hasLegacySecret && safeEqualText(legacySecret!, webhookSecret);

      const signatureValid = verifyWebhookSignature({
        secret: webhookSecret,
        rawBody,
        timestampHeader: req.headers.get('x-billing-timestamp'),
        signatureHeader: req.headers.get('x-billing-signature'),
      });

      if (!legacySecretValid && !signatureValid) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const payload = BillingWebhookSchema.parse(JSON.parse(rawBody));

    let transaction = payload.idempotencyKey
      ? await prisma.paymentTransaction.findUnique({
          where: { idempotencyKey: payload.idempotencyKey },
        })
      : null;

    if (!transaction && payload.providerPaymentId) {
      transaction = await prisma.paymentTransaction.findUnique({
        where: { providerPaymentId: payload.providerPaymentId },
      });
    }

    if (payload.eventType === 'PAYMENT_FAILED') {
      if (!transaction) {
        return NextResponse.json({ ok: true, ignored: true });
      }

      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          failedReason: payload.reason,
          rawPayload: toJsonPayload(payload.payload),
        },
      });

      return NextResponse.json({ ok: true });
    }

    if (payload.eventType === 'SUBSCRIPTION_CANCELED') {
      const subscription = payload.providerSubscriptionId
        ? await prisma.subscription.findUnique({
            where: { providerSubscriptionId: payload.providerSubscriptionId },
          })
        : null;

      if (!subscription) {
        return NextResponse.json({ ok: true, ignored: true });
      }

      const now = new Date();

      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'CANCELED',
            canceledAt: now,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: now,
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
            endsAt: now,
          },
        }),
      ]);

      return NextResponse.json({ ok: true });
    }

    // PAYMENT_SUCCEEDED
    if (!transaction && (!payload.userId || !payload.planCode)) {
      return NextResponse.json(
        { error: 'Missing transaction context for payment success event' },
        { status: 400 }
      );
    }

    const userId = transaction?.userId ?? payload.userId!;
    const planCode = payload.planCode ?? parsePlanCodeFromRawPayload(transaction?.rawPayload);

    if (!planCode) {
      return NextResponse.json({ error: 'Missing plan code for payment success event' }, { status: 400 });
    }

    const plan = await prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found for payment success event' }, { status: 400 });
    }

    const now = new Date();
    const periodStart = toDateOrNull(payload.periodStart) ?? now;
    const periodEnd = toDateOrNull(payload.periodEnd);
    const paidAt = toDateOrNull(payload.paidAt) ?? now;

    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        planId: plan.id,
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] },
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
            providerSubscriptionId: payload.providerSubscriptionId ?? activeSubscription.providerSubscriptionId,
          },
        })
      : await prisma.subscription.create({
          data: {
            userId,
            planId: plan.id,
            provider: 'TOSS',
            providerSubscriptionId: payload.providerSubscriptionId,
            status: 'ACTIVE',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
        });

    if (transaction) {
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          subscriptionId: subscription.id,
          providerPaymentId: payload.providerPaymentId,
          status: 'SUCCEEDED',
          paidAt,
          rawPayload: toJsonPayload(payload.payload),
        },
      });
    } else {
      await prisma.paymentTransaction.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          provider: 'TOSS',
          providerPaymentId: payload.providerPaymentId,
          idempotencyKey: payload.idempotencyKey ?? crypto.randomUUID(),
          amountKrw: plan.priceKrw,
          status: 'SUCCEEDED',
          paidAt,
          rawPayload: toJsonPayload(payload.payload),
        },
      });
    }

    await prisma.$transaction([
      prisma.entitlement.updateMany({
        where: {
          userId,
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
          userId,
          type: 'PRO',
          source: 'subscription',
          sourceRef: subscription.id,
          startsAt: periodStart,
          endsAt: periodEnd,
          isActive: true,
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid webhook json payload' }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid webhook payload', details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: 'Webhook 처리 중 오류가 발생했습니다' }, { status: 500 });
  }
}
