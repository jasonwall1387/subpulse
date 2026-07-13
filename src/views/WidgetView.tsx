import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, RefreshCw, X } from "lucide-react";
import {
  WidgetUpcoming,
  WidgetUsageList,
} from "@/components/usage/WidgetUsageList";
import { ClockTickProvider } from "@/lib/clock";
import { onSubsUpdated, onUsageUpdated } from "@/lib/events";
import { getSetting, setSetting } from "@/lib/repo/settings";
import { setWidgetVisible, showMainWindow } from "@/lib/tray";
import { cn } from "@/lib/utils";

type CtxMenu = { x: number; y: number } | null;

export function WidgetView() {
  return (
    <ClockTickProvider>
      <WidgetViewInner />
    </ClockTickProvider>
  );
}

function WidgetViewInner() {
  const queryClient = useQueryClient();
  const [pinned, setPinned] = useState(true);
  const [ctx, setCtx] = useState<CtxMenu>(null);
  const { data: opacity = 70 } = useQuery({
    queryKey: ["setting", "widget_opacity"],
    queryFn: () => getSetting<number>("widget_opacity", 70),
  });

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const root = document.getElementById("root");
    if (root) root.style.background = "transparent";
  }, []);

  useEffect(() => {
    let unSubs: (() => void) | undefined;
    let unUsage: (() => void) | undefined;
    void onSubsUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    }).then((fn) => {
      unSubs = fn;
    });
    void onUsageUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["usage-all-buckets"] });
    }).then((fn) => {
      unUsage = fn;
    });
    return () => {
      unSubs?.();
      unUsage?.();
    };
  }, [queryClient]);

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    await getCurrentWindow().setAlwaysOnTop(next);
    await setSetting("widget_always_on_top", next);
  }

  async function hideWidget() {
    await setWidgetVisible(false);
  }

  const opacityClamped = Math.min(100, Math.max(60, opacity));

  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl border border-white/10 p-3 text-zinc-100 backdrop-blur-2xl"
      style={{
        backgroundColor: `rgba(0, 0, 0, ${opacityClamped / 100})`,
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY });
      }}
      onClick={() => setCtx(null)}
    >
      <div data-tauri-drag-region className="mb-3 flex items-center gap-2">
        <span
          data-tauri-drag-region
          className="size-2 shrink-0 rounded-full bg-violet-500"
        />
        <span
          data-tauri-drag-region
          className="min-w-0 flex-1 text-sm font-medium"
        >
          SubPulse
        </span>
        <button
          type="button"
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Refresh all"
          onClick={() => void emit("refresh:all")}
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          className={cn(
            "rounded p-1 hover:bg-white/10",
            pinned ? "text-violet-400" : "text-zinc-400 hover:text-zinc-100",
          )}
          title="Always on top"
          onClick={() => void togglePin()}
        >
          <Pin className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Hide widget"
          onClick={() => void hideWidget()}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        <WidgetUpcoming />
        <WidgetUsageList />
      </div>

      {ctx && (
        <div
          className="fixed z-50 min-w-40 rounded-lg border border-white/10 bg-zinc-900/95 py-1 text-xs shadow-xl"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxItem
            label="Open SubPulse"
            onClick={() => {
              void showMainWindow();
              setCtx(null);
            }}
          />
          <CtxItem
            label="Refresh all"
            onClick={() => {
              void emit("refresh:all");
              setCtx(null);
            }}
          />
          <CtxItem
            label="Hide widget"
            onClick={() => {
              void hideWidget();
              setCtx(null);
            }}
          />
          <CtxItem
            label="Quit"
            onClick={() => {
              void exit(0);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CtxItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="block w-full px-3 py-1.5 text-left text-zinc-200 hover:bg-white/10"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
