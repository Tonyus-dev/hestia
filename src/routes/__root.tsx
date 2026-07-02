import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import kaApple from "../assets/ka-apple.png.asset.json";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";


function NotFoundComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="kaline-eyebrow">Rota fora do mapa</p>
        <h1 className="mt-3 kaline-serif text-6xl text-[color:var(--kaline-text)]">404</h1>
        <p className="mt-3 text-[color:var(--kaline-muted)]">
          Este cômodo da Héstia ainda não existe.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-border-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-copper)]"
          >
            Voltar ao painel
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="kaline-eyebrow">Interferência no painel</p>
        <h1 className="mt-3 kaline-serif text-2xl text-[color:var(--kaline-text)]">
          A tela não pôde ser desenhada agora
        </h1>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-copper)]/60 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-copper)]"
          >
            tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-border-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-muted)]"
          >
            voltar ao painel
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Héstia Console — Interface local da Héstia" },
      {
        name: "description",
        content:
          "Console local somente leitura da Héstia, com Chama Local embutida para medir saúde, storage e serviços do servidor.",
      },
      { name: "author", content: "Estação Kaline" },
      { property: "og:title", content: "Héstia Console — Interface local da Héstia" },
      {
        property: "og:description",
        content:
          "Frontend local + Chama Local embutida. Somente leitura. Nenhuma métrica inventada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "icon",
        type: "image/svg+xml",
        href:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0e0a08"/><path d="M32 12c4 6 10 9 10 18a10 10 0 0 1-20 0c0-4 2-6 4-8-1 4 1 6 3 6 0-6-3-10 3-16z" fill="#c8873d"/><path d="M32 22c2 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 3-5 0 3 2 3 2 0z" fill="#f4c27a"/></svg>`,
          ),
      },
      { rel: "apple-touch-icon", href: kaApple.url },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap",
      },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <Outlet />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
