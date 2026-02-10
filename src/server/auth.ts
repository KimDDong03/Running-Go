import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';
import { getServerEnv } from '@/lib/env';

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: getServerEnv().NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Google({
      clientId: getServerEnv().GOOGLE_CLIENT_ID,
      clientSecret: getServerEnv().GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const providerId = account.providerAccountId;
        const email = profile.email ?? token.email;
        if (!email) {
          return token;
        }

        const user = await prisma.user.upsert({
          where: { providerId },
          update: {
            email,
            name: profile.name ?? token.name ?? null,
            image: profile.picture ?? token.picture ?? null,
            provider: account.provider,
          },
          create: {
            email,
            name: profile.name ?? token.name ?? null,
            image: profile.picture ?? token.picture ?? null,
            provider: account.provider,
            providerId,
          },
        });

        token.userId = user.id;
      }

      if (!token.userId && token.email) {
        const user = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (user) {
          token.userId = user.id;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
