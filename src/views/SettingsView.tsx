import { useState } from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "@/components/ui/button";
import { emitSubsUpdated } from "@/lib/events";
import { useSubscriptions } from "@/lib/hooks";
import { listCategories } from "@/lib/repo/categories";
import { listSubscriptions } from "@/lib/repo/subscriptions";
import { loadSeed } from "@/seed/seed";

export function SettingsView() {
  const { data: subs = [], refetch } = useSubscriptions("all");
  const [message, setMessage] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const hasSubs = subs.length > 0;

  async function onLoadSeed() {
    await loadSeed();
    await emitSubsUpdated();
    await refetch();
    setMessage("Seed data loaded.");
  }

  async function onExportCsv() {
    const [allSubs, categories] = await Promise.all([
      listSubscriptions("all"),
      listCategories(),
    ]);
    const catById = new Map(categories.map((c) => [c.id, c.name]));
    const header =
      "name,category,price_usd,cycle,next_renewal,status,payment_method,url,notes";
    const lines = allSubs.map((s) => {
      const cells = [
        s.name,
        s.category_id != null ? (catById.get(s.category_id) ?? "") : "",
        (s.price_cents / 100).toFixed(2),
        s.billing_cycle,
        s.next_renewal ?? "",
        s.status,
        s.payment_method ?? "",
        s.url ?? "",
        s.notes ?? "",
      ];
      return cells.map(csvEscape).join(",");
    });
    const csv = [header, ...lines].join("\n");
    const path = await save({
      defaultPath: "subpulse-subscriptions.csv",
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    await writeTextFile(path, csv);
    setMessage(`Exported ${allSubs.length} rows.`);
  }

  async function onOpenDataFolder() {
    const dir = await appDataDir();
    const dbPath = await join(dir, "subpulse.db");
    await revealItemInDir(dbPath);
  }

  async function onResetDatabase() {
    if (!resetArmed) {
      setResetArmed(true);
      setMessage("Click Reset again to confirm wipe + relaunch.");
      return;
    }
    try {
      await remove("subpulse.db", { baseDir: BaseDirectory.AppData });
    } catch {
      // file may not exist yet
    }
    await relaunch();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">App preferences and data.</p>
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-xl">
        <h2 className="text-sm font-medium text-zinc-200">Data</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Seed sample subscriptions, export CSV, or wipe local state.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={hasSubs}
            onClick={() => void onLoadSeed()}
          >
            Load seed data
          </Button>
          <Button type="button" variant="outline" onClick={() => void onExportCsv()}>
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onOpenDataFolder()}
          >
            Open data folder
          </Button>
          <Button
            type="button"
            variant={resetArmed ? "destructive" : "outline"}
            onClick={() => void onResetDatabase()}
          >
            {resetArmed ? "Confirm reset database" : "Reset database"}
          </Button>
        </div>
        {message && <p className="mt-3 text-sm text-zinc-400">{message}</p>}
      </section>
    </div>
  );
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
