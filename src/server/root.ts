import { createTRPCRouter } from './trpc';
import { courseRouter } from './routers/course';
import { collectionRouter } from './routers/collection';
import { likeRouter } from './routers/like';
import { rankingRouter } from './routers/ranking';
import { runSessionRouter } from './routers/run-session';
import { homeRouter } from './routers/home';
import { profileRouter } from './routers/profile';
import { billingRouter } from './routers/billing';

export const appRouter = createTRPCRouter({
  course: courseRouter,
  collection: collectionRouter,
  like: likeRouter,
  ranking: rankingRouter,
  runSession: runSessionRouter,
  home: homeRouter,
  profile: profileRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
