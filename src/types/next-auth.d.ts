import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      loyaltyTier: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
    loyaltyTier?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    loyaltyTier?: string;
  }
}
