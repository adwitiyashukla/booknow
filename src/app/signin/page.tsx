import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { Button, Card, Input, Label } from '@/components/ui';
import { auth, signIn } from '@/server/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth().catch(() => null);
  if (session?.user) redirect('/account');

  const { error, callbackUrl } = await searchParams;

  async function authenticate(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        redirectTo: callbackUrl ?? '/account',
      });
    } catch (e) {
      // next-auth signals a successful redirect by throwing; rethrow it.
      if ((e as Error).message?.includes('NEXT_REDIRECT')) throw e;
      redirect('/signin?error=CredentialsSignin');
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <h1 className="font-[family-name:var(--font-display)] text-4xl text-ink-50">Sign in</h1>
      <p className="mt-2 text-ink-400">Manage your stays, or open the operations dashboard.</p>

      <Card className="mt-8 p-6">
        <form action={authenticate} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="guest@booknow.dev" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="Password123" />
          </div>
          {error ? (
            <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-200">
              That email and password did not match.
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full">Sign in</Button>
        </form>
      </Card>

      <Card className="mt-5 p-5 text-sm">
        <p className="mb-2 font-medium text-ink-100">Demo accounts</p>
        <ul className="space-y-1 text-ink-400">
          <li><code className="text-brand-300">admin@booknow.dev</code> / Password123 · full dashboard</li>
          <li><code className="text-brand-300">staff@booknow.dev</code> / Password123 · front desk</li>
          <li><code className="text-brand-300">guest@booknow.dev</code> / Password123 · guest view</li>
        </ul>
      </Card>
    </div>
  );
}
