import type { NextAuthConfig } from 'next-auth';

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
