import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

/**
 * Route protection runs at the edge before any server component renders, so an
 * unauthorised request never reaches the database layer.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ['/admin/:path*', '/account/:path*'],
};
