import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, ExternalLink, FileText, RefreshCw, Search } from "lucide-react";

import { hestiaApi, formatBytes } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_station/codice")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Códice" },
      { name: "description", content: "Biblioteca real e somente leitura da Station TV Box." },
    ],
  }),
  component: CodicePage,
});

function CodicePage() {
  const { state, retry, refreshing } = useApi(hestiaApi.tvboxCodiceLibrary);
  const [searchQuery, setSearchQuery] = useState("");
  const books = state.status === "ok" ? state.data.books : [];
  const query = searchQuery.trim().toLocaleLowerCase("pt-BR");
  const filteredBooks = books.filter(
    (book) =>
      !query ||
      book.title.toLocaleLowerCase("pt-BR").includes(query) ||
      book.name.toLocaleLowerCase("pt-BR").includes(query),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="kaline-eyebrow">/codice</p>
          <h1 className="kaline-serif text-3xl text-[color:var(--kaline-text)] md:text-4xl">
            Biblioteca do Códice
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--kaline-muted)]">
            Acervo real da TV Box. Esta tela é somente leitura e não importa nem converte arquivos.
          </p>
        </div>
        {state.status === "ok" && (
          <button
            type="button"
            onClick={retry}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--kaline-border-copper)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-copper)] disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            Recarregar
          </button>
        )}
      </header>

      {state.status === "loading" && (
        <p className="py-8 text-center text-[color:var(--kaline-muted)]">
          Consultando a biblioteca da TV Box…
        </p>
      )}

      {state.status === "unavailable" && (
        <UnavailableNote
          message={state.message}
          details={state.details}
          onRetry={retry}
          refreshing={refreshing}
        />
      )}

      {state.status === "ok" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="kaline-eyebrow">Livros disponíveis ({filteredBooks.length})</p>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[color:var(--kaline-muted)]" />
              <input
                type="search"
                placeholder="Pesquisar livros…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-full border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] py-2 pl-9 pr-4 text-sm text-[color:var(--kaline-text)] focus:outline-none focus:border-[color:var(--kaline-copper)]"
              />
            </div>
          </div>

          {state.data.truncated && (
            <p className="text-xs text-[color:var(--kaline-amber)]">
              A Station limitou a listagem a {state.data.limit} itens.
            </p>
          )}

          {filteredBooks.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)]/20 p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-[color:var(--kaline-muted)] opacity-30" />
              <p className="mt-4 text-[color:var(--kaline-muted)]">
                {books.length === 0
                  ? "A biblioteca da TV Box está vazia."
                  : "Nenhum livro corresponde à pesquisa."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBooks.map((book) => {
                const bookUrl = hestiaApi.tvboxCodiceBookUrl(book.id);
                return (
                  <article
                    key={book.id}
                    className="flex flex-col justify-between rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="rounded bg-[color:var(--kaline-copper)]/10 px-2 py-0.5 text-[10px] uppercase text-[color:var(--kaline-copper)]">
                          {book.format}
                        </span>
                        <span className="font-mono text-[11px] text-[color:var(--kaline-muted)]">
                          {formatBytes(book.size)}
                        </span>
                      </div>
                      <h2 className="line-clamp-2 text-sm font-medium text-[color:var(--kaline-text)]">
                        {book.title}
                      </h2>
                      <p className="text-[10px] text-[color:var(--kaline-muted)]">
                        {new Date(book.modifiedAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-4 border-t border-[color:var(--kaline-border-copper)]/30 pt-3 text-xs">
                      <a
                        href={bookUrl}
                        target={book.format === "pdf" ? "_blank" : undefined}
                        rel={book.format === "pdf" ? "noreferrer" : undefined}
                        className="inline-flex items-center gap-1.5 text-[color:var(--kaline-copper)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir
                      </a>
                      <a
                        href={bookUrl}
                        download={book.name}
                        className="inline-flex items-center gap-1.5 text-[color:var(--kaline-muted)]"
                      >
                        <Download className="h-3.5 w-3.5" /> Baixar
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
