import type { Diagnostic } from '@codemirror/lint';
import type { CompiledDocument } from '../compiler/compiler';

const FRONT_MATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_CODE_RE = /(`+)[\s\S]*?\1/g;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Blank regions the compiler does not parse as inline Markdown. */
export function maskInactiveSource(source: string): string {
  let masked = source.replace(FRONT_MATTER_RE, blank);

  const lines = masked.split('\n');
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      const closes = fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length;
      lines[i] = blank(line);
      if (closes) fence = null;
    } else if (fenceMatch) {
      fence = fenceMatch[1];
      lines[i] = blank(line);
    } else if (/^(?: {4,}|\t)/.test(line)) {
      lines[i] = blank(line);
    }
  }

  masked = lines.join('\n')
    .replace(INLINE_CODE_RE, blank)
    .replace(HTML_COMMENT_RE, blank);
  return masked;
}

export function unresolvedDiagnostics(
  source: string,
  doc: CompiledDocument,
): Diagnostic[] {
  if (!doc.unresolved.length) return [];
  const masked = maskInactiveSource(source);
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const key of doc.unresolved) {
    const pattern = new RegExp(
      `@${escapeRegExp(key)}(?![\\p{L}\\p{N}\\p{M}_#-])`,
      'gu',
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(masked))) {
      const position = `${match.index}:${key}`;
      if (seen.has(position)) continue;
      seen.add(position);
      diagnostics.push({
        from: match.index,
        to: match.index + match[0].length,
        severity: 'warning',
        source: 'CoDices',
        message: `找不到 @${key} 对应的标签。请检查拼写，或先创建对应的标题 / 块 / 线索。`,
      });
    }
  }

  return diagnostics.sort((a, b) => a.from - b.from);
}
