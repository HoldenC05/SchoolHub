import { quoteForDate } from "../lib/quotes";

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

export function VerseFooter() {
  const quote = quoteForDate();
  return (
    <p className="shrink-0 border-t border-slate-100 bg-white/70 px-4 py-2 text-center text-xs leading-relaxed text-slate-500">
      “{quote.text}” <span className="text-slate-400">— {quote.ref}</span>
    </p>
  );
}
