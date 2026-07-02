import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { KalineMark } from "./KalineMark";
import { SidebarNav } from "./SidebarNav";
import { PhaseFilterToggle } from "./PhaseFilter";

export function TopBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-obsidian)]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[color:var(--kaline-obsidian)]/70">
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4 px-3 sm:px-6 md:px-8 h-14 md:h-16 transition-[height,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {/* left — mobile menu only */}
        <div className="flex items-center">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Abrir navegação"
                aria-expanded={open}
                className="lg:hidden inline-flex items-center justify-center h-10 w-10 rounded-md border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10 active:bg-[color:var(--kaline-copper)]/15 transition-[background-color,border-color,transform] duration-200 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--kaline-copper)]/50"
              >
                <Menu
                  className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
                />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[88%] max-w-[340px] bg-[color:var(--kaline-obsidian)]/95 backdrop-blur-2xl border-r border-[color:var(--kaline-border-copper)] p-0 flex flex-col shadow-[8px_0_40px_-12px_oklch(0_0_0/0.6)] data-[state=open]:duration-[420ms] data-[state=closed]:duration-[260ms] data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)]"
            >
              <SheetTitle className="sr-only">Navegação da Estação</SheetTitle>
              <div className="p-5 border-b border-[color:var(--kaline-border-copper)]">
                <KalineMark size="md" />
                <p className="mt-1.5 text-[10px] uppercase tracking-[0.24em] text-[color:var(--kaline-faint)]">
                  Estação Kaline · protótipo visual
                </p>
              </div>
              <div className="px-5 py-4 border-b border-[color:var(--kaline-border-copper)]/60">
                <PhaseFilterToggle />
                <p className="mt-2 text-[9px] uppercase tracking-[0.24em] text-[color:var(--kaline-faint)]/60">
                  filtro de fase
                </p>
              </div>
              <div className="p-4 overflow-y-auto flex-1 overscroll-contain">
                <SidebarNav mobile onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* center — wordmark (safe-centered, never collides with menu) */}
        <div className="min-w-0 flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 sm:gap-3 min-w-0 max-w-full rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors duration-200 hover:bg-[color:var(--kaline-copper)]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--kaline-copper)]/40"
            aria-label="K∧LINE. — Home"
          >
            <KalineMark size="md" />
            <span
              aria-hidden
              className="shrink-0 inline-block h-2 w-2 rounded-full bg-[color:var(--kaline-amber)] shadow-[0_0_10px_oklch(0.82_0.19_60/0.75)] animate-[pulse_3s_ease-in-out_infinite]"
            />
          </Link>
        </div>

        {/* right — balances the grid so wordmark stays centered */}
        <div className="w-10 h-10" aria-hidden />
      </div>
    </header>
  );
}
