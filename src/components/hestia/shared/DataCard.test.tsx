import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DataCard } from "./DataCard";

describe("DataCard", () => {
  afterEach(() => cleanup());
  it.each(["unavailable", "critical"])("does not crash with external status %s", (status) => {
    render(
      <DataCard title="Serviço" status={status}>
        <span>conteúdo real</span>
      </DataCard>,
    );

    expect(screen.getByRole("button", { name: /serviço/i })).toBeTruthy();
    expect(screen.getByLabelText("status: informativo")).toBeTruthy();
  });
});
