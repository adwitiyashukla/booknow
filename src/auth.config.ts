import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the auth configuration.
 *
 * Next.js middleware runs on the edge runtime, which cannot load the Prisma
 * client. Splitting the config means middleware can still make authorization
 * decisions from the JWT without dragging a database driver into the edge
 * bundle. The Node-only half (adapter, credential verification) lives in
 * src/server/auth.ts.
 */
export const authConfig = {
  pages: { signIn: '/signin', error: '/signin' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const role = auth?.user?.role ?? 'ANONYMOUS';
      const { pathname } = request.nextUrl;

      if (pathname.startsWith('/admin')) return role === 'ADMIN' || role === 'STAFF';
      if (pathname.startsWith('/account')) return Boolean(auth?.user);
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.loyaltyTier = user.loyaltyTier;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? '');
        session.user.role = (token.role as string) ?? 'GUEST';
        session.user.loyaltyTier = (token.loyaltyTier as string) ?? 'EXPLORER';
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
