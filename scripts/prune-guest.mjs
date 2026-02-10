import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const run = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime());
  cutoff.setDate(cutoff.getDate() - 90);

  const guest = await prisma.user.findUnique({
    where: { providerId: 'guest' },
  });

  if (!guest) {
    console.log('Guest user not found.');
    return;
  }

  const [runSessions, collections, likes] = await Promise.all([
    prisma.runSession.deleteMany({
      where: { userId: guest.id, createdAt: { lt: cutoff } },
    }),
    prisma.collection.deleteMany({
      where: { userId: guest.id, lastAt: { lt: cutoff } },
    }),
    prisma.like.deleteMany({
      where: { userId: guest.id, createdAt: { lt: cutoff } },
    }),
  ]);

  console.log(`Pruned guest data: runs=${runSessions.count}, collections=${collections.count}, likes=${likes.count}`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
