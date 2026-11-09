/** Front-matter parsing. Degrades to an empty object on malformed YAML. */

import { load } from 'js-yaml';

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export type FrontMatter = Record<string, unknown>;

export function splitFrontmatter(source: string): [FrontMatter, string] {
  const match = FM_RE.exec(source);
  if (!match) return [{}, source];

  let data: unknown;
  try {
    data = load(match[1]);
  } catch {
    return [{}, source.slice(match[0].length)];
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return [data as FrontMatter, source.slice(match[0].length)];
  }
  return [{}, source.slice(match[0].length)];
}
