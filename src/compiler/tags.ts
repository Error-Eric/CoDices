/** Tag model and registry for the two-pass cross-reference system. */

export type TagType =
  | 'aloud'
  | 'kp_notice'
  | 'npc'
  | 'mob'
  | 'enemy'
  | 'clue'
  | 'section'
  | 'handout';

export interface TagEntry {
  type: TagType;
  /** Human-readable display text (without duplicated prefixes). */
  label: string;
  /** Element id to jump to. */
  targetId: string;
  preview: string;
  number: number;
  /** Explicit tag or NPC name, when present. */
  name: string;
  keys: string[];
}

export interface TagTarget {
  id: string;
  label: string;
  preview: string;
  type: TagType;
}

export interface TagKeyInfo {
  key: string;
  label: string;
  type: TagType;
  count: number;
  preview: string;
}

export function tagTarget(entry: TagEntry): TagTarget {
  return {
    id: entry.targetId,
    label: entry.label,
    preview: entry.preview,
    type: entry.type,
  };
}

export class TagRegistry {
  private map = new Map<string, TagEntry[]>();
  private order: TagEntry[] = [];

  register(entry: TagEntry): void {
    this.order.push(entry);
    for (const key of entry.keys) {
      if (!key) continue;
      const bucket = this.map.get(key);
      if (bucket) bucket.push(entry);
      else this.map.set(key, [entry]);
    }
  }

  resolve(key: string): TagEntry[] {
    return this.map.get(key) ?? [];
  }

  entries(): TagEntry[] {
    return [...this.order];
  }

  keys(): TagKeyInfo[] {
    return [...this.map.entries()]
      .map(([key, entries]) => ({
        key,
        label: entries[0].label,
        type: entries[0].type,
        count: entries.length,
        preview: entries[0].preview,
      }))
      .sort((a, b) => a.key.localeCompare(b.key, 'zh-CN'));
  }
}
