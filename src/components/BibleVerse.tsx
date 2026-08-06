import { useEffect, useState } from "react";
import { nextQuote, quoteForDate, type Quote } from "../lib/quotes";

export function BibleVerse() {
  const quote = quoteForDate();
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
      <span className="text-lg leading-none text-amber-500">✠</span>
      <div className="min-w-0">
        <p className="text-sm leading-relaxed text-slate-700">“{quote.text}”</p>
        <p className="mt-0.5 text-xs font-medium text-amber-700">{quote.ref}</p>
      </div>
    </div>
  );
}

const SHOW_MS = 20000;
const ROTATE_MS = 5 * 60 * 1000;

export function VerseToast() {
  const [quote, setQuote] = useState<Quote | null>(() => quoteForDate());
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    let mounted = true;
    let hideTimer: number | undefined;
    const show = () => {
      if (!mounted) return;
      setQuote((q) => nextQuote(q ?? quoteForDate()));
      setVisible(true);
      hideTimer = window.setTimeout(() => setVisible(false), SHOW_MS);
    };
    const first = window.setTimeout(() => {
      if (!mounted) return;
      setVisible(true);
      hideTimer = window.setTimeout(() => setVisible(false), SHOW_MS);
    }, 30 * 1000);
    const interval = window.setInterval(() => {
      if (!mounted) return;
      show();
    }, ROTATE_MS);
    return () => {
      mounted = false;
      window.clearTimeout(first);
      window.clearTimeout(hideTimer);
      window.clearInterval(interval);
    };
  }, [dismissed]);

  if (!visible || !quote) return null;

  return (
    <div className="fixed bottom-5 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] animate-fade-slide">
      <div className="rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-lg backdrop-blur">
        <div className="flex items-start gap-2.5">
          <span className="text-amber-500">✠</span>
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-700">“{quote.text}”</p>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-md p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 pl-6 text-xs font-medium text-amber-700">{quote.ref}</p>
      </div>
    </div>
  );
}
