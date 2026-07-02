import { useEffect, useState } from "react";

export function LocalClock({
  className,
  captionClassName = "",
}: {
  className?: string;
  /** Extra classes on the caption row — pass "hidden md:block" to hide it on mobile. */
  captionClassName?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 15);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  return (
    <div className={className}>
      <div className="kaline-serif text-[color:var(--kaline-text)] leading-none tabular-nums">
        {time}
      </div>
      <div
        className={`mt-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--kaline-faint)] ${captionClassName}`}
      >
        hora local deste dispositivo
      </div>
    </div>
  );
}
