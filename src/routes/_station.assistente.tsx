import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { hestiaApi } from "@/lib/hestia/api";
import { useApi } from "@/lib/hestia/useApi";
import { UnavailableNote } from "@/components/hestia/shared/UnavailableNote";

export const Route = createFileRoute("/_station/assistente")({
  head: () => ({
    meta: [
      { title: "Héstia Console — Assistente LLM" },
      { name: "description", content: "Chat de testes com modelos locais do Ollama." },
      { property: "og:title", content: "Héstia Console — Assistente LLM" },
      { property: "og:description", content: "Escolha e teste os modelos locais de linguagem." },
    ],
  }),
  component: AssistentePage,
});

type Message = {
  role: "user" | "assistant";
  content: string;
};

function AssistentePage() {
  const { state: llmState, retry, refreshing } = useApi(hestiaApi.llmHealth);

  const [selectedModel, setSelectedModel] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Define o modelo padrão após carregar a saúde da LLM
  useEffect(() => {
    if (llmState.status === "ok") {
      setSelectedModel(llmState.data.defaultModel || llmState.data.availableModels[0] || "");
    }
  }, [llmState]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || loading || !selectedModel) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    setError(null);

    const result = await hestiaApi.llmChat(userMsg, selectedModel);
    setLoading(false);

    if (result.status === "ok" && result.data.ok) {
      setMessages((prev) => [...prev, { role: "assistant", content: result.data.text }]);
    } else {
      setError(
        result.status === "unavailable" ? result.message : "Erro ao obter resposta do modelo.",
      );
    }
  }

  function handleClear() {
    setMessages([]);
    setError(null);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="kaline-eyebrow">/assistente</p>
        <h1 className="kaline-serif text-3xl md:text-4xl text-[color:var(--kaline-text)]">
          Assistente LLM Local
        </h1>
        <p className="text-[13px] text-[color:var(--kaline-muted)] max-w-2xl">
          Consulte e teste os modelos locais ativos no Ollama que foram configurados para auxiliar a
          Héstia.
        </p>
      </header>

      {llmState.status === "loading" && (
        <p className="text-[color:var(--kaline-muted)]">consultando Ollama…</p>
      )}

      {llmState.status === "unavailable" && (
        <UnavailableNote
          message={llmState.message}
          details={llmState.details}
          onRetry={retry}
          refreshing={refreshing}
        />
      )}

      {llmState.status === "ok" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sidebar de Modelos */}
          <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 space-y-5 lg:col-span-1">
            <h2 className="kaline-eyebrow">Modelos Ativos no Ollama</h2>

            <div className="space-y-3">
              {llmState.data.availableModels.length === 0 ? (
                <div className="text-[12px] text-[color:var(--kaline-ember)]">
                  Nenhum modelo instalado no Ollama está permitido pela Héstia. O envio permanece
                  desativado.
                </div>
              ) : (
                llmState.data.availableModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => setSelectedModel(model)}
                    className={`w-full text-left p-3 rounded border text-[12px] transition ${
                      selectedModel === model
                        ? "border-[color:var(--kaline-copper)] bg-[color:var(--kaline-copper)]/10 text-[color:var(--kaline-text)]"
                        : "border-[color:var(--kaline-border-copper)]/40 hover:bg-white/[0.02] text-[color:var(--kaline-muted)]"
                    }`}
                  >
                    <div className="font-mono font-medium">{model}</div>
                    <div className="text-[10px] text-[color:var(--kaline-faint)] mt-1">
                      {model === llmState.data.defaultModel
                        ? "Padrão do Sistema"
                        : "Modelo Auxiliar"}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-[color:var(--kaline-border-copper)]/40 pt-4 space-y-2">
              <p className="text-[11px] text-[color:var(--kaline-faint)]">
                <strong>Runtime:</strong> {llmState.data.runtime}
              </p>
              <p className="text-[11px] text-[color:var(--kaline-faint)]">
                <strong>Última checagem:</strong>{" "}
                {new Date(llmState.data.checkedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Area do Chat */}
          <div className="rounded-xl border border-[color:var(--kaline-border-copper)] bg-[color:var(--kaline-surface)] p-5 flex flex-col min-h-[500px] lg:col-span-2">
            <div className="flex justify-between items-center border-b border-[color:var(--kaline-border-copper)]/40 pb-3 mb-4">
              <div>
                <h2 className="kaline-eyebrow">Sandbox de Teste</h2>
                <p className="text-[10px] text-[color:var(--kaline-muted)] mt-0.5">
                  Modelo selecionado:{" "}
                  <span className="font-mono text-[color:var(--kaline-copper)]">
                    {selectedModel}
                  </span>
                </p>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  className="text-[10px] uppercase tracking-wider text-[color:var(--kaline-ember)] hover:opacity-80 transition"
                >
                  Limpar histórico
                </button>
              )}
            </div>

            {/* Balões de Mensagem */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 max-h-[350px] min-h-[250px] mb-4 scrollbar-thin">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <p className="serif text-[15px] text-[color:var(--kaline-muted)]">
                    Envie uma mensagem para testar o modelo localmente.
                  </p>
                  <p className="text-[11px] text-[color:var(--kaline-faint)] mt-1">
                    Ideal para perguntas gerais ou simulações rápidas.
                  </p>
                </div>
              )}

              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg p-3 text-[13px] leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[color:var(--kaline-copper)]/15 border border-[color:var(--kaline-copper)]/40 text-[color:var(--kaline-text)]"
                        : "bg-white/[0.03] border border-white/[0.08] text-[color:var(--kaline-text)]"
                    }`}
                  >
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--kaline-faint)] mb-1">
                      {msg.role === "user" ? "Você" : selectedModel}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-start">
                  <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 text-[13px] text-[color:var(--kaline-muted)]">
                    <span className="animate-pulse">Pensando…</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded bg-[color:var(--kaline-ember)]/10 border border-[color:var(--kaline-ember)]/40 text-[12px] text-[color:var(--kaline-ember)]">
                  {error}
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={handleSend}
              className="mt-auto flex gap-2 pt-3 border-t border-[color:var(--kaline-border-copper)]/20"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  loading ? "Aguardando resposta..." : "Digite sua mensagem para o modelo..."
                }
                disabled={loading || llmState.data.availableModels.length === 0}
                className="flex-1 rounded border border-[color:var(--kaline-border-copper)] bg-transparent px-3 py-2 text-[12px] text-[color:var(--kaline-text)] placeholder-[color:var(--kaline-faint)] focus:outline-none focus:border-[color:var(--kaline-copper)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !chatInput.trim() || !selectedModel}
                className="px-4 py-2 rounded bg-[color:var(--kaline-copper)] text-[color:var(--kaline-surface)] text-[11px] uppercase tracking-wider font-semibold hover:opacity-90 transition disabled:opacity-40"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
