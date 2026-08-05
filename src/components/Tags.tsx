export function TagPills({
  tags,
  onRemove,
  max = 3,
  className = "",
}: {
  tags: string[];
  onRemove?: (tag: string) => void;
  max?: number;
  className?: string;
}) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const extra = tags.length - shown.length;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {t}
          {onRemove && (
            <button
              type="button"
              title={`Remove tag ${t}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(t);
              }}
              className="text-slate-400 hover:text-slate-700"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </span>
      ))}
      {extra > 0 && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          +{extra}
        </span>
      )}
    </span>
  );
}
