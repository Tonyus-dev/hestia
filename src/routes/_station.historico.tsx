import { createFileRoute } from "@tanstack/react-router";
import { LogsPage } from "./_station.logs";
export const Route = createFileRoute("/_station/historico")({ component: LogsPage });
