export function HardwareSpec({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-[color:var(--kaline-border-copper)]">
      {items.map((it) => (
        <div
          key={it.label}
          className="grid grid-cols-[minmax(140px,1fr)_2fr] gap-4 py-3.5 items-baseline"
        >
          <dt className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-faint)]">
            {it.label}
          </dt>
          <dd className="kaline-serif text-[color:var(--kaline-text)] text-lg leading-snug">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
