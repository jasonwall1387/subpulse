import { z } from "zod";
import { registerConnector } from "@/lib/connectors/registry";
import {
  ConnectorError,
  type Connector,
  type ConnectorContext,
  type FetchResult,
  type NormalizedBucket,
} from "@/lib/connectors/types";

/** Current Chrome desktop UA - Cursor 403s non-browser-looking requests. */
export const CURSOR_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HELP =
  "Log into cursor.com/dashboard in your browser. DevTools (F12) > Application > Cookies > https://cursor.com > copy the value of WorkosCursorSessionToken (looks like 123456%3A%3AeyJ...). Paste it here. It lives for weeks; when it dies this card shows 'auth needed' and you re-paste.";

const planUsageSchema = z
  .object({
    enabled: z.boolean().optional(),
    used: z.number().optional(),
    limit: z.number().optional(),
    remaining: z.number().optional(),
    totalPercentUsed: z.number().optional(),
  })
  .passthrough();

const onDemandSchema = z
  .object({
    used: z.number().optional(),
    limit: z.number().optional(),
    remaining: z.number().optional(),
  })
  .passthrough();

const summarySchema = z
  .object({
    billingCycleStart: z.string().optional(),
    billingCycleEnd: z.string().optional(),
    membershipType: z.string().optional(),
    isUnlimited: z.boolean().optional(),
    individualUsage: z
      .object({
        plan: planUsageSchema.optional(),
        onDemand: onDemandSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function centsToDollars(cents: number): number {
  return cents / 100;
}

function membershipLabel(type: string | undefined): string | undefined {
  if (!type) return undefined;
  if (type === "pro") return "Pro";
  if (type === "pro_plus") return "Pro+";
  if (type === "ultra") return "Ultra";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Decode JWT `exp` from WorkosCursorSessionToken (`userId%3A%3AJWT`). */
export function cookieExpiryEpoch(token: string): number | null {
  try {
    const jwt = token.includes("%3A%3A")
      ? decodeURIComponent(token.split("%3A%3A")[1] ?? "")
      : token.includes("::")
        ? (token.split("::")[1] ?? "")
        : token;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payloadB64.length % 4 === 0 ? "" : "=".repeat(4 - (payloadB64.length % 4));
    const json =
      typeof atob === "function"
        ? atob(payloadB64 + pad)
        : Buffer.from(payloadB64 + pad, "base64").toString("utf8");
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function parseCursorSummary(raw: unknown): {
  buckets: NormalizedBucket[];
  tierLabel?: string;
} {
  const parsed = summarySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ConnectorError("Cursor usage-summary JSON shape mismatch", "parse");
  }
  const data = parsed.data;
  const buckets: NormalizedBucket[] = [];
  const plan = data.individualUsage?.plan;
  if (plan && (plan.used !== undefined || plan.limit !== undefined || plan.totalPercentUsed !== undefined)) {
    const usedCents = plan.used;
    const limitCents = plan.limit;
    let percent = plan.totalPercentUsed;
    if (
      percent === undefined &&
      usedCents !== undefined &&
      limitCents !== undefined &&
      limitCents !== 0
    ) {
      percent = (usedCents / limitCents) * 100;
    }
    if (percent === undefined) {
      // skip incomplete
    } else {
      buckets.push({
        key: "plan_pool",
        label: "Included usage",
        windowKind: "plan_period",
        percent,
        used:
          usedCents !== undefined ? centsToDollars(usedCents) : undefined,
        limit:
          limitCents !== undefined ? centsToDollars(limitCents) : undefined,
        unit: "usd",
        resetsAt: data.billingCycleEnd,
        source: "unofficial",
      });
    }
  }

  const onDemand = data.individualUsage?.onDemand;
  if (
    onDemand &&
    onDemand.limit !== undefined &&
    onDemand.limit > 0 &&
    onDemand.used !== undefined
  ) {
    const percent = (onDemand.used / onDemand.limit) * 100;
    buckets.push({
      key: "on_demand",
      label: "On-demand spend",
      windowKind: "plan_period",
      percent,
      used: centsToDollars(onDemand.used),
      limit: centsToDollars(onDemand.limit),
      unit: "usd",
      resetsAt: data.billingCycleEnd,
      source: "unofficial",
    });
  }

  return {
    buckets,
    tierLabel: membershipLabel(data.membershipType),
  };
}

function cursorHeaders(token: string): Record<string, string> {
  return {
    Cookie: `WorkosCursorSessionToken=${token}`,
    Origin: "https://cursor.com",
    Referer: "https://cursor.com/dashboard",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "User-Agent": CURSOR_BROWSER_UA,
  };
}

async function resolveCookie(ctx: ConnectorContext): Promise<string> {
  const ref =
    (typeof ctx.config.cookieSecretRef === "string"
      ? ctx.config.cookieSecretRef
      : null) ??
    (typeof ctx.config.secretRef === "string" ? ctx.config.secretRef : null);
  if (!ref) {
    throw new ConnectorError(
      "Cursor cookie expired or rejected - re-copy WorkosCursorSessionToken from cursor.com/dashboard",
      "auth",
    );
  }
  const token = await ctx.getSecret(ref);
  if (!token) {
    throw new ConnectorError(
      "Cursor cookie expired or rejected - re-copy WorkosCursorSessionToken from cursor.com/dashboard",
      "auth",
    );
  }
  return token;
}

function mapAuthHttp(status: number): never {
  if (status === 401 || status === 403) {
    throw new ConnectorError(
      "Cursor cookie expired or rejected - re-copy WorkosCursorSessionToken from cursor.com/dashboard",
      "auth",
    );
  }
  throw new ConnectorError(`Cursor HTTP ${status}`, "other");
}

export const cursorCookieConnector: Connector = {
  id: "cursor_cookie",
  displayName: "Cursor (session cookie)",
  setupFields: [
    {
      key: "cookie",
      label: "WorkosCursorSessionToken cookie",
      secret: true,
      help: HELP,
    },
  ],
  async probe(ctx) {
    const token = await resolveCookie(ctx);
    let res: Response;
    try {
      res = await ctx.fetch("https://cursor.com/api/auth/me", {
        method: "GET",
        headers: cursorHeaders(token),
      });
    } catch (err) {
      throw new ConnectorError(
        err instanceof Error ? err.message : "Cursor network error",
        "network",
      );
    }
    if (!res.ok) mapAuthHttp(res.status);
    const body = (await res.json()) as { email?: string; id?: string };
    const who = body.email ?? body.id ?? "user";
    let message = `Authenticated as ${who}`;
    const exp = cookieExpiryEpoch(token);
    if (exp) {
      const days = (exp * 1000 - Date.now()) / (24 * 60 * 60 * 1000);
      if (days < 7) {
        message += ` (cookie expires in ${Math.max(0, Math.floor(days))} days)`;
      }
    }
    return { ok: true, message };
  },
  async fetchUsage(ctx): Promise<FetchResult> {
    const token = await resolveCookie(ctx);
    let res: Response;
    try {
      res = await ctx.fetch("https://cursor.com/api/usage-summary", {
        method: "GET",
        headers: cursorHeaders(token),
      });
    } catch (err) {
      throw new ConnectorError(
        err instanceof Error ? err.message : "Cursor network error",
        "network",
      );
    }
    if (!res.ok) mapAuthHttp(res.status);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ConnectorError(
        "Cursor usage-summary JSON shape mismatch",
        "parse",
      );
    }
    let parsed = parseCursorSummary(json);

    // Optional hard-limit fallback when onDemand.limit missing
    const onDemand = (json as { individualUsage?: { onDemand?: { limit?: number; used?: number } } })
      ?.individualUsage?.onDemand;
    if (
      onDemand &&
      (onDemand.limit === undefined || onDemand.limit <= 0) &&
      onDemand.used !== undefined
    ) {
      try {
        const hlRes = await ctx.fetch(
          "https://cursor.com/api/dashboard/get-hard-limit",
          {
            method: "POST",
            headers: {
              ...cursorHeaders(token),
              "Content-Type": "application/json",
            },
            body: "{}",
          },
        );
        if (hlRes.ok) {
          const hl = (await hlRes.json()) as { hardLimit?: number };
          if (typeof hl.hardLimit === "number" && hl.hardLimit > 0) {
            // hardLimit is dollars; convert used cents and rebuild on_demand
            const usedDollars = onDemand.used / 100;
            const percent = (usedDollars / hl.hardLimit) * 100;
            parsed = {
              ...parsed,
              buckets: [
                ...parsed.buckets.filter((b) => b.key !== "on_demand"),
                {
                  key: "on_demand",
                  label: "On-demand spend",
                  windowKind: "plan_period",
                  percent,
                  used: usedDollars,
                  limit: hl.hardLimit,
                  unit: "usd",
                  source: "unofficial",
                },
              ],
            };
          }
        }
      } catch {
        // ignore hard-limit fallback failures
      }
    }

    return {
      buckets: parsed.buckets,
      tierLabel: parsed.tierLabel,
      fetchedAt: new Date().toISOString(),
    };
  },
};

registerConnector(cursorCookieConnector);
