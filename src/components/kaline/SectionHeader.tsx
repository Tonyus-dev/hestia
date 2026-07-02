export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-8 md:mb-10 max-w-3xl fade-up">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[color:var(--kaline-copper)]/60" />
        <p className="ka-kicker">{eyebrow}</p>
      </div>
      <h1 className="mt-5 ka-title-display">
        {title}
        <span className="text-[color:var(--kaline-copper)]">.</span>
      </h1>
      {subtitle && (
        <p className="mt-5 text-[color:var(--kaline-muted)] text-base md:text-lg leading-relaxed">
          {subtitle}
        </p>
      )}
    </header>
  );
}
