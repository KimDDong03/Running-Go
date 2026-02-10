import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const run = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - 6);

  const result = await prisma.runSession.updateMany({
    where: {
      createdAt: { lt: cutoff },
    },
    data: {
      path: [],
    },
  });

  console.log(`Pruned runSession paths: ${result.count}`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
