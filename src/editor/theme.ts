import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: 'var(--cm-heading)', fontWeight: '800', fontSize: '1.32em' },
  { tag: tags.heading2, color: 'var(--cm-heading)', fontWeight: '800', fontSize: '1.18em' },
  { tag: tags.heading3, color: 'var(--cm-heading)', fontWeight: '700', fontSize: '1.08em' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], color: 'var(--cm-heading)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '800', color: 'var(--cm-strong)' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'var(--cm-em)' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--cm-meta)' },
  { tag: [tags.link, tags.url], color: 'var(--cm-link)', textDecoration: 'underline' },
  { tag: tags.monospace, color: 'var(--cm-code)', background: 'var(--cm-code-bg)', borderRadius: '3px' },
  { tag: tags.quote, color: 'var(--cm-quote)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--cm-marker)' },
  { tag: tags.meta, color: 'var(--cm-meta)' },
  { tag: tags.comment, color: 'var(--cm-meta)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--cm-marker)', fontWeight: '600' },
  { tag: tags.contentSeparator, color: 'var(--cm-marker)' },
  { tag: tags.labelName, color: 'var(--cm-tag)' },
  { tag: tags.string, color: 'var(--cm-string)' },
  { tag: tags.number, color: 'var(--cm-number)' },
  { tag: tags.keyword, color: 'var(--cm-keyword)' },
]);

function baseTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--cm-fg)',
        backgroundColor: 'transparent',
        fontSize: '13.5px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.72',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '16px 0 48px',
        caretColor: 'var(--cm-cursor)',
      },
      '.cm-line': {
        padding: '0 20px 0 10px',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--cm-gutter-fg)',
        border: 'none',
        paddingLeft: '4px',
        userSelect: 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 10px',
        minWidth: '34px',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--cm-active)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'var(--cm-cursor)',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--cm-selection) !important',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--cm-cursor)',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'var(--cm-match)',
        outline: '1px solid var(--cm-cursor)',
      },
      '.cm-nonmatchingBracket': {
        color: 'var(--danger)',
      },
      '.cm-placeholder': {
        color: 'var(--cm-placeholder)',
        fontStyle: 'italic',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--panel-raised)',
        color: 'var(--ink)',
        border: '1px solid var(--border-strong)',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      },
      '.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--font-ui)',
        fontSize: '12.5px',
        maxHeight: '280px',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '4px 8px',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-contrast)',
      },
      '.cm-completionLabel': {
        fontFamily: 'var(--font-mono)',
      },
      '.cm-completionDetail': {
        color: 'var(--muted)',
        fontStyle: 'normal',
        marginLeft: '8px',
      },
      '.cm-completionInfo': {
        padding: '8px 10px',
        maxWidth: '320px',
        fontFamily: 'var(--font-ui)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--panel-raised)',
        color: 'var(--ink)',
      },
      '.cm-panel.cm-search input, .cm-panel.cm-search button': {
        fontFamily: 'var(--font-ui)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--cm-search)',
        outline: '1px solid var(--cm-search-border)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--cm-search-active)',
      },
      '.cm-lintRange-warning': {
        backgroundImage: 'none',
        textDecoration: 'underline wavy var(--warning)',
        textUnderlineOffset: '3px',
      },
      '.cm-lint-marker-warning': {
        content: 'none',
      },
      '.cm-gutter-lint': {
        width: '14px',
      },
      '.cm-tooltip-lint': {
        padding: '6px 8px',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--chip-bg)',
        color: 'var(--muted)',
        border: '1px solid var(--border)',
      },
    },
    { dark },
  );
}

export function editorTheme(dark: boolean): Extension {
  return [baseTheme(dark), syntaxHighlighting(highlightStyle)];
}
