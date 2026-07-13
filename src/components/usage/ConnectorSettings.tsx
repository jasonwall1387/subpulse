import { useMemo, useState } from "react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectors } from "@/lib/connectors/registry";
import {
  clampPlanRefreshMinutes,
  clearAuthStop,
  setPlanConnector,
} from "@/lib/connectors/scheduler";
import { relativeAgo } from "@/lib/resets";
import type { UsagePlan } from "@/lib/repo/usage";
import { updatePlan } from "@/lib/repo/usage";
import { deleteSecret, getSecret, setSecret } from "@/lib/secrets";
import { toastError, toastSuccess } from "@/lib/toast";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

function parseConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function secretRef(planId: number, fieldKey: string): string {
  return `p${planId}_${fieldKey}`;
}

function statusLine(plan: UsagePlan): string {
  if (plan.last_status === "auth") {
    return `auth needed: ${plan.last_error ?? "re-authenticate"}`;
  }
  if (plan.last_status === "error") {
    return `error: ${plan.last_error ?? "unknown"}`;
  }
  if (plan.last_status === "ok" && plan.last_fetch_at) {
    return `ok ${relativeAgo(plan.last_fetch_at, new Date().toISOString())}`;
  }
  return "never fetched";
}

function isStale(plan: UsagePlan): boolean {
  if (!plan.last_fetch_at || plan.connector === "manual") return false;
  const ageMs = Date.now() - new Date(plan.last_fetch_at).getTime();
  return ageMs > plan.refresh_minutes * 60_000 * 2;
}

export function ConnectorSettings({
  plan,
  onChanged,
}: {
  plan: UsagePlan;
  onChanged?: () => void;
}) {
  const config = useMemo(
    () => parseConfig(plan.connector_config),
    [plan.connector_config],
  );
  const [connectorId, setConnectorId] = useState(plan.connector);
  const [refreshMinutes, setRefreshMinutes] = useState(
    clampPlanRefreshMinutes(plan.refresh_minutes),
  );
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  const registryEntries = Object.values(connectors);
  const selected = connectorId === "manual" ? null : connectors[connectorId];

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const nextConfig: Record<string, unknown> = { ...config };
      if (selected) {
        for (const field of selected.setupFields) {
          if (!field.secret) continue;
          const draft = secretDrafts[field.key];
          const ref = secretRef(plan.id, field.key);
          if (draft && draft.trim()) {
            await setSecret(ref, draft.trim());
            nextConfig[`${field.key}SecretRef`] = ref;
            // also store generic secretRef for single-field connectors
            nextConfig.secretRef = ref;
          } else if (!nextConfig[`${field.key}SecretRef`] && !nextConfig.secretRef) {
            // keep existing
          }
        }
      }
      if (connectorId === "manual") {
        // leave secrets in keyring; just switch connector
      }
      await setPlanConnector(
        plan.id,
        connectorId,
        nextConfig,
        refreshMinutes,
      );
      setSecretDrafts({});
      setProbeMsg(null);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function onTest(): Promise<void> {
    if (!selected) {
      setProbeMsg("Manual plans have no probe.");
      return;
    }
    setBusy(true);
    try {
      // Ensure drafts are saved first if present
      const nextConfig: Record<string, unknown> = { ...config };
      for (const field of selected.setupFields) {
        if (!field.secret) continue;
        const draft = secretDrafts[field.key];
        const ref = secretRef(plan.id, field.key);
        if (draft && draft.trim()) {
          await setSecret(ref, draft.trim());
          nextConfig[`${field.key}SecretRef`] = ref;
          nextConfig.secretRef = ref;
        }
      }
      await updatePlan(plan.id, {
        connector: connectorId,
        connector_config: nextConfig,
        refresh_minutes: clampPlanRefreshMinutes(refreshMinutes),
      });
      clearAuthStop(plan.id);

      const result = await selected.probe({
        config: nextConfig,
        getSecret,
        fetch: tauriFetch as typeof fetch,
      });
      setProbeMsg(result.message);
      if (result.ok) toastSuccess(result.message);
      else toastError(result.message);
      try {
        sendNotification({
          title: "SubPulse",
          body: result.message,
        });
      } catch {
        // permission optional
      }
      onChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProbeMsg(msg);
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  async function clearFieldSecret(fieldKey: string): Promise<void> {
    const ref = secretRef(plan.id, fieldKey);
    await deleteSecret(ref);
    const next = { ...config };
    delete next[`${fieldKey}SecretRef`];
    if (next.secretRef === ref) delete next.secretRef;
    await updatePlan(plan.id, { connector_config: next });
    onChanged?.();
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">
            {plan.display_name}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {statusLine(plan)}
            {isStale(plan) && (
              <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase text-amber-200">
                stale
              </span>
            )}
          </p>
        </div>
      </div>

      <label className="block space-y-1 text-xs text-zinc-400">
        Connector
        <select
          className="w-full rounded-md border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
          value={connectorId}
          onChange={(e) => setConnectorId(e.target.value)}
        >
          <option value="manual">Manual</option>
          {registryEntries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>

      {selected?.setupFields.map((field) => {
        const ref =
          (typeof config[`${field.key}SecretRef`] === "string"
            ? (config[`${field.key}SecretRef`] as string)
            : null) ??
          (typeof config.secretRef === "string"
            ? (config.secretRef as string)
            : null);
        return (
          <div key={field.key} className="space-y-1">
            <label className="block text-xs text-zinc-400">{field.label}</label>
            <p className="text-[11px] leading-snug text-zinc-500">{field.help}</p>
            <Input
              type={field.secret ? "password" : "text"}
              placeholder={ref ? "•••••••• (saved in keyring)" : "Paste value"}
              value={secretDrafts[field.key] ?? ""}
              onChange={(e) =>
                setSecretDrafts((d) => ({ ...d, [field.key]: e.target.value }))
              }
            />
            {ref && (
              <button
                type="button"
                className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
                onClick={() => void clearFieldSecret(field.key)}
              >
                Clear saved secret
              </button>
            )}
          </div>
        );
      })}

      <label className="block space-y-1 text-xs text-zinc-400">
        Refresh interval (minutes, min 10)
        <Input
          type="number"
          min={10}
          value={refreshMinutes}
          onChange={(e) =>
            setRefreshMinutes(
              clampPlanRefreshMinutes(Number(e.target.value) || 10),
            )
          }
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void save()}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || connectorId === "manual"}
          onClick={() => void onTest()}
        >
          Test
        </Button>
      </div>
      {probeMsg && <p className="text-xs text-zinc-400">{probeMsg}</p>}
    </div>
  );
}
