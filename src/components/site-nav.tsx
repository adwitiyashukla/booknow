import Link from 'next/link';
import { LogOut, Waves } from 'lucide-react';

import { auth, signOut } from '@/server/auth';
import { Button, ButtonLink } from '@/components/ui';

/**
 * Sessions are JWTs, so they carry a snapshot of the user taken at sign-in.
 * Signing out and back in is what picks up a changed name or role, which makes
 * this control functional rather than decorative. It posts to a server action
 * so the cookie is cleared server side and it still works without JavaScript.
 */
function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/' });
      }}
    >
      <Button type="submit" variant="ghost" size="sm" aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" />
      </Button>
    </form>
  );
}

export async function SiteNav() {
  const session = await auth().catch(() => null);
  const role = session?.user?.role;

  return (
    <header className="sticky top-0 z-40 border-b hairline glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-500/15 text-brand-400">
            <Waves className="size-5" />
          </span>
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight text-ink-50">
            BookNow
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-ink-300 md:flex">
          <Link href="/rooms" className="transition-colors hover:text-ink-50">Rooms</Link>
          <Link href="/#experience" className="transition-colors hover:text-ink-50">The property</Link>
          <Link href="/#engineering" className="transition-colors hover:text-ink-50">How it works</Link>
          {role === 'ADMIN' || role === 'STAFF' ? (
            <Link href="/admin" className="transition-colors hover:text-ink-50">Operations</Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          {session?.user ? (
            <>
              <ButtonLink href="/account" variant="secondary" size="sm">
                {session.user.name?.split(' ')[0] ?? 'Account'}
              </ButtonLink>
              <SignOutButton />
            </>
          ) : (
            <ButtonLink href="/signin" variant="ghost" size="sm">Sign in</ButtonLink>
          )}
          <ButtonLink href="/rooms" size="sm">Book a stay</ButtonLink>
        </div>
      </div>
    </header>
  );
}
