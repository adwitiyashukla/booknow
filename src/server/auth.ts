import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { authConfig } from '@/auth.config';
import { db } from './db';
import { ForbiddenError, UnauthorizedError } from './errors';

const credentialsSchema = z.object({ email: z.email(), password: z.string().min(8) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) {
          await bcrypt.compare(
            parsed.data.password,
            '$2a$12$C6UzMDM.H6dfI/f/IKcEeO1a3xIpZ3qFcQpQpQpQpQpQpQpQpQpQu',
          );
          return null;
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          loyaltyTier: user.loyaltyTier,
        };
      },
    }),
  ],
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session.user;
}

export async function requireRole(...roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
