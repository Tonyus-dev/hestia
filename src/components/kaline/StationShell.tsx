import { type ReactNode } from "react";
import { TopBar } from "./TopBar";
import { SidebarNav } from "./SidebarNav";
import { PhaseFilterToggle } from "./PhaseFilter";

export function StationShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="flex">
        {/* Sidebar: unlocked at lg (1024px) so common laptops get it too */}
        <aside className="hidden lg:flex flex-col shrink-0 w-[240px] xl:w-[260px] border-r border-[color:var(--kaline-border-copper)] min-h-[calc(100vh-4rem)] sticky top-16 self-start">
          <div className="px-5 pt-6 pb-4">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[color:var(--kaline-faint)]">
              Estação
            </p>
            <p className="mt-1 serif text-[15px] text-[color:var(--kaline-muted)]">
              protótipo visual · sem backend
            </p>
          </div>
          <div className="px-5 pb-3">
            <PhaseFilterToggle />
            <p className="mt-2 text-[9px] uppercase tracking-[0.24em] text-[color:var(--kaline-faint)]/60">
              filtro de fase
            </p>
          </div>
          <div className="px-3 py-2 flex-1 overflow-y-auto">
            <SidebarNav />
          </div>
          <div className="p-4 border-t border-[color:var(--kaline-border-copper)] text-[10px] uppercase tracking-[0.28em] text-[color:var(--kaline-faint)]">
            sem métricas · sem execução
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 sm:px-6 md:px-8 lg:px-10 py-8 md:py-12 lg:py-14">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
