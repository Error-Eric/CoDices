import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { TagKeyInfo, TagType } from '../compiler/tags';

const VALID_KEY_RE = /^#?[\p{L}\p{N}\p{M}_-]+(?:#[\p{L}\p{N}\p{M}_-]+)?$/u;
const TRIGGER_RE = /@([\p{L}\p{N}\p{M}_#-]*)$/u;

const TYPE_LABEL: Record<TagType, string> = {
  section: '章节',
  aloud: '宣读',
  kp_notice: '守密人提示',
  npc: 'NPC',
  mob: '怪物',
  enemy: '敌人',
  clue: '线索',
  handout: '道具',
};

const COMPLETION_TYPE: Record<TagType, string> = {
  section: 'keyword',
  aloud: 'function',
  kp_notice: 'function',
  npc: 'variable',
  mob: 'variable',
  enemy: 'variable',
  clue: 'property',
  handout: 'text',
};

export function tagCompletion(getTags: () => TagKeyInfo[]): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = TRIGGER_RE.exec(before);
    if (!match) return null;

    const prefix = match[1] ?? '';
    const from = context.pos - prefix.length;
    const lowered = prefix.toLowerCase();

    const options: Completion[] = getTags()
      .filter((tag) => VALID_KEY_RE.test(tag.key))
      .filter((tag) => !lowered || tag.key.toLowerCase().includes(lowered))
      .sort((a, b) => {
        const aStarts = a.key.toLowerCase().startsWith(lowered) ? 0 : 1;
        const bStarts = b.key.toLowerCase().startsWith(lowered) ? 0 : 1;
        return aStarts - bStarts || a.key.localeCompare(b.key, 'zh-CN');
      })
      .slice(0, 80)
      .map((tag) => {
        const count = tag.count > 1 ? ` · ${tag.count} 处` : '';
        const info = tag.preview ? `${tag.label}\n${tag.preview}` : tag.label;
        return {
          label: tag.key,
          detail: `${TYPE_LABEL[tag.type]}${count}`,
          info,
          type: COMPLETION_TYPE[tag.type],
        };
      });

    if (!options.length) return null;
    return {
      from,
      options,
      validFor: /^[\p{L}\p{N}\p{M}_#-]*$/u,
    };
  };
}
