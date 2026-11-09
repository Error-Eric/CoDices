import './styles.css';
import sampleSource from './sample.md?raw';
import { compileScenario, escapeHtml, type CompiledDocument } from './compiler/compiler';
import { renderPage } from './compiler/render';
import type { Diagnostic } from '@codemirror/lint';
import { createEditor, type CursorInfo, type ScenarioEditor } from './editor/editor';
import { unresolvedDiagnostics } from './editor/diagnostics';
import { SNIPPETS, insertSnippet, wrapSelection, type SnippetDef } from './editor/snippets';
import { hydrateIcons, icon } from './ui/icons';

const STORAGE = {
  draft: 'CoDices:draft',
  filename: 'CoDices:filename',
  theme: 'CoDices:ui-theme',
  split: 'CoDices:split',
  view: 'CoDices:view',
  backup: 'CoDices:backup',
};

const NEW_DOCUMENT = `---
title: "未命名模组"
system: "Call of Cthulhu 7e"
author: ""
tags: []
---

# 未命名模组

从这里开始写你的模组。

## 调查员导入

向调查员宣读 @aloud#1，并确认他们是否已经找到 @first_clue。

\`\`\`aloud
调查员推开沉重的木门，潮湿的冷风从走廊深处涌出来。
\`\`\`

调查员在书桌上找到\`一张被撕碎又粘好的信\`[first_clue]。
`;

interface GuideCard {
  title: string;
  badge: string;
  syntax: string;
  description: string;
  snippetId?: string;
}

const GUIDE_CARDS: GuideCard[] = [
  {
    title: '文档信息',
    badge: 'front matter',
    syntax: '---\ntitle: "雾港的钟声"\nsystem: CoC7e\nauthor: "编者"\ntags: ["调查", "封闭场景"]\n---',
    description: '可选的 YAML 头。title 决定页面标题，system 显示为副标题，其余字段进入元信息栏。',
  },
  {
    title: '标题与章节',
    badge: '# heading',
    syntax: '## 地点：雾港图书馆 {#loc_library}\n\n标题后的第一段会作为章节预览。',
    description: '标题会自动注册为 @标题原文 与 @#slug 两个标签；也可以显式指定 id。',
    snippetId: 'location',
  },
  {
    title: '交叉引用',
    badge: '@ tag',
    syntax: '调查员找到了 @torn_letter，参见 @#loc_study。',
    description: '两遍解析，前向引用也可用。输入 @ 时编辑器会根据全文已有标签自动补全；同一标签有多个目标时滚轮或点击切换。',
    snippetId: 'xref',
  },
  {
    title: '行内线索',
    badge: '`clue`[tag]',
    syntax: '她发现`一封被撕碎又粘好的信`[torn_letter]。',
    description: '行内代码后紧跟 [tag] 会成为可跳转、可悬浮预览的线索。链接语法 [文字](url) 不会被误判。',
    snippetId: 'clue',
  },
  {
    title: '宣读框',
    badge: 'aloud',
    syntax: '```aloud [entry_hall]\n你推开沉重的橡木门……\n```',
    description: '默认折叠，带首行预览与一键复制。内容按纯文本渲染，不解析 Markdown。自动标签为 aloud#1、aloud#2……',
    snippetId: 'aloud',
  },
  {
    title: '守密人提示',
    badge: 'kp_notice',
    syntax: '> kp_notice [ambush_warning]\n>\n> 如果调查员停留超过一轮，潜藏者会突袭。\n>\n> HP 减少 **2**。',
    description: '黄色提示卡，默认展开，内容支持行内 Markdown。也可写作 > 守密人提示。自动标签 kp_notice#1……',
    snippetId: 'kp_notice',
  },
  {
    title: 'NPC / 怪物 / 敌人',
    badge: 'NPC · Mob',
    syntax: '> NPC：史密斯教授 [professor_smith]\n>\n> *被星之彩寄生的宿主*\n>\n> STR：50 DEX：50 POW：70\n>\n> 扮演建议：说话时夹杂拉丁语引文。\n\n> Mob：潜藏者 [lurker]\n> HP：18',
    description: '首行的名字与 [tag] 都会注册为引用标签，并自动进入 NPC / 怪物索引。',
    snippetId: 'npc',
  },
  {
    title: 'Handout',
    badge: 'handout',
    syntax: '```handout [letter]\n致亲爱的埃利亚斯：\n不要相信钟声。\n```',
    description: '玩家道具、信件与图片。默认展开，带复制按钮，适合直接投喂给玩家。',
    snippetId: 'handout',
  },
  {
    title: '自动标签',
    badge: 'auto tag',
    syntax: '@aloud#1  @kp_notice#2  @npc  @lurker',
    description: '两种块会生成全局递增的自动标签；用 @ 引用它们即可。标题、NPC 名字、线索标签也都是可直接引用的标签。',
  },
  {
    title: '索引与导航',
    badge: 'generated',
    syntax: '无需手写。编译器会自动生成：\n\n· 章节侧边栏\n· NPC / 怪物 / 线索 / 地点索引\n· 顶栏筛选、明暗主题、折叠与高亮跳转',
    description: '把 NPC、怪物和 handout 放在正文第一次出场的位置即可；索引会自动汇总，不需要另建附录。',
  },
];

const app = document.getElementById('app') as HTMLDivElement;
const workspace = document.getElementById('workspace') as HTMLElement;
const editorPane = document.getElementById('editor-pane') as HTMLElement;
const previewPane = document.getElementById('preview-pane') as HTMLElement;
const workspaceBar = document.querySelector('.workspace-bar') as HTMLElement;
const editorHost = document.getElementById('editor-host') as HTMLElement;
const splitter = document.getElementById('splitter') as HTMLDivElement;
const previewFrame = document.getElementById('preview-frame') as HTMLIFrameElement;
const previewFrameWrap = document.getElementById('preview-frame-wrap') as HTMLDivElement;
const previewStage = document.getElementById('preview-stage') as HTMLDivElement;
const previewError = document.getElementById('preview-error') as HTMLDivElement;
const previewErrorText = document.getElementById('preview-error-text') as HTMLPreElement;
const docTitle = document.getElementById('doc-title') as HTMLSpanElement;
const docSystem = document.getElementById('doc-system') as HTMLSpanElement;
const saveState = document.getElementById('save-state') as HTMLSpanElement;
const storageStatus = document.getElementById('storage-status') as HTMLSpanElement;
const cursorStatus = document.getElementById('cursor-status') as HTMLSpanElement;
const charStatus = document.getElementById('char-status') as HTMLSpanElement;
const statHeadings = document.getElementById('stat-headings') as HTMLElement;
const statBlocks = document.getElementById('stat-blocks') as HTMLElement;
const statClues = document.getElementById('stat-clues') as HTMLElement;
const statEntities = document.getElementById('stat-entities') as HTMLElement;
const issuesStatus = document.getElementById('issues-status') as HTMLButtonElement;
const issuesText = document.getElementById('issues-text') as HTMLSpanElement;
const btnTheme = document.getElementById('btn-theme') as HTMLButtonElement;
const btnInsert = document.getElementById('btn-insert') as HTMLButtonElement;
const insertMenu = document.getElementById('insert-menu') as HTMLDivElement;
const insertMenuList = document.getElementById('insert-menu-list') as HTMLDivElement;
const insertWrap = btnInsert.closest('.insert-wrap') as HTMLDivElement;
const guideDialog = document.getElementById('guide-dialog') as HTMLDialogElement;
const guideGrid = document.getElementById('guide-grid') as HTMLDivElement;
const toastHost = document.getElementById('toast-host') as HTMLDivElement;
const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const btnDevice = document.getElementById('btn-device') as HTMLButtonElement;
const btnRestore = document.getElementById('btn-restore') as HTMLButtonElement;

let editor: ScenarioEditor | null = null;
let currentDoc: CompiledDocument | null = null;
let source = '';
let fileName = '';
let theme: 'light' | 'dark' = 'light';
let splitPercent = 50;
let currentView: 'editor' | 'split' | 'preview' = 'split';
let compileTimer: number | null = null;
let saveTimer: number | null = null;
let lastDiagnostics: Diagnostic[] = [];
let previewScroll = 0;
let pendingScroll: number | null = 0;
let deviceMode = false;
let dragDepth = 0;
let lastMobile = window.matchMedia('(max-width: 860px)').matches;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function initialTheme(): 'light' | 'dark' {
  const attr = document.documentElement.dataset.theme;
  return attr === 'dark' ? 'dark' : 'light';
}

function initialView(): 'editor' | 'split' | 'preview' {
  const saved = readStorage(STORAGE.view);
  return saved === 'editor' || saved === 'split' || saved === 'preview' ? saved : 'split';
}

function initialSplit(): number {
  const value = Number(readStorage(STORAGE.split));
  return Number.isFinite(value) && value >= 26 && value <= 74 ? value : 50;
}

function loadInitialSource(): { source: string; fileName: string; restored: boolean } {
  const draft = readStorage(STORAGE.draft);
  if (draft !== null) {
    return {
      source: draft,
      fileName: readStorage(STORAGE.filename) ?? '',
      restored: true,
    };
  }
  return { source: sampleSource, fileName: '', restored: false };
}

function applyTheme(next: 'light' | 'dark', persist = true): void {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  theme = next;
  root.dataset.theme = next;
  root.style.colorScheme = next;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', next === 'dark' ? '#1c1814' : '#f7f1e7');
  btnTheme.innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
  btnTheme.setAttribute('title', next === 'dark' ? '切换明亮主题' : '切换暗色主题');
  btnTheme.setAttribute('aria-label', next === 'dark' ? '切换明亮主题' : '切换暗色主题');
  editor?.setTheme(next === 'dark');
  postThemeToPreview();
  if (persist) writeStorage(STORAGE.theme, next);
  // Commit the new palette first, then re-enable hover transitions.
  void root.offsetWidth;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => root.classList.remove('theme-switching'));
  });
}

function postToPreview(message: Record<string, unknown>): void {
  try {
    previewFrame.contentWindow?.postMessage(message, '*');
  } catch {
    // The preview may not have loaded yet.
  }
}

function postThemeToPreview(): void {
  postToPreview({ type: 'CoDices:theme', theme });
}

function updateCursor(info: CursorInfo): void {
  const selected = info.selected ? `，选中 ${info.selected} 字` : '';
  cursorStatus.textContent = `行 ${info.line}，列 ${info.column}${selected}`;
}

function updateCharStatus(value: string): void {
  const length = [...value].length;
  charStatus.textContent = `${length.toLocaleString('zh-CN')} 字`;
}

function updateDocMeta(doc: CompiledDocument): void {
  const title = doc.title || '未命名模组';
  const system = String(doc.meta.system ?? 'Markdown → 交互式 H5');
  docTitle.textContent = title;
  docSystem.textContent = system;
  document.title = `${title} · CoDices`;
}

function updateStats(doc: CompiledDocument): void {
  statHeadings.textContent = String(doc.stats.headings);
  statBlocks.textContent = String(doc.stats.aloud + doc.stats.kp);
  statClues.textContent = String(doc.stats.clues);
  statEntities.textContent = String(doc.stats.entities);

  const issues = doc.stats.unresolved;
  issuesStatus.hidden = issues === 0;
  issuesText.textContent = `${issues} 个未解析引用`;
  issuesStatus.title = issues
    ? `有 ${issues} 个 @标签 找不到目标，点击跳到第一个`
    : '';
}

function setSaveState(message: string): void {
  saveState.textContent = message;
}

function markDirty(): void {
  setSaveState('正在编辑…');
  storageStatus.textContent = '未保存更改';
}

function persistDraft(): void {
  const ok = writeStorage(STORAGE.draft, source);
  if (fileName) writeStorage(STORAGE.filename, fileName);
  else removeStorage(STORAGE.filename);

  if (!ok) {
    setSaveState('本机保存失败');
    storageStatus.textContent = '浏览器存储不可用';
    return;
  }

  const time = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  setSaveState(`已保存 ${time}`);
  storageStatus.textContent = `草稿已保存到本机 · ${time}`;
}

function scheduleDraftSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    persistDraft();
  }, 420);
}

function scheduleCompile(): void {
  if (compileTimer !== null) window.clearTimeout(compileTimer);
  compileTimer = window.setTimeout(() => {
    compileTimer = null;
    compileNow();
  }, 180);
}

function compileNow(initial = false): void {
  if (!editor) return;
  source = editor.getValue();

  try {
    const doc = compileScenario(source);
    currentDoc = doc;
    lastDiagnostics = unresolvedDiagnostics(source, doc);
    editor.setDiagnostics(lastDiagnostics);
    updateDocMeta(doc);
    updateStats(doc);
    updateCharStatus(source);

    previewError.hidden = true;
    pendingScroll = initial ? 0 : previewScroll;
    if (initial) previewScroll = 0;
    previewFrame.srcdoc = renderPage(doc, { theme, scrollY: pendingScroll });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    previewErrorText.textContent = message;
    previewError.hidden = false;
  }
}

function setupPreviewFrame(): void {
  // The preview is sandboxed without same-origin access, so scroll state and
  // theme updates travel via postMessage instead of touching the frame DOM.
  window.addEventListener('message', (event) => {
    if (event.source !== previewFrame.contentWindow) return;
    const data = event.data as { type?: unknown; y?: unknown } | null;
    if (data?.type === 'CoDices:scroll' && typeof data.y === 'number' && Number.isFinite(data.y)) {
      previewScroll = data.y;
    }
  });

  previewFrame.addEventListener('load', () => {
    postThemeToPreview();
    if (pendingScroll !== null) {
      postToPreview({ type: 'CoDices:scrollTo', y: pendingScroll });
      pendingScroll = null;
    }
  });
}

function updateViewButtons(): void {
  const mobileActive = currentView === 'split' && window.matchMedia('(max-width: 860px)').matches
    ? 'editor'
    : currentView;
  document.querySelectorAll<HTMLButtonElement>('.view-button').forEach((button) => {
    const active = button.dataset.view === currentView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  document.querySelectorAll<HTMLButtonElement>('.mobile-view-switch button').forEach((button) => {
    const active = button.dataset.view === mobileActive;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setView(view: 'editor' | 'split' | 'preview', persist = true): void {
  currentView = view;
  app.dataset.view = view;
  setInsertMenuOpen(false);
  // The tools belong to whichever pane is showing: the editor card in
  // editor/split view, the preview card when the editor is hidden.
  const barHost = view === 'preview' ? previewPane : editorPane;
  if (workspaceBar.parentElement !== barHost) {
    barHost.prepend(workspaceBar);
  }
  updateViewButtons();
  if (persist) writeStorage(STORAGE.view, view);

  window.requestAnimationFrame(() => {
    editor?.view.requestMeasure();
  });
}

function ensureEditorVisible(): void {
  if (currentView === 'preview') setView('editor');
}

function applySplit(percent: number): void {
  splitPercent = Math.min(74, Math.max(26, percent));
  workspace.style.setProperty('--editor-pct', `${splitPercent}%`);
}

function setupSplitter(): void {
  let dragging = false;
  let startX = 0;
  let startPercent = 50;

  splitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startPercent = splitPercent;
    splitter.setPointerCapture(event.pointerId);
    document.body.classList.add('is-resizing');
    event.preventDefault();
  });

  splitter.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = workspace.getBoundingClientRect();
    const delta = ((event.clientX - startX) / rect.width) * 100;
    applySplit(startPercent + delta);
  });

  const stopDragging = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('is-resizing');
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
    writeStorage(STORAGE.split, String(Math.round(splitPercent)));
  };

  splitter.addEventListener('pointerup', stopDragging);
  splitter.addEventListener('pointercancel', stopDragging);

  splitter.addEventListener('dblclick', () => {
    applySplit(50);
    writeStorage(STORAGE.split, '50');
  });

  splitter.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 5 : 2;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      applySplit(splitPercent - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      applySplit(splitPercent + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      applySplit(30);
    } else if (event.key === 'End') {
      event.preventDefault();
      applySplit(70);
    } else {
      return;
    }
    writeStorage(STORAGE.split, String(Math.round(splitPercent)));
  });
}

function renderInsertMenu(): void {
  const groups = new Map<string, SnippetDef[]>();
  for (const snippet of SNIPPETS) {
    const bucket = groups.get(snippet.group) ?? [];
    bucket.push(snippet);
    groups.set(snippet.group, bucket);
  }

  insertMenuList.innerHTML = [...groups.entries()]
    .map(
      ([group, snippets]) => `
        <div class="menu-group">
          <div class="menu-group-title">${escapeHtml(group)}</div>
          ${snippets
            .map(
              (snippet) => `
                <button class="menu-item" type="button" role="menuitem" data-snippet="${snippet.id}">
                  <span class="menu-item-icon">${icon(snippet.icon, 16)}</span>
                  <span class="menu-item-copy">
                    <strong>${escapeHtml(snippet.label)}</strong>
                    <small>${escapeHtml(snippet.hint)}</small>
                  </span>
                </button>`,
            )
            .join('')}
        </div>`,
    )
    .join('');
}

function setInsertMenuOpen(open: boolean, focusFirst = false): void {
  insertMenu.hidden = !open;
  btnInsert.setAttribute('aria-expanded', open ? 'true' : 'false');
  insertWrap.classList.toggle('is-open', open);
  if (open && focusFirst) {
    window.requestAnimationFrame(() => {
      insertMenu.querySelector<HTMLButtonElement>('.menu-item')?.focus();
    });
  }
}

function renderGuide(): void {
  guideGrid.innerHTML = GUIDE_CARDS.map(
    (card) => `
      <article class="guide-card">
        <div class="guide-card-head">
          <div>
            <span class="guide-badge">${escapeHtml(card.badge)}</span>
            <h3>${escapeHtml(card.title)}</h3>
          </div>
          ${
            card.snippetId
              ? `<button class="mini-button" type="button" data-guide-snippet="${card.snippetId}">插入</button>`
              : ''
          }
        </div>
        <pre><code>${escapeHtml(card.syntax)}</code></pre>
        <p>${escapeHtml(card.description)}</p>
      </article>`,
  ).join('');
}

function openGuide(): void {
  if (!guideDialog.open) guideDialog.showModal();
}

function toast(message: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const element = document.createElement('div');
  element.className = `toast toast-${kind}`;
  element.innerHTML = `<span class="toast-icon">${icon(
    kind === 'success' ? 'checkCircle' : kind === 'warning' || kind === 'error' ? 'alert' : 'sparkles',
    16,
  )}</span><span class="toast-text"></span>`;
  const text = element.querySelector('.toast-text');
  if (text) text.textContent = message;
  toastHost.appendChild(element);
  window.setTimeout(() => {
    element.classList.add('is-leaving');
    window.setTimeout(() => element.remove(), 220);
  }, 2800);
}

function selectSnippet(id: string): void {
  const snippet = SNIPPETS.find((item) => item.id === id);
  if (!snippet || !editor) return;
  ensureEditorVisible();
  setInsertMenuOpen(false);
  if (guideDialog.open) guideDialog.close();
  insertSnippet(editor.view, snippet);
  window.requestAnimationFrame(() => editor?.focus());
}

function safeBaseName(title: string): string {
  return (
    title
      .trim()
      .replace(/[\\/:*?"<>|\r\n]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 80) || 'scenario'
  );
}

function download(text: string, name: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function saveMarkdown(): void {
  if (!editor) return;
  source = editor.getValue();
  const base = fileName || `${safeBaseName(currentDoc?.title || 'scenario')}.md`;
  download(source, base, 'text/markdown;charset=utf-8');
  persistDraft();
  toast(`已保存 ${base}`, 'success');
}

function exportHtml(): void {
  if (!editor) return;
  try {
    const doc = compileScenario(editor.getValue());
    const name = `${safeBaseName(doc.title || 'scenario')}.html`;
    download(renderPage(doc), name, 'text/html;charset=utf-8');
    toast(`已导出 ${name}`, 'success');
  } catch (error) {
    toast(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function popoutPreview(): void {
  if (!editor) return;
  try {
    const doc = compileScenario(editor.getValue());
    const blob = new Blob([renderPage(doc)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank');
    if (opened) {
      opened.opener = null;
    } else {
      toast('浏览器拦截了新窗口，请允许弹出窗口后重试。', 'warning');
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    toast(`无法打开预览：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

interface DraftBackup {
  source: string;
  fileName: string;
  savedAt: string;
}

function readBackup(): DraftBackup | null {
  const raw = readStorage(STORAGE.backup);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DraftBackup>;
    if (typeof parsed.source !== 'string') return null;
    return {
      source: parsed.source,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}

function backupTimeLabel(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return '上一份';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function refreshRestoreButton(): void {
  const backup = readBackup();
  btnRestore.hidden = !backup;
  if (backup) {
    btnRestore.title = `恢复 ${backupTimeLabel(backup.savedAt)} 的本机备份`;
  }
}

function backupCurrent(): void {
  try {
    localStorage.setItem(
      STORAGE.backup,
      JSON.stringify({ source, fileName, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Backups are best-effort only.
  }
  refreshRestoreButton();
}

function restoreBackup(): void {
  const backup = readBackup();
  if (!backup) {
    refreshRestoreButton();
    toast('没有可恢复的本机备份。', 'warning');
    return;
  }

  const label = backupTimeLabel(backup.savedAt);
  if (
    !window.confirm(
      `用 ${label} 的本机备份替换当前内容？\n\n当前内容会先备份，因此仍可再恢复回来。`,
    )
  ) {
    return;
  }

  replaceDocument(backup.source, backup.fileName, `已恢复 ${label} 的本机备份`);
}

function replaceDocument(value: string, name: string, message: string): void {
  if (!editor) return;
  backupCurrent();
  fileName = name;
  if (compileTimer !== null) {
    window.clearTimeout(compileTimer);
    compileTimer = null;
  }
  previewScroll = 0;
  pendingScroll = 0;
  editor.setValue(value);
  source = value;
  updateCharStatus(value);
  compileNow(true);
  persistDraft();
  toast(message, 'success');
}

function newDocument(): void {
  replaceDocument(NEW_DOCUMENT, '', '已新建空白模组；上一份草稿已备份到本机。');
}

function loadSample(): void {
  replaceDocument(sampleSource, '', '已载入内置示例；上一份草稿已备份到本机。');
}

async function openFile(file: File): Promise<void> {
  if (!/\.(md|markdown|txt)$/i.test(file.name) && !file.type.startsWith('text/')) {
    toast('请选择 Markdown 或纯文本文件。', 'warning');
    return;
  }
  try {
    const text = await file.text();
    replaceDocument(text, file.name, `已打开 ${file.name}`);
  } catch (error) {
    toast(`无法读取文件：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

function toggleDeviceMode(): void {
  deviceMode = !deviceMode;
  previewFrameWrap.classList.toggle('is-mobile', deviceMode);
  previewStage.classList.toggle('is-mobile', deviceMode);
  btnDevice.classList.toggle('is-active', deviceMode);
  btnDevice.setAttribute('aria-pressed', deviceMode ? 'true' : 'false');
  toast(deviceMode ? '已切换为手机宽度预览' : '已切换为桌面预览');
}

function setupDropZone(): void {
  window.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    dropOverlay.classList.add('is-visible');
  });
  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.classList.remove('is-visible');
  });
  window.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files[0];
    if (!file) return;
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.classList.remove('is-visible');
    void openFile(file);
  });
}

function setupHeaderActions(): void {
  document.getElementById('btn-guide')?.addEventListener('click', openGuide);
  document.getElementById('btn-guide-close')?.addEventListener('click', () => guideDialog.close());

  btnRestore.addEventListener('click', restoreBackup);
  document.getElementById('btn-sample')?.addEventListener('click', loadSample);
  document.getElementById('btn-new')?.addEventListener('click', newDocument);
  document.getElementById('btn-open')?.addEventListener('click', () => fileInput.click());
  document.getElementById('btn-save')?.addEventListener('click', saveMarkdown);
  document.getElementById('btn-export')?.addEventListener('click', exportHtml);
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    compileNow();
    toast('预览已重新编译');
  });
  document.getElementById('btn-popout')?.addEventListener('click', popoutPreview);
  btnDevice.addEventListener('click', toggleDeviceMode);
  btnTheme.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void openFile(file);
  });

  document.querySelectorAll<HTMLButtonElement>('.view-button, .mobile-view-switch button').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.view;
      if (view === 'editor' || view === 'split' || view === 'preview') setView(view);
    });
  });

  document.getElementById('btn-bold')?.addEventListener('click', () => {
    ensureEditorVisible();
    editor?.toggleBold();
  });
  document.getElementById('btn-italic')?.addEventListener('click', () => {
    ensureEditorVisible();
    editor?.toggleItalic();
  });
  document.getElementById('btn-code')?.addEventListener('click', () => {
    if (!editor) return;
    ensureEditorVisible();
    wrapSelection(editor.view, '`', '`', '代码');
  });
  document.getElementById('btn-xref')?.addEventListener('click', () => selectSnippet('xref'));

  btnInsert.addEventListener('click', () => setInsertMenuOpen(insertMenu.hidden));
  btnInsert.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setInsertMenuOpen(true, true);
    }
  });
  insertMenuList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-snippet]');
    if (button?.dataset.snippet) selectSnippet(button.dataset.snippet);
  });
  insertMenu.addEventListener('keydown', (event) => {
    const items = [...insertMenu.querySelectorAll<HTMLButtonElement>('.menu-item')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setInsertMenuOpen(false);
      btnInsert.focus();
    } else if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      items[(index + 1 + items.length) % items.length].focus();
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    }
  });

  guideGrid.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-guide-snippet]');
    if (button?.dataset.guideSnippet) selectSnippet(button.dataset.guideSnippet);
  });

  guideDialog.addEventListener('click', (event) => {
    if (event.target === guideDialog) guideDialog.close();
  });

  issuesStatus.addEventListener('click', () => {
    if (!editor || !lastDiagnostics.length) return;
    ensureEditorVisible();
    const diagnostic = lastDiagnostics[0];
    editor.view.dispatch({
      selection: { anchor: diagnostic.from, head: diagnostic.to },
      scrollIntoView: true,
    });
    editor.focus();
    toast('已跳到第一个未解析引用', 'warning');
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    if (!insertWrap.contains(event.target)) setInsertMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && !event.shiftKey && key === 's') {
      event.preventDefault();
      saveMarkdown();
    } else if (mod && event.shiftKey && key === 'e') {
      event.preventDefault();
      exportHtml();
    } else if (mod && !event.shiftKey && key === 'o') {
      event.preventDefault();
      fileInput.click();
    } else if (mod && key === '/') {
      event.preventDefault();
      openGuide();
    } else if (event.altKey && !mod && (key === '1' || key === '2' || key === '3')) {
      event.preventDefault();
      setView(key === '1' ? 'editor' : key === '2' ? 'split' : 'preview');
    } else if (event.key === 'Escape') {
      setInsertMenuOpen(false);
    }
  });

  window.addEventListener('beforeunload', () => {
    try {
      localStorage.setItem(STORAGE.draft, editor?.getValue() ?? source);
    } catch {
      // Ignore.
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && editor) persistDraft();
  });

  window.addEventListener('resize', () => {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    if (mobile !== lastMobile) {
      lastMobile = mobile;
      updateViewButtons();
      window.requestAnimationFrame(() => editor?.view.requestMeasure());
    }
  });
}

function init(): void {
  hydrateIcons();
  theme = initialTheme();
  splitPercent = initialSplit();
  applyTheme(theme, false);
  applySplit(splitPercent);

  const initial = loadInitialSource();
  source = initial.source;
  fileName = initial.fileName;

  renderInsertMenu();
  renderGuide();
  setupPreviewFrame();
  setupSplitter();
  setupDropZone();
  setupHeaderActions();
  refreshRestoreButton();

  editor = createEditor(editorHost, {
    value: source,
    dark: theme === 'dark',
    getTags: () => currentDoc?.tagKeys ?? [],
    onChange: (value) => {
      source = value;
      updateCharStatus(value);
      markDirty();
      scheduleCompile();
      scheduleDraftSave();
    },
    onCursor: updateCursor,
  });

  currentView = initialView();
  setView(currentView, false);
  updateCharStatus(source);
  compileNow(true);
  persistDraft();
  if (initial.restored) {
    setSaveState('已恢复本机草稿');
    storageStatus.textContent = '草稿已从本机恢复';
  } else {
    setSaveState('示例已载入');
    storageStatus.textContent = '示例已载入，编辑后自动保存';
  }
}

init();
