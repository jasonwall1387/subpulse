import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WindowKind } from "@/lib/connectors/types";
import { emitUsageUpdated } from "@/lib/events";
import type { LimitBucket } from "@/lib/repo/usage";
import { setManualBucket } from "@/lib/repo/usage";

const CHIPS = [0, 25, 50, 75, 100];

const WINDOW_KINDS: WindowKind[] = [
  "rolling_5h",
  "daily",
  "weekly",
  "monthly",
  "plan_period",
  "custom",
];

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function ManualUpdatePopover({
  planId,
  bucket,
  onSaved,
}: {
  planId: number;
  bucket: LimitBucket;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [percent, setPercent] = useState(bucket.percent);
  const [used, setUsed] = useState(bucket.used?.toString() ?? "");
  const [limit, setLimit] = useState(bucket.limit_value?.toString() ?? "");
  const [resetsLocal, setResetsLocal] = useState(toLocalInput(bucket.resets_at));
  const [windowKind, setWindowKind] = useState<WindowKind>(bucket.window_kind);

  useEffect(() => {
    if (!open) return;
    setPercent(bucket.percent);
    setUsed(bucket.used?.toString() ?? "");
    setLimit(bucket.limit_value?.toString() ?? "");
    setResetsLocal(toLocalInput(bucket.resets_at));
    setWindowKind(bucket.window_kind);
  }, [open, bucket]);

  async function save() {
    const usedNum = used === "" ? undefined : Number(used);
    const limitNum = limit === "" ? undefined : Number(limit);
    await setManualBucket(planId, {
      key: bucket.key,
      label: bucket.label,
      windowKind,
      percent,
      used: usedNum,
      limit: limitNum,
      unit: bucket.unit ?? undefined,
      resetsAt: fromLocalInput(resetsLocal),
      source: "manual",
    });
    await emitUsageUpdated();
    setOpen(false);
    onSaved?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-7 items-center rounded-lg border border-input px-2 text-xs text-zinc-300 hover:bg-white/[0.07]">
        Edit {bucket.label}
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3">
        <div className="space-y-1">
          <Label>Percent ({Math.round(percent)}%)</Label>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex flex-wrap gap-1">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/20"
                onClick={() => setPercent(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>Used</Label>
            <Input value={used} onChange={(e) => setUsed(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Limit</Label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Resets at</Label>
          <Input
            type="datetime-local"
            value={resetsLocal}
            onChange={(e) => setResetsLocal(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label>Window</Label>
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={windowKind}
            onChange={(e) => setWindowKind(e.target.value as WindowKind)}
          >
            {WINDOW_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <Button type="button" className="w-full" onClick={() => void save()}>
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
