import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import type { TagKeyInfo } from '../compiler/tags';
import { tagCompletion } from './autocomplete';
import { editorTheme } from './theme';
import { trpgHighlight } from './trpgHighlight';
import { wrapSelection } from './snippets';

export interface CursorInfo {
  line: number;
  column: number;
  selected: number;
}

export interface EditorOptions {
  value: string;
  dark: boolean;
  getTags: () => TagKeyInfo[];
  onChange: (value: string) => void;
  onCursor: (info: CursorInfo) => void;
}

export interface ScenarioEditor {
  view: EditorView;
  getValue(): string;
  setValue(value: string): void;
  setTheme(dark: boolean): void;
  setDiagnostics(diagnostics: Diagnostic[]): void;
  focus(): void;
  scrollToTop(): void;
  toggleBold(): void;
  toggleItalic(): void;
}

function inlineCommands(): Extension {
  return keymap.of([
    {
      key: 'Mod-b',
      run: (view) => {
        wrapSelection(view, '**', '**', '粗体');
        return true;
      },
    },
    {
      key: 'Mod-i',
      run: (view) => {
        wrapSelection(view, '*', '*', '斜体');
        return true;
      },
    },
  ]);
}

export function createEditor(parent: HTMLElement, options: EditorOptions): ScenarioEditor {
  const themeCompartment = new Compartment();

  const cursorInfo = (state: EditorState): CursorInfo => {
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head);
    return {
      line: line.number,
      column: selection.head - line.from + 1,
      selected: Math.abs(selection.to - selection.from),
    };
  };

  const state = EditorState.create({
    doc: options.value,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter({ openText: '▾', closedText: '▸' }),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      indentUnit.of('  '),
      EditorState.tabSize.of(2),
      themeCompartment.of(editorTheme(options.dark)),
      EditorView.lineWrapping,
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      autocompletion({
        override: [tagCompletion(() => options.getTags())],
        activateOnTyping: true,
        icons: false,
        maxRenderedOptions: 60,
        closeOnBlur: true,
      }),
      markdown({ base: markdownLanguage }),
      trpgHighlight,
      lintGutter(),
      placeholder('在这里写下你的模组…… 输入 @ 引用标签，或从“插入”菜单添加宣读框、NPC 卡与线索。'),
      EditorView.contentAttributes.of({
        'aria-label': '模组 Markdown 源码',
        spellcheck: 'false',
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) {
          options.onCursor(cursorInfo(update.state));
        }
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      inlineCommands(),
    ],
  });

  const view = new EditorView({ state, parent });
  options.onCursor(cursorInfo(view.state));

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(value: string) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: 0 },
        scrollIntoView: true,
      });
      view.focus();
    },
    setTheme(dark: boolean) {
      view.dispatch({
        effects: themeCompartment.reconfigure(editorTheme(dark)),
      });
    },
    setDiagnostics(diagnostics: Diagnostic[]) {
      view.dispatch(setDiagnostics(view.state, diagnostics));
    },
    focus: () => view.focus(),
    scrollToTop: () => view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true }),
    toggleBold: () => {
      wrapSelection(view, '**', '**', '粗体');
    },
    toggleItalic: () => {
      wrapSelection(view, '*', '*', '斜体');
    },
  };
}
