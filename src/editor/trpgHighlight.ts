import type { Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

const xrefMark = Decoration.mark({ class: 'cm-trpg-xref' });
const clueMark = Decoration.mark({ class: 'cm-trpg-clue' });
const markerMark = Decoration.mark({ class: 'cm-trpg-marker' });
const fenceMark = Decoration.mark({ class: 'cm-trpg-fence' });
const tagMark = Decoration.mark({ class: 'cm-trpg-tag' });
const headingIdMark = Decoration.mark({ class: 'cm-trpg-heading-id' });
const compileMark = Decoration.mark({ class: 'cm-trpg-compile' });

const XREF_RE = /@(#?[\p{L}\p{N}\p{M}_-]+(?:#[\p{L}\p{N}\p{M}_-]+)?)/gu;
const CLUE_RE = /`[^`\n]+`\[[^\[\]\s]+\](?!\()/gu;
const BQ_MARKER_RE = /^(\s*>\s*)(kp_notice|守密人提示|NPC|Mob|敌人)(?=$|[\s:：])/;
const FENCE_RE = /^(\s*)(```|~~~)\s*(aloud|handout)\b([^\n]*)$/i;
const TAG_TAIL_RE = /\[[^\[\]]+\]\s*$/;
const HEADING_ID_RE = /\{\s*#[^}\s]+\s*\}/g;
const COMPILE_RE = /<!--\s*compile:[\s\S]*?-->/g;

function decorateLine(
  from: number,
  text: string,
  output: Array<Range<Decoration>>,
): void {
  let match: RegExpExecArray | null;

  XREF_RE.lastIndex = 0;
  while ((match = XREF_RE.exec(text))) {
    output.push(xrefMark.range(from + match.index, from + match.index + match[0].length));
  }

  CLUE_RE.lastIndex = 0;
  while ((match = CLUE_RE.exec(text))) {
    output.push(clueMark.range(from + match.index, from + match.index + match[0].length));
  }

  const marker = BQ_MARKER_RE.exec(text);
  if (marker) {
    const start = from + (marker.index ?? 0) + marker[1].length;
    output.push(markerMark.range(start, start + marker[2].length));
    const tail = TAG_TAIL_RE.exec(text.slice(start + marker[2].length));
    if (tail) {
      const tailStart = start + marker[2].length + tail.index;
      output.push(tagMark.range(tailStart, tailStart + tail[0].trimEnd().length));
    }
  }

  const fence = FENCE_RE.exec(text);
  if (fence) {
    const start = from + (fence.index ?? 0) + fence[1].length;
    output.push(fenceMark.range(start, start + fence[2].length));
    const keywordStart = start + fence[2].length + (text.slice(start + fence[2].length).match(/^\s*/)?.[0].length ?? 0);
    output.push(markerMark.range(keywordStart, keywordStart + fence[3].length));
    const tail = TAG_TAIL_RE.exec(fence[4]);
    if (tail) {
      const tailStart = from + (fence.index ?? 0) + fence[0].lastIndexOf(fence[4]) + tail.index;
      output.push(tagMark.range(tailStart, tailStart + tail[0].trimEnd().length));
    }
  }

  HEADING_ID_RE.lastIndex = 0;
  while ((match = HEADING_ID_RE.exec(text))) {
    output.push(headingIdMark.range(from + match.index, from + match.index + match[0].length));
  }

  COMPILE_RE.lastIndex = 0;
  while ((match = COMPILE_RE.exec(text))) {
    output.push(compileMark.range(from + match.index, from + match.index + match[0].length));
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Array<Range<Decoration>> = [];
  const seenLines = new Set<number>();

  for (const visible of view.visibleRanges) {
    let position = visible.from;
    while (position <= visible.to) {
      const line = view.state.doc.lineAt(position);
      if (!seenLines.has(line.from)) {
        seenLines.add(line.from);
        decorateLine(line.from, line.text, decorations);
      }
      if (line.to >= visible.to) break;
      position = line.to + 1;
    }
  }

  return Decoration.set(decorations, true);
}

export const trpgHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
