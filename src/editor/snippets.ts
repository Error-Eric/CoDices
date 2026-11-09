import { startCompletion } from '@codemirror/autocomplete';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export interface SnippetDef {
  id: string;
  group: string;
  label: string;
  hint: string;
  icon: string;
  template: string;
  block?: boolean;
}

export const SNIPPETS: SnippetDef[] = [
  {
    id: 'aloud',
    group: '宣读与提示',
    label: '宣读框',
    hint: 'aloud · 折叠的玩家朗读文本',
    icon: 'megaphone',
    block: true,
    template: '```aloud [entry_tag]\n{{cursor}}\n```',
  },
  {
    id: 'kp_notice',
    group: '宣读与提示',
    label: '守密人提示',
    hint: 'kp_notice · 黄色提示卡',
    icon: 'eye',
    block: true,
    template: '> kp_notice [notice_tag]\n>\n> {{cursor}}',
  },
  {
    id: 'npc',
    group: '角色卡',
    label: 'NPC',
    hint: 'NPC：名字 [tag]',
    icon: 'user',
    block: true,
    template:
      '> NPC：名字 [npc_tag]\n>\n> *一句话描述*\n>\n> STR：50 DEX：50 POW：50\n> HP：10\n>\n> {{cursor}}',
  },
  {
    id: 'mob',
    group: '角色卡',
    label: '怪物',
    hint: 'Mob：名字 [tag]',
    icon: 'skull',
    block: true,
    template:
      '> Mob：怪物名 [mob_tag]\n>\n> STR：0 DEX：0 POW：0\n> HP：0\n>\n> 攻击：\n>\n> {{cursor}}',
  },
  {
    id: 'enemy',
    group: '角色卡',
    label: '敌人',
    hint: '敌人：名字 [tag]',
    icon: 'shield',
    block: true,
    template: '> 敌人：名字 [enemy_tag]\n>\n> {{cursor}}',
  },
  {
    id: 'clue',
    group: '线索与道具',
    label: '行内线索',
    hint: '`线索`[clue_tag]',
    icon: 'key',
    template: '',
  },
  {
    id: 'handout',
    group: '线索与道具',
    label: 'Handout',
    hint: 'handout · 玩家道具与信件',
    icon: 'scroll',
    block: true,
    template: '```handout [handout_tag]\n{{cursor}}\n```',
  },
  {
    id: 'location',
    group: '结构',
    label: '地点章节',
    hint: '### 地点：名称',
    icon: 'map-pin',
    template: '### 地点：{{cursor}}',
  },
  {
    id: 'heading',
    group: '结构',
    label: '章节标题',
    hint: '## 标题',
    icon: 'file',
    template: '## {{cursor}}',
  },
  {
    id: 'xref',
    group: '结构',
    label: '交叉引用',
    hint: '@tag · 自动补全已有标签',
    icon: 'link',
    template: '',
  },
  {
    id: 'table',
    group: '结构',
    label: '表格',
    hint: 'Markdown table',
    icon: 'columns',
    block: true,
    template: '| 项目 | 内容 |\n| --- | --- |\n| {{cursor}} |  |',
  },
];

function ensureBlockSpacing(state: EditorState, from: number, to: number, text: string, template: string): {
  insert: string;
  cursorOffset: number;
} {
  const line = state.doc.lineAt(from);
  const before = state.doc.sliceString(Math.max(0, from - 2), from);
  const after = state.doc.sliceString(to, Math.min(state.doc.length, to + 2));
  let insert = text;
  let prefix = '';
  let suffix = '';

  if (line.text.trim() && from === to) prefix = '\n\n';
  else if (from > 0 && !before.endsWith('\n')) prefix = '\n';

  if (!insert.endsWith('\n')) insert += '\n';
  if (to < state.doc.length && !after.startsWith('\n')) suffix = '\n';

  const markerIndex = template.indexOf('{{cursor}}');
  const safeMarker = markerIndex >= 0 ? markerIndex : template.length;
  return {
    insert: prefix + insert + suffix,
    cursorOffset: prefix.length + Math.min(safeMarker, text.length),
  };
}

export function insertSnippet(view: EditorView, snippet: SnippetDef): void {
  const selection = view.state.selection.main;

  if (snippet.id === 'clue') {
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const text = selected || '线索内容';
    const from = selection.from;
    const insert = `\`${text}\`[clue_tag]`;
    view.dispatch({
      changes: { from, to: selection.to, insert },
      selection: selected
        ? EditorSelection.cursor(from + insert.length)
        : EditorSelection.range(from + 1, from + 1 + text.length),
      scrollIntoView: true,
    });
    view.focus();
    return;
  }

  if (snippet.id === 'xref') {
    const from = selection.from;
    view.dispatch({
      changes: { from, to: selection.to, insert: '@' },
      selection: EditorSelection.cursor(from + 1),
      scrollIntoView: true,
    });
    view.focus();
    startCompletion(view);
    return;
  }

  const template = snippet.template;
  const marker = template.indexOf('{{cursor}}');
  const text = template.replace('{{cursor}}', '');
  let insert = text;
  let cursor = marker >= 0 ? marker : text.length;

  if (snippet.block) {
    const spaced = ensureBlockSpacing(view.state, selection.from, selection.to, text, template);
    insert = spaced.insert;
    cursor = spaced.cursorOffset;
  }

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: EditorSelection.cursor(selection.from + cursor),
    scrollIntoView: true,
  });
  view.focus();
}

export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  fallback: string,
): void {
  const selection = view.state.selection.main;
  const selected = view.state.sliceDoc(selection.from, selection.to);
  const text = selected || fallback;
  const insert = `${before}${text}${after}`;
  const start = selection.from + before.length;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: selected
      ? EditorSelection.cursor(selection.from + insert.length)
      : EditorSelection.range(start, start + text.length),
    scrollIntoView: true,
  });
  view.focus();
}
