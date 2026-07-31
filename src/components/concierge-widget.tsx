'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MessageSquare, Send, Sparkles, X } from 'lucide-react';

import { formatMoney } from '@/lib/money';

interface Suggestion {
  roomTypeId: string;
  slug: string;
  name: string;
  nightlyFromCents: number;
  reasons: string[];
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  understood?: string;
  tier?: 'llm' | 'rules';
  suggestions?: Suggestion[];
  searchUrl?: string | null;
}

const STARTERS = [
  'Quiet sea-view room for 2 next weekend under $300',
  'Somewhere I can work remotely for a week',
  'Family suite with a kitchenette in December',
  'What is your cancellation policy?',
];

export function ConciergeWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: 'assistant',
      text: 'I am the reservations concierge. Describe the stay you want in plain English and I will shortlist rooms that actually fit.',
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setTurns((t) => [...t, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);

    try {
      const response = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json();

      setTurns((t) => [
        ...t,
        response.ok
          ? {
              role: 'assistant',
              text: data.answer,
              understood: data.understood,
              tier: data.tier,
              suggestions: data.suggestions,
              searchUrl: data.searchUrl,
            }
          : { role: 'assistant', text: data.error ?? 'Something went wrong. Try again in a moment.' },
      ]);
    } catch {
      setTurns((t) => [...t, { role: 'assistant', text: 'I could not reach the server. Check your connection.' }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 9e9, behavior: 'smooth' }));
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the AI concierge"
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-3.5 font-semibold text-ink-950 shadow-2xl shadow-brand-700/40 transition-transform hover:scale-105"
      >
        <Sparkles className="size-4" /> Ask the concierge
      </button>
    );
  }

  return (
    // Tall and wide enough that a typical answer plus its three suggestions
    // fit without scrolling. The calc caps it against the viewport, allowing
    // for the 1.25rem offset top and bottom, so it never runs off a short screen.
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(44rem,calc(100dvh-7rem))] w-[min(27rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl glass shadow-2xl">
      <div className="flex items-center justify-between border-b hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand-400" />
          <span className="text-sm font-semibold text-ink-50">Concierge</span>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close concierge" className="text-ink-500 hover:text-ink-100">
          <X className="size-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === 'user' ? 'flex justify-end' : ''}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-3.5 py-2.5 text-sm text-ink-950'
                  : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-ink-800/70 px-3.5 py-2.5 text-sm text-ink-100'
              }
            >
              <p className="whitespace-pre-wrap">{turn.text}</p>

              {turn.understood ? (
                <p className="mt-2 border-t hairline pt-2 text-[11px] text-ink-500">
                  Understood: {turn.understood}
                  {turn.tier ? ` · ${turn.tier === 'llm' ? 'LLM planner' : 'rule-based planner'}` : ''}
                </p>
              ) : null}

              {turn.suggestions?.length ? (
                <ul className="mt-2.5 space-y-2">
                  {turn.suggestions.map((s) => (
                    <li key={s.roomTypeId}>
                      <Link
                        href={`/rooms/${s.slug}`}
                        className="block rounded-xl border hairline bg-ink-900/60 p-2.5 transition-colors hover:border-brand-400/60"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink-50">{s.name}</span>
                          <span className="text-xs text-brand-200">{formatMoney(s.nightlyFromCents)}</span>
                        </span>
                        {s.reasons[0] ? <span className="mt-0.5 block text-[11px] text-ink-500">{s.reasons[0]}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}

              {turn.searchUrl ? (
                <Link href={turn.searchUrl} className="mt-2.5 inline-block text-xs font-medium text-brand-300 hover:underline">
                  See all matching rooms →
                </Link>
              ) : null}
            </div>
          </div>
        ))}

        {turns.length === 1 ? (
          <div className="space-y-1.5 pt-1">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-xl border hairline px-3 py-2 text-left text-xs text-ink-300 transition-colors hover:border-brand-400/60 hover:text-ink-100"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {busy ? (
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <Loader2 className="size-3.5 animate-spin" /> Checking availability...
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t hairline p-3"
      >
        <MessageSquare className="size-4 shrink-0 text-ink-500" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your ideal stay..."
          aria-label="Message the concierge"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-500 text-ink-950 disabled:opacity-40"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
