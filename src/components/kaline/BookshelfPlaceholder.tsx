export function BookshelfPlaceholder() {
  // 12 empty spines, no titles, tonal variations only.
  const spines = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="kaline-glass p-6">
      <div className="flex items-end gap-1.5 h-56 md:h-64 overflow-hidden">
        {spines.map((i) => {
          const h = 70 + ((i * 37) % 30); // %
          const tone = [
            "linear-gradient(180deg, oklch(0.22 0.06 18), oklch(0.12 0.02 22))",
            "linear-gradient(180deg, oklch(0.26 0.09 15), oklch(0.13 0.03 20))",
            "linear-gradient(180deg, oklch(0.30 0.11 12), oklch(0.14 0.03 18))",
            "linear-gradient(180deg, oklch(0.20 0.05 20), oklch(0.11 0.02 24))",
          ][i % 4];
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm border-t border-x border-[color:var(--kaline-border-copper)] relative"
              style={{ height: `${h}%`, background: tone }}
            >
              <span
                aria-hidden
                className="absolute inset-x-2 top-3 h-px bg-[color:var(--kaline-gold)]/35"
              />
              <span
                aria-hidden
                className="absolute inset-x-2 bottom-3 h-px bg-[color:var(--kaline-gold)]/20"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-[0.22em]">
        <span className="text-[color:var(--kaline-faint)]">estante planejada</span>
        <span className="text-[color:var(--kaline-copper)]">aguardando biblioteca local</span>
      </div>
    </div>
  );
}
