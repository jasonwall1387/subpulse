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
    limit: z.number().nullish(),
    remaining: z.number().nullish(),
    totalPercentUsed: z.number().optional(),
  })
  .passthrough();

const onDemandSchema = z
  .object({
    enabled: z.boolean().optional(),
    used: z.number().nullish(),
    limit: z.number().nullish(),
    remaining: z.number().nullish(),
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
  if (plan && (plan.used !== undefined || plan.limit != null || plan.totalPercentUsed !== undefined)) {
    const usedCents = plan.used;
    const limitCents = plan.limit;
    let percent = plan.totalPercentUsed;
    if (
      percent === undefined &&
      usedCents !== undefined &&
      limitCents != null &&
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
        limit: limitCents != null ? centsToDollars(limitCents) : undefined,
        unit: "usd",
        resetsAt: data.billingCycleEnd,
        source: "unofficial",
      });
    }
  }

  const onDemand = data.individualUsage?.onDemand;
  if (
    onDemand &&
    onDemand.limit != null &&
    onDemand.limit > 0 &&
    onDemand.used != null
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
  assertCookieLooksComplete(token);
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

const COOKIE_INCOMPLETE =
  "Cursor cookie looks incomplete - re-copy the full value from cursor.com/dashboard";

/** Reject truncated pastes before they produce opaque JSON parse errors. */
export function assertCookieLooksComplete(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new ConnectorError(COOKIE_INCOMPLETE, "auth");
  }
  const jwt = trimmed.includes("%3A%3A")
    ? decodeURIComponent(trimmed.split("%3A%3A")[1] ?? "")
    : trimmed.includes("::")
      ? (trimmed.split("::")[1] ?? "")
      : trimmed;
  const parts = jwt.split(".");
  if (parts.length < 3 || parts.some((p) => p.length === 0)) {
    throw new ConnectorError(COOKIE_INCOMPLETE, "auth");
  }
}

function humanizeCursorErr(err: unknown): ConnectorError {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /unexpected end of (json )?input/i.test(msg) ||
    /unexpected end of data/i.test(msg) ||
    msg === "Unexpected end of JSON input"
  ) {
    return new ConnectorError(COOKIE_INCOMPLETE, "auth");
  }
  if (err instanceof ConnectorError) return err;
  return new ConnectorError(msg || "Cursor network error", "network");
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
      throw humanizeCursorErr(err);
    }
    if (!res.ok) mapAuthHttp(res.status);
    let body: { email?: string; id?: string };
    try {
      body = (await res.json()) as { email?: string; id?: string };
    } catch (err) {
      throw humanizeCursorErr(err);
    }
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
      throw humanizeCursorErr(err);
    }
    if (!res.ok) mapAuthHttp(res.status);
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      throw humanizeCursorErr(err);
    }
    let parsed = parseCursorSummary(json);

    // Optional hard-limit fallback when onDemand.limit missing
    const onDemand = (json as {
      individualUsage?: { onDemand?: { limit?: number | null; used?: number | null } };
    })?.individualUsage?.onDemand;
    if (
      onDemand &&
      (onDemand.limit == null || onDemand.limit <= 0) &&
      onDemand.used != null
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
