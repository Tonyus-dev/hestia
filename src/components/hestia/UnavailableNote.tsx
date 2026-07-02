import { useEffect, useState } from "react";
import { HESTIA } from "@/content/kaline";
import type { ApiErrorDetails } from "@/lib/hestia/api";

const ORIGIN_LABEL: Record<ApiErrorDetails["origin"], string> = {
  "no-base": "Sem host local",
  network: "Falha de rede",
  timeout: "Tempo esgotado",
  http: "Resposta HTTP de erro",
};

function humanSummary(details?: ApiErrorDetails): string {
  if (!details) return "Sem detalhes estruturados disponíveis.";
  switch (details.origin) {
    case "no-base":
      return "O frontend não está em host local, então nenhuma requisição foi enviada. Rode a Chama Local e acesse pelo navegador em http://localhost:4517.";
    case "timeout":
      return `A rota ${details.route ?? "desconhecida"} não respondeu em ${details.timeoutMs ?? "?"}ms. O processo pode estar travado ou o host sobrecarregado.`;
    case "network":
      return `A requisição para ${details.route ?? "a Chama Local"} falhou antes de receber resposta: ${details.detail ?? "erro de rede"}. Provavelmente o processo hestia.js não está ativo, ou a porta 4517 está bloqueada.`;
    case "http": {
      const code = details.code ? ` (${details.code})` : "";
      return `A Chama Local respondeu com HTTP ${details.httpStatus}${code}. ${details.detail ?? "Sem mensagem adicional."} ${details.hint ?? ""}`.trim();
    }
  }
}

export function UnavailableNote({
  message,
  details,
}: {
  message?: string;
  details?: ApiErrorDetails;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-glass)] p-4 text-[13px] text-[color:var(--kaline-muted)]">
      <p className="kaline-eyebrow text-[color:var(--kaline-amber)]">{HESTIA.waiting}</p>
      <p className="mt-2">{message ?? "API local indisponível"}</p>
      <p className="mt-1 text-[color:var(--kaline-faint)] text-[12px]">
        Sem leitura real ainda · Nenhuma métrica será inventada
      </p>
      {details && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[color:var(--kaline-copper)] hover:text-[color:var(--kaline-amber)] transition"
        >
          Ver detalhes →
        </button>
      )}
      {open && details && (
        <ErrorModal message={message} details={details} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function ErrorModal({
  message,
  details,
  onClose,
}: {
  message?: string;
  details: ApiErrorDetails;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhes do erro"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-xl w-full max-h-[85vh] overflow-auto rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-6 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="kaline-eyebrow text-[color:var(--kaline-amber)]">
              {ORIGIN_LABEL[details.origin]}
            </p>
            <h3 className="kaline-serif text-2xl text-[color:var(--kaline-text)] mt-1">
              Detalhes do erro
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-copper)] text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        <section className="mt-5 space-y-2">
          <p className="kaline-eyebrow">Resumo</p>
          <p className="text-[13.5px] text-[color:var(--kaline-muted)] leading-relaxed">
            {humanSummary(details)}
          </p>
        </section>

        <section className="mt-5 space-y-2">
          <p className="kaline-eyebrow">Mensagem</p>
          <p className="font-mono text-[12.5px] text-[color:var(--kaline-text)] break-all">
            {message ?? "—"}
          </p>
        </section>

        <section className="mt-5">
          <p className="kaline-eyebrow mb-2">Campos estruturados</p>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 gap-x-3 font-mono text-[12.5px]">
            <Field label="origem" value={details.origin} />
            <Field label="rota" value={details.route} />
            <Field label="http" value={details.httpStatus?.toString()} />
            <Field label="code" value={details.code} />
            <Field label="detail" value={details.detail} />
            <Field label="hint" value={details.hint} />
            <Field
              label="timeout"
              value={details.timeoutMs != null ? `${details.timeoutMs}ms` : undefined}
            />
          </dl>
        </section>

        {details.rawBody && (
          <section className="mt-5">
            <p className="kaline-eyebrow mb-2">Corpo bruto</p>
            <pre className="max-h-40 overflow-auto rounded border border-[color:var(--kaline-border-copper)]/60 bg-[color:var(--kaline-obsidian)]/70 p-3 text-[11.5px] text-[color:var(--kaline-muted)] whitespace-pre-wrap break-all">
              {details.rawBody}
            </pre>
          </section>
        )}

        <footer className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(JSON.stringify({ message, ...details }, null, 2))
                .catch(() => {});
            }}
            className="text-[11px] uppercase tracking-[0.22em] px-3 py-1.5 rounded border border-[color:var(--kaline-border-copper)] text-[color:var(--kaline-muted)] hover:text-[color:var(--kaline-copper)]"
          >
            copiar json
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-[0.22em] px-3 py-1.5 rounded border border-[color:var(--kaline-copper)] text-[color:var(--kaline-copper)] hover:bg-[color:var(--kaline-copper)]/10"
          >
            fechar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt className="text-[color:var(--kaline-faint)] text-[10.5px] uppercase tracking-[0.22em] pt-0.5">
        {label}
      </dt>
      <dd className="text-[color:var(--kaline-text)] break-all">{value || "—"}</dd>
    </>
  );
}

export function DataCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 flex flex-col gap-3">
      {eyebrow && <p className="kaline-eyebrow">{eyebrow}</p>}
      <h3 className="kaline-serif text-xl text-[color:var(--kaline-text)]">{title}</h3>
      <div className="text-[13.5px] text-[color:var(--kaline-muted)] flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[color:var(--kaline-border-copper)]/40 pb-1.5 last:border-0 last:pb-0">
      <span className="text-[color:var(--kaline-faint)] text-[11px] uppercase tracking-[0.22em]">
        {k}
      </span>
      <span className="text-right font-mono text-[12.5px] text-[color:var(--kaline-text)] break-all">
        {v}
      </span>
    </div>
  );
}
