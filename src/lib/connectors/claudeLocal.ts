import { homeDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { z } from "zod";
import { humanizeBucketKey } from "@/lib/connectors/normalize";
import { registerConnector } from "@/lib/connectors/registry";
import {
  ConnectorError,
  type Connector,
  type ConnectorContext,
  type FetchResult,
  type NormalizedBucket,
  type WindowKind,
} from "@/lib/connectors/types";

export const CLAUDE_CODE_UA = "claude-code/2.1.90";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

const oauthFieldsSchema = z
  .object({
    accessToken: z.string().optional(),
    expiresAt: z.number().optional(),
    subscriptionType: z.string().optional(),
    rateLimitTier: z.string().optional(),
  })
  .passthrough();

const credsFileSchema = z
  .object({
    claudeAiOauth: oauthFieldsSchema.optional(),
    accessToken: z.string().optional(),
    expiresAt: z.number().optional(),
    subscriptionType: z.string().optional(),
    rateLimitTier: z.string().optional(),
  })
  .passthrough();

export type ClaudeCreds = {
  accessToken: string;
  expiresAt?: number;
  subscriptionType?: string;
  rateLimitTier?: string;
};

export function resolveClaudeCreds(
  raw: unknown,
): ClaudeCreds | null {
  const parsed = credsFileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const nested = parsed.data.claudeAiOauth;
  const accessToken = nested?.accessToken ?? parsed.data.accessToken;
  if (!accessToken) return null;
  return {
    accessToken,
    expiresAt: nested?.expiresAt ?? parsed.data.expiresAt,
    subscriptionType:
      nested?.subscriptionType ?? parsed.data.subscriptionType,
    rateLimitTier: nested?.rateLimitTier ?? parsed.data.rateLimitTier,
  };
}

export function tierFromCreds(creds: {
  rateLimitTier?: string;
  subscriptionType?: string;
}): string | undefined {
  const tier = creds.rateLimitTier;
  if (tier === "default_claude_max_20x") return "Max (20x)";
  if (tier === "default_claude_max_5x") return "Max (5x)";
  if (tier?.includes("20x")) return "Max (20x)";
  if (tier?.includes("5x")) return "Max (5x)";
  const sub = creds.subscriptionType;
  if (!sub) return undefined;
  return sub.charAt(0).toUpperCase() + sub.slice(1);
}

function windowKindForKey(key: string): WindowKind {
  if (key === "five_hour") return "rolling_5h";
  if (key.startsWith("seven_day")) return "weekly";
  if (key === "extra_usage") return "monthly";
  return "custom";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const bucketEntrySchema = z
  .object({
    utilization: z.number().optional(),
    resets_at: z.string().nullable().optional(),
  })
  .passthrough();

const limitsEntrySchema = z
  .object({
    kind: z.string(),
    group: z.string().optional(),
    percent: z.number().optional(),
    resets_at: z.string().nullable().optional(),
    scope: z
      .object({
        model: z
          .object({ display_name: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const usageResponseSchema = z
  .object({
    limits: z.array(limitsEntrySchema).optional(),
    extra_usage: z
      .object({
        is_enabled: z.boolean().optional(),
        monthly_limit: z.number().nullable().optional(),
        used_credits: z.number().nullable().optional(),
        utilization: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** Pure parser for Claude oauth usage JSON (both known shapes). */
export function parseClaudeUsage(raw: unknown): NormalizedBucket[] {
  const parsed = usageResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConnectorError("Claude usage JSON shape mismatch", "parse");
  }
  const data = parsed.data;
  const out: NormalizedBucket[] = [];

  if (Array.isArray(data.limits) && data.limits.length > 0) {
    for (const entry of data.limits) {
      const displayName = entry.scope?.model?.display_name;
      const key =
        displayName && entry.kind === "seven_day"
          ? `seven_day_${slugify(displayName)}`
          : entry.kind === "seven_day" && entry.group === "all_models"
            ? "seven_day"
            : entry.kind;
      const percent = entry.percent;
      if (percent === undefined) continue;
      const label = displayName
        ? `Weekly - ${displayName}`
        : humanizeBucketKey(key);
      out.push({
        key,
        label,
        windowKind: windowKindForKey(entry.kind),
        percent,
        resetsAt: entry.resets_at ?? undefined,
        source: "unofficial",
      });
    }
  } else {
    for (const [key, value] of Object.entries(data)) {
      if (key === "limits" || key === "extra_usage") continue;
      if (value === null || value === undefined) continue;
      if (typeof value !== "object") continue;
      const entry = bucketEntrySchema.safeParse(value);
      if (!entry.success) continue;
      if (entry.data.utilization === undefined) continue;
      // Only known bucket key patterns
      if (key !== "five_hour" && !key.startsWith("seven_day")) continue;
      out.push({
        key,
        label: humanizeBucketKey(key),
        windowKind: windowKindForKey(key),
        percent: entry.data.utilization,
        resetsAt: entry.data.resets_at ?? undefined,
        source: "unofficial",
      });
    }
  }

  const extra = data.extra_usage;
  if (extra?.is_enabled) {
    out.push({
      key: "extra_usage",
      label: "Extra usage",
      windowKind: "monthly",
      percent: extra.utilization ?? 0,
      used: extra.used_credits ?? undefined,
      limit: extra.monthly_limit ?? undefined,
      unit: "usd",
      source: "unofficial",
    });
  }

  return out;
}

async function credentialsPath(): Promise<string> {
  const home = await homeDir();
  return join(home, ".claude", ".credentials.json");
}

async function loadCreds(): Promise<ClaudeCreds> {
  const path = await credentialsPath();
  const present = await exists(path);
  if (!present) {
    throw new ConnectorError(
      "Claude Code not found on this machine - install/log in, or switch this plan to Manual",
      "auth",
    );
  }
  let text: string;
  try {
    text = await readTextFile(path);
  } catch {
    throw new ConnectorError(
      "Claude Code not found on this machine - install/log in, or switch this plan to Manual",
      "auth",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConnectorError("Claude credentials JSON parse failed", "parse");
  }
  const creds = resolveClaudeCreds(json);
  if (!creds) {
    throw new ConnectorError(
      "Claude Code credentials missing accessToken",
      "auth",
    );
  }
  return creds;
}

function mapHttpError(status: number): never {
  if (status === 401) {
    throw new ConnectorError(
      "Claude token expired - open Claude Code once, it refreshes credentials automatically, then Retry",
      "auth",
    );
  }
  if (status === 403) {
    throw new ConnectorError(
      "Token lacks user:profile scope - log into Claude Code interactively, not via setup-token",
      "auth",
    );
  }
  if (status === 429) {
    throw new ConnectorError("Rate limited - backing off", "other");
  }
  throw new ConnectorError(`Claude usage HTTP ${status}`, "other");
}

async function fetchUsageJson(
  ctx: ConnectorContext,
  accessToken: string,
): Promise<unknown> {
  const ua =
    typeof ctx.config.userAgent === "string"
      ? ctx.config.userAgent
      : CLAUDE_CODE_UA;
  let res: Response;
  try {
    res = await ctx.fetch(USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": ua,
      },
    });
  } catch (err) {
    throw new ConnectorError(
      err instanceof Error ? err.message : "Claude network error",
      "network",
    );
  }
  if (!res.ok) mapHttpError(res.status);
  try {
    return await res.json();
  } catch {
    throw new ConnectorError("Claude usage JSON shape mismatch", "parse");
  }
}

export const claudeLocalConnector: Connector = {
  id: "claude_local",
  displayName: "Claude Code (local credentials)",
  setupFields: [],
  async probe(_ctx) {
    const path = await credentialsPath();
    const present = await exists(path);
    if (!present) {
      return {
        ok: false,
        message:
          "Claude Code not found on this machine - install/log in, or switch this plan to Manual",
      };
    }
    try {
      const creds = await loadCreds();
      const now = Date.now();
      if (creds.expiresAt && creds.expiresAt < now) {
        return {
          ok: true,
          message:
            "Found Claude Code credentials (token expired - Claude Code refreshes on next use)",
        };
      }
      return {
        ok: true,
        message: "Found Claude Code credentials (token valid)",
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
  async fetchUsage(ctx): Promise<FetchResult> {
    const creds = await loadCreds();
    const json = await fetchUsageJson(ctx, creds.accessToken);
    const buckets = parseClaudeUsage(json);
    return {
      buckets,
      tierLabel: tierFromCreds(creds),
      fetchedAt: new Date().toISOString(),
    };
  },
};

registerConnector(claudeLocalConnector);
