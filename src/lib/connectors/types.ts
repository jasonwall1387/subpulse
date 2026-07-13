// src/lib/connectors/types.ts - normative interfaces from plan section 9

export type WindowKind =
  | "rolling_5h"
  | "daily"
  | "weekly"
  | "monthly"
  | "plan_period"
  | "custom";
export type BucketSource = "manual" | "api" | "unofficial" | "local";
export type BucketUnit = "requests" | "tokens" | "usd" | "percent";

export interface NormalizedBucket {
  key: string; // stable per plan, e.g. 'five_hour'
  label: string; // '5-hour limit'
  windowKind: WindowKind;
  percent: number; // 0..100, always present after normalization
  used?: number;
  limit?: number;
  unit?: BucketUnit;
  resetsAt?: string; // ISO 8601
  source: BucketSource;
}

export interface FetchResult {
  buckets: NormalizedBucket[];
  tierLabel?: string; // e.g. 'Max (20x)' when the provider reports it
  fetchedAt: string; // ISO 8601
}

export interface SetupField {
  key: string; // 'cookie'
  label: string; // 'WorkosCursorSessionToken cookie'
  secret: boolean; // true -> stored via keyring, shown masked
  help: string; // one-paragraph how-to shown in the setup dialog
}

export type ConnectorErrorKind = "auth" | "network" | "parse" | "other";
export class ConnectorError extends Error {
  constructor(
    message: string,
    public kind: ConnectorErrorKind,
  ) {
    super(message);
  }
}

export interface ConnectorContext {
  config: Record<string, unknown>; // parsed connector_config (non-secret)
  getSecret(ref: string): Promise<string | null>; // keyring lookup
  fetch: typeof fetch; // tauri http plugin fetch
}

export interface Connector {
  id: string; // matches usage_plans.connector
  displayName: string;
  setupFields: SetupField[]; // empty for zero-config connectors
  probe(ctx: ConnectorContext): Promise<{ ok: boolean; message: string }>;
  fetchUsage(ctx: ConnectorContext): Promise<FetchResult>; // throws ConnectorError
}
