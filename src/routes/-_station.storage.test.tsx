import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoragePage } from "./_station.storage";
import { hestiaApi } from "@/lib/hestia/api";

vi.mock("@/lib/hestia/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hestia/api")>();
  return {
    ...actual,
    hestiaApi: {
      ...actual.hestiaApi,
      storageModel: vi.fn(),
      storageScan: vi.fn(),
      services: vi.fn(),
      organizerRuns: vi.fn(),
      organizerPlan: vi.fn(),
      organizerApply: vi.fn(),
      organizerUndo: vi.fn(),
      organizerRedo: vi.fn(),
    },
  };
});

function ok<T>(data: T) {
  return { status: "ok" as const, data, fetchedAt: new Date().toISOString() };
}

function emptyModel() {
  return ok({ root: "/KALINE", folders: [] });
}
function emptyScan() {
  return ok({
    kaline: { root: "/KALINE", folders: [], generatedAt: "" },
    sources: { items: [], generatedAt: "" },
  });
}
function emptyServices() {
  return ok({ items: [] });
}
function emptyRuns() {
  return ok({ items: [] });
}

describe("StoragePage", () => {
  beforeEach(() => {
    vi.mocked(hestiaApi.storageModel).mockResolvedValue(emptyModel());
    vi.mocked(hestiaApi.storageScan).mockResolvedValue(emptyScan());
    vi.mocked(hestiaApi.services).mockResolvedValue(emptyServices());
    vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(emptyRuns());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza o cabeçalho e as garantias de segurança", async () => {
    render(<StoragePage />);
    expect(screen.getByText("Storage e Organizer")).toBeTruthy();
    expect(screen.getByText(/Nada é apagado/)).toBeTruthy();
    await waitFor(() => expect(hestiaApi.storageModel).toHaveBeenCalled());
  });

  it("não gera plano automaticamente ao montar (só sob clique explícito)", async () => {
    render(<StoragePage />);
    await waitFor(() => expect(hestiaApi.storageModel).toHaveBeenCalled());
    expect(hestiaApi.organizerPlan).not.toHaveBeenCalled();
  });

  it("expande um card colapsado (Modelo) e mostra o conteúdo", async () => {
    vi.mocked(hestiaApi.storageModel).mockResolvedValue(
      ok({
        root: "/KALINE",
        folders: [
          {
            id: "entrada",
            label: "Entrada",
            relativePath: "entrada",
            absolutePath: "/KALINE/entrada",
            category: "entrada",
            purpose: "Arquivos recebidos via Syncthing.",
            required: true,
            serviceHints: ["syncthing"],
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<StoragePage />);
    await waitFor(() => expect(screen.getByText("Árvore canônica /KALINE")).toBeTruthy());

    await user.click(screen.getByText("Árvore canônica /KALINE"));
    expect(await screen.findByText("Arquivos recebidos via Syncthing.")).toBeTruthy();
  });

  it("gera plano sob clique e mostra os itens", async () => {
    vi.mocked(hestiaApi.organizerPlan).mockResolvedValue(
      ok({
        planId: "plan_1_deadbeef",
        generatedAt: "",
        items: [
          {
            id: "i1",
            sourcePath: "/tmp/entrada/livro.pdf",
            targetPath: "/KALINE/codice/pdf/livro.pdf",
            action: "move" as const,
            reason: ".pdf → codice/pdf",
            risk: "low" as const,
            status: "planned" as const,
          },
        ],
        summary: { total: 1, planned: 1, conflicts: 0 },
      }),
    );
    const user = userEvent.setup();
    render(<StoragePage />);

    await user.click(screen.getByRole("button", { name: "Gerar plano" }));

    expect(await screen.findByText(/livro\.pdf/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar plano localmente" })).toBeTruthy();
    expect(hestiaApi.organizerPlan).toHaveBeenCalledTimes(1);
  });

  it("mostra erro de plano quando a API fica indisponível", async () => {
    vi.mocked(hestiaApi.organizerPlan).mockResolvedValue({
      status: "unavailable",
      message: "Chama Local não respondeu",
      fetchedAt: "",
      details: { origin: "network" },
    });
    const user = userEvent.setup();
    render(<StoragePage />);

    await user.click(screen.getByRole("button", { name: "Gerar plano" }));

    expect(await screen.findByText("Chama Local não respondeu")).toBeTruthy();
  });

  it("aplica o plano gerado e mostra o resultado", async () => {
    vi.mocked(hestiaApi.organizerPlan).mockResolvedValue(
      ok({
        planId: "plan_1_deadbeef",
        generatedAt: "",
        items: [
          {
            id: "i1",
            sourcePath: "/tmp/x.pdf",
            targetPath: "/KALINE/codice/pdf/x.pdf",
            action: "move" as const,
            reason: ".pdf → codice/pdf",
            risk: "low" as const,
            status: "planned" as const,
          },
        ],
        summary: { total: 1, planned: 1, conflicts: 0 },
      }),
    );
    vi.mocked(hestiaApi.organizerApply).mockResolvedValue(
      ok({
        runId: "org_1_deadbeef",
        planId: "plan_1_deadbeef",
        createdAt: "",
        status: "applied" as const,
        mode: "local-only",
        operations: [],
        summary: { total: 1, ok: 1, failed: 0, skipped: 0 },
      }),
    );

    const user = userEvent.setup();
    render(<StoragePage />);
    await user.click(screen.getByRole("button", { name: "Gerar plano" }));
    await screen.findByRole("button", { name: "Aplicar plano localmente" });

    await user.click(screen.getByRole("button", { name: "Aplicar plano localmente" }));

    expect(hestiaApi.organizerApply).toHaveBeenCalledWith("plan_1_deadbeef");
    expect(await screen.findByText(/applied/)).toBeTruthy();
    // O plano some da tela depois de aplicado.
    expect(screen.queryByRole("button", { name: "Aplicar plano localmente" })).toBeNull();
  });

  describe("Execuções anteriores: Desfazer/Refazer conforme o estado", () => {
    it("mostra 'Desfazer' só numa execução original ainda não desfeita", async () => {
      vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(
        ok({
          items: [
            {
              runId: "org_1",
              status: "applied",
              undoOf: null,
              undoneBy: null,
              redoOf: null,
              redoneBy: null,
            },
          ],
        }),
      );
      render(<StoragePage />);
      expect(await screen.findByRole("button", { name: "Desfazer" })).toBeTruthy();
    });

    it("não mostra nenhum botão numa execução original já desfeita", async () => {
      vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(
        ok({
          items: [
            {
              runId: "org_1",
              status: "applied",
              undoOf: null,
              undoneBy: "undo_1",
              redoOf: null,
              redoneBy: null,
            },
          ],
        }),
      );
      render(<StoragePage />);
      await screen.findByText("org_1");
      expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
      expect(screen.getByText("já desfeita")).toBeTruthy();
    });

    it("mostra 'Refazer' numa execução de undo ainda não refeita", async () => {
      vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(
        ok({
          items: [
            {
              runId: "undo_1",
              status: "applied",
              undoOf: "org_1",
              undoneBy: null,
              redoOf: null,
              redoneBy: null,
            },
          ],
        }),
      );
      render(<StoragePage />);
      expect(await screen.findByRole("button", { name: "Refazer" })).toBeTruthy();
    });

    it("não mostra nenhum botão numa execução de redo (terminal)", async () => {
      vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(
        ok({
          items: [
            {
              runId: "redo_1",
              status: "applied",
              undoOf: null,
              undoneBy: null,
              redoOf: "undo_1",
              redoneBy: null,
            },
          ],
        }),
      );
      render(<StoragePage />);
      await screen.findByText("redo_1");
      expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Refazer" })).toBeNull();
    });

    it("clicar em Desfazer chama organizerUndo e recarrega a lista", async () => {
      vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(
        ok({
          items: [
            {
              runId: "org_1",
              status: "applied",
              undoOf: null,
              undoneBy: null,
              redoOf: null,
              redoneBy: null,
            },
          ],
        }),
      );
      vi.mocked(hestiaApi.organizerUndo).mockResolvedValue(
        ok({
          runId: "undo_1",
          undoOf: "org_1",
          createdAt: "",
          status: "applied" as const,
          mode: "local-only-undo",
          operations: [],
          summary: { total: 0, ok: 0, failed: 0, skipped: 0 },
        }),
      );

      const user = userEvent.setup();
      render(<StoragePage />);
      await user.click(await screen.findByRole("button", { name: "Desfazer" }));

      expect(hestiaApi.organizerUndo).toHaveBeenCalledWith("org_1");
      await waitFor(() => expect(hestiaApi.organizerRuns).toHaveBeenCalledTimes(2));
    });

    it("clicar em Refazer chama organizerRedo e recarrega a lista", async () => {
      vi.mocked(hestiaApi.organizerRuns).mockResolvedValue(
        ok({
          items: [
            {
              runId: "undo_1",
              status: "applied",
              undoOf: "org_1",
              undoneBy: null,
              redoOf: null,
              redoneBy: null,
            },
          ],
        }),
      );
      vi.mocked(hestiaApi.organizerRedo).mockResolvedValue(
        ok({
          runId: "redo_1",
          redoOf: "undo_1",
          createdAt: "",
          status: "applied" as const,
          mode: "local-only-redo",
          operations: [],
          summary: { total: 0, ok: 0, failed: 0, skipped: 0 },
        }),
      );

      const user = userEvent.setup();
      render(<StoragePage />);
      await user.click(await screen.findByRole("button", { name: "Refazer" }));

      expect(hestiaApi.organizerRedo).toHaveBeenCalledWith("undo_1");
      await waitFor(() => expect(hestiaApi.organizerRuns).toHaveBeenCalledTimes(2));
    });
  });
});
