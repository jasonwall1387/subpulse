import type { Connector } from "@/lib/connectors/types";

/** Populated by connector modules (claude_local, cursor_cookie, …). Manual is never registered. */
export const connectors: Record<string, Connector> = {};

export function registerConnector(connector: Connector): void {
  connectors[connector.id] = connector;
}
