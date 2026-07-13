import { format, parseISO } from "date-fns";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { emit, listen } from "@tauri-apps/api/event";
import { Menu } from "@tauri-apps/api/menu";
import { CheckMenuItem } from "@tauri-apps/api/menu/checkMenuItem";
import { MenuItem } from "@tauri-apps/api/menu/menuItem";
import { PredefinedMenuItem } from "@tauri-apps/api/menu/predefinedMenuItem";
import { TrayIcon, type TrayIconEvent } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { exit } from "@tauri-apps/plugin-process";
import { onSubsUpdated, onUsageUpdated } from "@/lib/events";
import { getSetting, setSetting } from "@/lib/repo/settings";
import { listSubscriptions } from "@/lib/repo/subscriptions";
import { listAllBuckets } from "@/lib/repo/usage";

const WIDGET_VIS_EVENT = "widget:visibility";

let tray: TrayIcon | null = null;
let widgetCheck: CheckMenuItem | null = null;
let autostartCheck: CheckMenuItem | null = null;

export async function showMainWindow(): Promise<void> {
  const main = await WebviewWindow.getByLabel("main");
  if (!main) return;
  await main.show();
  await main.unminimize();
  await main.setFocus();
}

export async function setWidgetVisible(visible: boolean): Promise<void> {
  await setSetting("widget_visible", visible);
  const widget = await WebviewWindow.getByLabel("widget");
  if (widget) {
    if (visible) {
      await widget.show();
    } else {
      await widget.hide();
    }
  }
  await widgetCheck?.setChecked(visible);
  await emit(WIDGET_VIS_EVENT, { visible });
}

export async function updateTrayTooltip(): Promise<void> {
  if (!tray) return;
  const parts: string[] = ["SubPulse"];
  try {
    const buckets = await listAllBuckets();
    const worst = [...buckets].sort((a, b) => b.percent - a.percent)[0];
    if (worst) {
      parts.push(`${worst.label} ${Math.round(worst.percent)}%`);
    }
  } catch {
    // db may not be ready
  }
  try {
    const subs = await listSubscriptions("active");
    const next = [...subs]
      .filter((s) => s.next_renewal)
      .sort((a, b) => (a.next_renewal! < b.next_renewal! ? -1 : 1))[0];
    if (next?.next_renewal) {
      parts.push(
        `next: ${next.name} ${format(parseISO(next.next_renewal), "MMM d")}`,
      );
    }
  } catch {
    // ignore
  }
  const tooltip =
    parts.length === 1
      ? "SubPulse"
      : parts.length === 2
        ? `${parts[0]} - ${parts[1]}`
        : `${parts[0]} - ${parts[1]} | ${parts[2]}`;
  await tray.setTooltip(tooltip);
}

export async function initTray(): Promise<void> {
  if (tray) return;

  const widgetVisible = await getSetting<boolean>("widget_visible", false);
  const autostartOn = await isEnabled().catch(() => false);

  widgetCheck = await CheckMenuItem.new({
    id: "show-widget",
    text: "Show widget",
    checked: widgetVisible,
    action: async () => {
      const next = !(await getSetting<boolean>("widget_visible", false));
      await setWidgetVisible(next);
    },
  });

  autostartCheck = await CheckMenuItem.new({
    id: "launch-at-login",
    text: "Launch at login",
    checked: autostartOn,
    action: async () => {
      const currently = await isEnabled();
      if (currently) {
        await disable();
        await autostartCheck?.setChecked(false);
      } else {
        await enable();
        await autostartCheck?.setChecked(true);
      }
    },
  });

  const menu = await Menu.new({
    items: [
      await MenuItem.new({
        id: "open",
        text: "Open SubPulse",
        action: () => {
          void showMainWindow();
        },
      }),
      await MenuItem.new({
        id: "refresh-all",
        text: "Refresh all",
        action: () => {
          void emit("refresh:all");
        },
      }),
      widgetCheck,
      autostartCheck,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "quit",
        text: "Quit",
        action: () => {
          void exit(0);
        },
      }),
    ],
  });

  const icon = await defaultWindowIcon();
  tray = await TrayIcon.new({
    id: "subpulse-tray",
    icon: icon ?? undefined,
    tooltip: "SubPulse",
    menu,
    showMenuOnLeftClick: false,
    action: (event: TrayIconEvent) => {
      if (
        event.type === "Click" &&
        event.button === "Left" &&
        event.buttonState === "Up"
      ) {
        void showMainWindow();
      }
    },
  });

  await updateTrayTooltip();
  void onSubsUpdated(() => {
    void updateTrayTooltip();
  });
  void onUsageUpdated(() => {
    void updateTrayTooltip();
  });
  void listen<{ visible: boolean }>(WIDGET_VIS_EVENT, (event) => {
    void widgetCheck?.setChecked(event.payload.visible);
  });
}

export async function applyWidgetVisibilityOnBoot(): Promise<void> {
  const visible = await getSetting<boolean>("widget_visible", false);
  const widget = await WebviewWindow.getByLabel("widget");
  if (!widget) return;
  if (visible) {
    await widget.show();
  } else {
    await widget.hide();
  }
}

export async function setupCloseToTray(): Promise<void> {
  const win = getCurrentWindow();
  await win.onCloseRequested(async (event) => {
    event.preventDefault();
    await win.hide();
  });
}
