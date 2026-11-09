/** Slugify and unique-id helpers for heading anchors. */

const DROP = /[^\p{L}\p{N}\p{M}_]+/gu;
const EDGE = /^[-_]+|[-_]+$/g;

export function slugify(text: string): string {
  const normalized = (text || '').normalize('NFC').toLowerCase();
  return normalized.replace(DROP, '-').replace(EDGE, '') || 'section';
}

/** Assign globally unique ids, appending `-2`, `-3` on collision. */
export class UniqueIds {
  private seen = new Map<string, number>();

  make(base: string): string {
    const key = base || 'section';
    const count = (this.seen.get(key) ?? 0) + 1;
    this.seen.set(key, count);
    return count === 1 ? key : `${key}-${count}`;
  }
}
