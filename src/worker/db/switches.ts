import type { Switch, SwitchType } from "../../shared/schemas";

export async function listSwitches(db: D1Database): Promise<Switch[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, manufacturer, switch_type, description, image_url FROM switches ORDER BY name COLLATE NOCASE, id",
    )
    .all<{
      id: number;
      name: string;
      manufacturer: string;
      switch_type: SwitchType;
      description: string;
      image_url: string | null;
    }>();
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    type: row.switch_type,
    description: row.description,
    imageUrl: row.image_url,
  }));
}
