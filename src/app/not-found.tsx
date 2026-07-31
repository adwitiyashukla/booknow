import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-32 text-center">
      <p className="font-[family-name:var(--font-display)] text-6xl text-brand-400">404</p>
      <h1 className="mt-4 text-2xl text-ink-50">We could not find that page</h1>
      <p className="mt-2 text-ink-400">
        The link may be old, or the booking reference may have expired.
      </p>
      <Link href="/rooms" className="mt-6 rounded-full bg-brand-500 px-5 py-2.5 font-semibold text-ink-950">
        Browse rooms
      </Link>
    </div>
  );
}
