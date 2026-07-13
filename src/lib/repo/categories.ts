import { z } from "zod";
import { run, select } from "../db";

export const categorySchema = z
  .object({
    id: z.number(),
    name: z.string(),
    color: z.string(),
    emoji: z.string().nullable(),
    sort_order: z.number(),
  })
  .passthrough();

export type Category = z.infer<typeof categorySchema>;

export async function listCategories(): Promise<Category[]> {
  const rows = await select<unknown>(
    "SELECT * FROM categories ORDER BY sort_order ASC, id ASC",
  );
  return rows.map((row) => categorySchema.parse(row));
}

export async function createCategory(input: {
  name: string;
  color: string;
  emoji?: string;
}): Promise<number> {
  const existing = await select<{ max_order: number | null }>(
    "SELECT MAX(sort_order) as max_order FROM categories",
  );
  const sortOrder = (existing[0]?.max_order ?? -1) + 1;
  const result = await run(
    "INSERT INTO categories (name, color, emoji, sort_order) VALUES ($1, $2, $3, $4)",
    [input.name, input.color, input.emoji ?? null, sortOrder],
  );
  return result.lastInsertId ?? 0;
}

export async function updateCategory(
  id: number,
  patch: Partial<{
    name: string;
    color: string;
    emoji: string | null;
    sort_order: number;
  }>,
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = $${i}`);
    params.push(value);
    i += 1;
  }
  if (fields.length === 0) return;
  params.push(id);
  await run(
    `UPDATE categories SET ${fields.join(", ")} WHERE id = $${i}`,
    params,
  );
}

export async function deleteCategory(id: number): Promise<void> {
  await run("DELETE FROM categories WHERE id = $1", [id]);
}
