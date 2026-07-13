import { invoke } from "@tauri-apps/api/core";

export async function getSecret(ref: string): Promise<string | null> {
  return invoke<string | null>("secret_get", { serviceKey: ref });
}

export async function setSecret(ref: string, value: string): Promise<void> {
  await invoke("secret_set", { serviceKey: ref, value });
}

export async function deleteSecret(ref: string): Promise<void> {
  await invoke("secret_delete", { serviceKey: ref });
}
