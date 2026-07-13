import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:subpulse.db").then(async (db) => {
      await ensureDefaultCategories(db);
      return db;
    });
  }
  return dbPromise;
}

async function ensureDefaultCategories(db: Database): Promise<void> {
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM categories",
  );
  if ((rows[0]?.count ?? 0) > 0) return;

  const defaults: Array<[string, string, number]> = [
    ["AI", "#8b5cf6", 0],
    ["Dev Tools", "#3b82f6", 1],
    ["Infrastructure", "#10b981", 2],
    ["Media", "#f59e0b", 3],
    ["Other", "#71717a", 4],
  ];
  for (const [name, color, sortOrder] of defaults) {
    await db.execute(
      "INSERT INTO categories (name, color, sort_order) VALUES ($1, $2, $3)",
      [name, color, sortOrder],
    );
  }
}

export async function select<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

export async function run(
  sql: string,
  params: unknown[] = [],
): Promise<{ rowsAffected: number; lastInsertId?: number }> {
  const db = await getDb();
  return db.execute(sql, params);
}
