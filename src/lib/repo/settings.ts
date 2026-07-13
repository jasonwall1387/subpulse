import { run, select } from "../db";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await select<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key],
  );
  if (!rows[0]) return fallback;
  try {
    return JSON.parse(rows[0].value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await run(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, JSON.stringify(value)],
  );
}
