import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export async function emitSubsUpdated(): Promise<void> {
  await emit("subs:updated");
}

export async function emitUsageUpdated(): Promise<void> {
  await emit("usage:updated");
}

export async function onSubsUpdated(cb: () => void): Promise<UnlistenFn> {
  return listen("subs:updated", () => {
    cb();
  });
}

export async function onUsageUpdated(cb: () => void): Promise<UnlistenFn> {
  return listen("usage:updated", () => {
    cb();
  });
}
