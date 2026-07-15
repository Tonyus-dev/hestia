import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoragePage } from "./_station.storage";
import { OrganizarPage } from "./_station.organizar";
import { hestiaApi, hestiaLegacyApi as storageApi } from "@/lib/hestia/api";
import type { OrganizerPlan } from "@/lib/hestia/api";

vi.mock("@/lib/hestia/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hestia/api")>();
  return {
    ...actual,
    hestiaLegacyApi: {
      ...actual.hestiaLegacyApi,
      storageModel: vi.fn(),
      storageScan: vi.fn(),
    },
    hestiaApi: {
      ...actual.hestiaApi,
      stationConnection: vi.fn(),
      stationOrganizerRuns: vi.fn(),
      stationOrganizerPlan: vi.fn(),
      stationOrganizerApply: vi.fn(),
      stationOrganizerUndo: vi.fn(),
      stationOrganizerRedo: vi.fn(),
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

function largePlan(planId: string): OrganizerPlan {
  return {
    planId,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    requiresExtraConfirmation: true,
    largePlanThreshold: 5000,
    planned: 5001,
    items: [
      {
        id: `${planId}-item`,
        source: { kind: "entrada", label: "Entrada manual", relativePath: "livro.pdf" },
        target: { relativePath: "codice/pdf/2026/07/livro.pdf" },
        action: "move",
        reason: ".pdf → codice/pdf/2026/07",
        risk: "low",
        status: "planned",
        size: 1,
        mtimeIso: null,
        ignoredReason: null,
      },
    ],
    summary: {
      total: 5001,
      planned: 5001,
      conflicts: 0,
      ignored: 0,
      quarantined: 0,
      byExtension: { ".pdf": 5001 },
      byTargetArea: { "codice/pdf": 5001 },
      rules: { extensionRules: [], fallback: "entrada/revisar" },
    },
  };
}

describe("StoragePage", () => {
  beforeEach(() => {
    vi.mocked(storageApi.storageModel).mockResolvedValue(emptyModel());
    vi.mocked(storageApi.storageScan).mockResolvedValue(emptyScan());
    vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(emptyRuns());
    vi.mocked(hestiaApi.stationConnection).mockResolvedValue(
      ok({
        ok: true,
        configured: true,
        state: "available",
        checkedAt: new Date().toISOString(),
        latencyMs: 1,
        station: { service: "hestia-station-agent", schemaVersion: 1, version: "test" },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza o cabeçalho do Storage", async () => {
    render(<StoragePage />);
    expect(screen.getByText("Storage da Héstia Console")).toBeTruthy();
    await waitFor(() => expect(storageApi.storageModel).toHaveBeenCalled());
  });

  it("expande um card colapsado (Modelo) e mostra o conteúdo", async () => {
    vi.mocked(storageApi.storageModel).mockResolvedValue(
      ok({
        root: "/KALINE",
        folders: [
          {
            id: "entrada",
            label: "Entrada",
            relativePath: "entrada",
            absolutePath: "/KALINE/entrada",
            category: "entrada",
            purpose: "Raiz das caixas de chegada da Ash.",
            required: true,
            serviceHints: ["samba"],
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<StoragePage />);
    await waitFor(() => expect(screen.getByText("Árvore canônica /KALINE")).toBeTruthy());

    await user.click(screen.getByText("Árvore canônica /KALINE"));
    expect(await screen.findByText("Raiz das caixas de chegada da Ash.")).toBeTruthy();
  });
});

describe("OrganizarPage", () => {
  beforeEach(() => {
    vi.mocked(storageApi.storageModel).mockResolvedValue(emptyModel());
    vi.mocked(storageApi.storageScan).mockResolvedValue(emptyScan());
    vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(emptyRuns());
    vi.mocked(hestiaApi.stationConnection).mockResolvedValue(
      ok({
        ok: true,
        configured: true,
        state: "available",
        checkedAt: new Date().toISOString(),
        latencyMs: 1,
        station: { service: "hestia-station-agent", schemaVersion: 1, version: "test" },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza o cabeçalho e as garantias de segurança", async () => {
    render(<OrganizarPage />);
    expect(screen.getByText("Organizar por plano aprovado")).toBeTruthy();
    expect(screen.getByText(/Nenhum arquivo é alterado/)).toBeTruthy();
  });

  it("não gera plano automaticamente ao montar (só sob clique explícito)", async () => {
    render(<OrganizarPage />);
    expect(hestiaApi.stationOrganizerPlan).not.toHaveBeenCalled();
  });

  it("recupera a Estação e libera a geração após retry conjunto", async () => {
    vi.mocked(hestiaApi.stationConnection)
      .mockResolvedValueOnce({
        status: "unavailable",
        message: "Station indisponível agora",
        fetchedAt: new Date().toISOString(),
        details: { origin: "network" },
      })
      .mockResolvedValue(
        ok({
          ok: true,
          configured: true,
          state: "available",
          checkedAt: new Date().toISOString(),
          latencyMs: 1,
          station: { service: "hestia-station-agent", schemaVersion: 1, version: "test" },
        }),
      );
    const user = userEvent.setup();
    render(<OrganizarPage />);

    expect(await screen.findByText("Station indisponível agora")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Gerar plano" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Verificar Estação" }));

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Gerar plano" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(hestiaApi.stationOrganizerRuns).toHaveBeenCalledTimes(2);
  });

  it("gera plano sob clique e mostra os itens", async () => {
    vi.mocked(hestiaApi.stationOrganizerPlan).mockResolvedValue(
      ok({
        planId: "plan_1_deadbeef",
        generatedAt: "",
        dryRun: true,
        requiresExtraConfirmation: false,
        largePlanThreshold: 5000,
        planned: 1,
        items: [
          {
            id: "i1",
            source: { kind: "entrada" as const, label: "Manual", relativePath: "livro.pdf" },
            target: { relativePath: "codice/pdf/livro.pdf" },
            action: "move" as const,
            reason: ".pdf → codice/pdf",
            risk: "low" as const,
            status: "planned" as const,
            size: 1,
            mtimeIso: null,
            ignoredReason: null,
          },
        ],
        summary: { total: 1, planned: 1, conflicts: 0 },
      }),
    );
    const user = userEvent.setup();
    render(<OrganizarPage />);

    await user.click(screen.getByRole("button", { name: "Gerar plano" }));

    expect(await screen.findByText(/livro\.pdf/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aplicar plano na Estação" })).toBeTruthy();
    expect(hestiaApi.stationOrganizerPlan).toHaveBeenCalledTimes(1);
  });

  it("mostra erro de plano quando a API fica indisponível", async () => {
    vi.mocked(hestiaApi.stationOrganizerPlan).mockResolvedValue({
      status: "unavailable",
      message: "Chama Local não respondeu",
      fetchedAt: "",
      details: { origin: "network" },
    });
    const user = userEvent.setup();
    render(<OrganizarPage />);

    await user.click(screen.getByRole("button", { name: "Gerar plano" }));

    expect(await screen.findByText("Chama Local não respondeu")).toBeTruthy();
  });

  it("aplica o plano gerado e mostra o resultado", async () => {
    vi.mocked(hestiaApi.stationOrganizerPlan).mockResolvedValue(
      ok({
        planId: "plan_1_deadbeef",
        generatedAt: "",
        dryRun: true,
        requiresExtraConfirmation: false,
        largePlanThreshold: 5000,
        planned: 1,
        items: [
          {
            id: "i1",
            source: { kind: "entrada" as const, label: "Manual", relativePath: "x.pdf" },
            target: { relativePath: "codice/pdf/x.pdf" },
            action: "move" as const,
            reason: ".pdf → codice/pdf",
            risk: "low" as const,
            status: "planned" as const,
            size: 1,
            mtimeIso: null,
            ignoredReason: null,
          },
        ],
        summary: { total: 1, planned: 1, conflicts: 0 },
      }),
    );
    vi.mocked(hestiaApi.stationOrganizerApply).mockResolvedValue(
      ok({
        runId: "org_1_deadbeef",
        planId: "plan_1_deadbeef",
        kind: "apply" as const,
        undoOf: null,
        redoOf: null,
        createdAt: "",
        appliedAt: "",
        status: "applied" as const,
        operations: [],
        summary: { total: 1, ok: 1, failed: 0, skipped: 0 },
        undoneBy: null,
        redoneBy: null,
      }),
    );

    const user = userEvent.setup();
    render(<OrganizarPage />);
    await user.click(screen.getByRole("button", { name: "Gerar plano" }));
    await screen.findByRole("button", { name: "Aplicar plano na Estação" });

    await user.click(screen.getByRole("button", { name: "Aplicar plano na Estação" }));

    expect(hestiaApi.stationOrganizerApply).toHaveBeenCalledWith("plan_1_deadbeef", false);
    expect(await screen.findByText(/applied/)).toBeTruthy();
    // O plano some da tela depois de aplicado.
    expect(screen.queryByRole("button", { name: "Aplicar plano na Estação" })).toBeNull();
  });

  it("descarta plano e frase anteriores enquanto regenera um plano grande", async () => {
    type PlanState = ReturnType<typeof ok<OrganizerPlan>>;
    let resolvePlanB = (_value: PlanState) => {};
    const planBPromise = new Promise<PlanState>((resolve) => {
      resolvePlanB = resolve;
    });
    vi.mocked(hestiaApi.stationOrganizerPlan)
      .mockResolvedValueOnce(ok(largePlan("plan_1_aaaaaaaa")))
      .mockReturnValueOnce(planBPromise);
    const user = userEvent.setup();
    render(<OrganizarPage />);

    await user.click(screen.getByRole("button", { name: "Gerar plano" }));
    const phrase = "Estou ciente que este plano afetará 5001 arquivos.";
    const firstInput = await screen.findByRole("textbox", { name: /Confirmação extra/ });
    await user.type(firstInput, phrase);
    expect(
      (screen.getByRole("button", { name: "Aplicar plano na Estação" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Gerar plano" }));
    expect(screen.queryByRole("button", { name: "Aplicar plano na Estação" })).toBeNull();

    resolvePlanB(ok(largePlan("plan_2_bbbbbbbb")));
    const secondInput = await screen.findByRole("textbox", { name: /Confirmação extra/ });
    expect((secondInput as HTMLInputElement).value).toBe("");
    expect(
      (screen.getByRole("button", { name: "Aplicar plano na Estação" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.type(secondInput, phrase);
    expect(
      (screen.getByRole("button", { name: "Aplicar plano na Estação" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  describe("Execuções anteriores: Desfazer/Refazer conforme o estado", () => {
    it("mostra 'Desfazer' só numa execução original ainda não desfeita", async () => {
      vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(
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
      render(<OrganizarPage />);
      expect(await screen.findByRole("button", { name: "Desfazer" })).toBeTruthy();
    });

    it("não mostra nenhum botão numa execução original já desfeita", async () => {
      vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(
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
      render(<OrganizarPage />);
      await screen.findByText("org_1");
      expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
      expect(screen.getByText("já desfeita")).toBeTruthy();
    });

    it("mostra 'Refazer' numa execução de undo ainda não refeita", async () => {
      vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(
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
      render(<OrganizarPage />);
      expect(await screen.findByRole("button", { name: "Refazer" })).toBeTruthy();
    });

    it("não mostra nenhum botão numa execução de redo (terminal)", async () => {
      vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(
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
      render(<OrganizarPage />);
      await screen.findByText("redo_1");
      expect(screen.queryByRole("button", { name: "Desfazer" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Refazer" })).toBeNull();
    });

    it("clicar em Desfazer chama organizerUndo e recarrega a lista", async () => {
      vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(
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
      vi.mocked(hestiaApi.stationOrganizerUndo).mockResolvedValue(
        ok({
          runId: "undo_1",
          planId: "plan_1",
          kind: "undo" as const,
          undoOf: "org_1",
          redoOf: null,
          createdAt: "",
          appliedAt: "",
          status: "applied" as const,
          operations: [],
          summary: { total: 0, ok: 0, failed: 0, skipped: 0 },
          undoneBy: null,
          redoneBy: null,
        }),
      );

      const user = userEvent.setup();
      render(<OrganizarPage />);
      await user.click(await screen.findByRole("button", { name: "Desfazer" }));

      expect(hestiaApi.stationOrganizerUndo).toHaveBeenCalledWith("org_1");
      await waitFor(() => expect(hestiaApi.stationOrganizerRuns).toHaveBeenCalledTimes(2));
    });

    it("clicar em Refazer chama organizerRedo e recarrega a lista", async () => {
      vi.mocked(hestiaApi.stationOrganizerRuns).mockResolvedValue(
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
      vi.mocked(hestiaApi.stationOrganizerRedo).mockResolvedValue(
        ok({
          runId: "redo_1",
          planId: "plan_1",
          kind: "redo" as const,
          undoOf: null,
          redoOf: "undo_1",
          createdAt: "",
          appliedAt: "",
          status: "applied" as const,
          operations: [],
          summary: { total: 0, ok: 0, failed: 0, skipped: 0 },
          undoneBy: null,
          redoneBy: null,
        }),
      );

      const user = userEvent.setup();
      render(<OrganizarPage />);
      await user.click(await screen.findByRole("button", { name: "Refazer" }));

      expect(hestiaApi.stationOrganizerRedo).toHaveBeenCalledWith("undo_1");
      await waitFor(() => expect(hestiaApi.stationOrganizerRuns).toHaveBeenCalledTimes(2));
    });
  });
});
