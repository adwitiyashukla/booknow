'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // In production this is where an observability client would report.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-32 text-center">
      <h1 className="text-2xl text-ink-50">Something went wrong</h1>
      <p className="mt-2 text-ink-400">
        The error has been logged. You can retry, or head back to the room list.
      </p>
      <button onClick={reset} className="mt-6 rounded-full bg-brand-500 px-5 py-2.5 font-semibold text-ink-950">
        Try again
      </button>
    </div>
  );
}
