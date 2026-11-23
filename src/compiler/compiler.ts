/**
 * Core compiler: two-pass Markdown -> structured HTML body.
 *
 * Pass A registers every tag (headings, aloud boxes, kp_notice/NPC blocks and
 * inline clues) so forward references work. Pass B builds the document tree
 * and resolves `@tag` references against the registry.
 */

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { splitFrontmatter, type FrontMatter } from './frontmatter';
import { UniqueIds, slugify } from './slug';
import {
  TagRegistry,
  tagTarget,
  type TagEntry,
  type TagKeyInfo,
  type TagType,
} from './tags';

const KP_RE = /^(kp_notice|守密人提示)(?=$|[\s:：])/;
const NPC_KW_RE = /^(NPC|Mob|敌人)(?=$|[\s:：])/;
const TAG_TAIL_RE = /\[([^\[\]]+)\]\s*$/;
const HEADING_ATTR_RE = /\{\s*#\s*([^}\s]+)\s*\}\s*$/;
const FENCE_TAG_RE = /\[([^\[\]]+)\]/;
const COMPILE_RE = /<!--\s*compile:/;
const XREF_RE = /@(#?[\p{L}\p{N}\p{M}_-]+(?:#[\p{L}\p{N}\p{M}_-]+)?)/gu;
const CLUE_TAG_RE = /^\[([^\[\]\s]+)\](?!\()/;
const ATTRIBUTE_ESCAPE_RE = /[&<>"']/g;
const TEXT_ESCAPE_RE = /[&<>"']/g;
const SKILL_DIFFICULTY_RE = /^(常规|困难|极难)\s*[·:：]?\s*/u;
const SKILL_SPECIALTY_RE = /[（(][^（）()]*[）)]\s*$/u;
const SKILL_CHECK_SUFFIX_RE = /检定\s*$/u;
const ENTITY_STAT_NUMBER_RE =
  /^\s*([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff· _-]{0,15}?)\s*[:：=]?\s*([-+]?\d+(?:\.\d+)?%?)\s*$/u;
const ENTITY_STAT_QUOTED_RE =
  /^\s*([A-Za-z\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff· _-]{0,15}?)\s*[:：=]?\s*["“](.*?)["”]\s*$/u;
const ENTITY_SEPARATOR_RE = /^[\s,，、;；/|·。！？.!?]*$/u;

/**
 * CoC characteristics get compact stat chips. Everything else (derived or
 * custom values such as HP, MP, SAN, DB, 移动, 护甲) becomes a meta row.
 */
const STANDARD_ATTRIBUTES = new Set([
  'STR', 'CON', 'SIZ', 'DEX', 'INT', 'POW', 'APP', 'EDU', 'LUCK', 'LCK', 'CHR',
  '力量', '体质', '体型', '敏捷', '智力', '意志', '外貌', '教育', '幸运', '魅力',
]);

const PREVIEW_LIMIT = 80;

const NPC_PREFIX: Record<string, string> = {
  npc: 'NPC',
  mob: 'Mob',
  enemy: '敌人',
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(TEXT_ESCAPE_RE, (ch) => ESCAPES[ch]);
}

export function escapeAttr(value: string): string {
  return value.replace(ATTRIBUTE_ESCAPE_RE, (ch) => ESCAPES[ch]);
}

function trunc(text: string, limit = PREVIEW_LIMIT): string {
  const trimmed = text.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}……` : trimmed;
}

/** Number of complete lines removed from `source` to produce `body`. */
function prefixLineCount(source: string, body: string): number {
  let lines = 0;
  const limit = source.length - body.length;
  for (let i = 0; i < limit; i += 1) {
    if (source.charCodeAt(i) === 10) lines += 1;
  }
  return lines;
}

interface BlockMetaBase {
  entry: TagEntry;
  /** Compact label for the block header; the type badge already names the kind. */
  shortLabel: string;
  copy: string;
  preview: string;
}

interface FenceMeta extends BlockMetaBase {
  kind: 'aloud' | 'handout';
}

interface BlockquoteMeta extends BlockMetaBase {
  kind: 'kp_notice' | 'npc' | 'mob' | 'enemy';
}

interface ClueMeta {
  tag: string;
  targetId: string;
  label: string;
  preview: string;
  entry: TagEntry;
}

interface HeadingMeta {
  level: number;
  id: string;
  title: string;
}

interface ChapterNode {
  kind: 'chapter';
  level: number;
  id: string;
  title: string;
  titleHtml: string;
  children: TreeNode[];
}

interface HtmlNode {
  kind: 'html';
  html: string;
}

type TreeNode = ChapterNode | HtmlNode;

export interface HeadingInfo {
  level: number;
  id: string;
  title: string;
}

/**
 * A source location that also exists as a DOM element in the compiled page.
 *
 * The editor/preview scroll bridge uses these anchors to translate a source
 * line into a rendered position (and back) instead of trusting the global
 * scroll ratio. `line` is 0-based and includes any front-matter lines.
 */
export interface AnchorInfo {
  line: number;
  id: string;
  /** Heading level (1-6), or 0 for a generated block. */
  level: number;
}

export interface CompileStats {
  headings: number;
  aloud: number;
  kp: number;
  entities: number;
  clues: number;
  handouts: number;
  unresolved: number;
  characters: number;
}

/** Minimal rulebook skill data used by skill-check hover cards. */
export interface SkillReference {
  id: string;
  name: string;
  base?: string;
  description?: string;
}

/** Skill data embedded into a compiled document for its hover cards. */
export interface CompiledSkillRef {
  id: string;
  name: string;
  base: string;
  description: string;
}

export interface CompileOptions {
  /**
   * Rulebook skills used to recognise `*困难侦查*` skill checks. When omitted,
   * italics are rendered normally.
   */
  skills?: SkillReference[];
}

export interface CompiledDocument {
  title: string;
  meta: FrontMatter;
  tags: string[];
  bodyHtml: string;
  sidebarHtml: string;
  indexHtml: string;
  summary: string;
  unresolved: string[];
  tagKeys: TagKeyInfo[];
  headings: HeadingInfo[];
  anchors: AnchorInfo[];
  /** Rulebook entries referenced by skill checks, in first-use order. */
  skills: CompiledSkillRef[];
  stats: CompileStats;
}

export interface MarkerInfo {
  kind: BlockquoteMeta['kind'] | null;
  name: string;
  tag: string;
}

/** Parse a blockquote's first line into an entity marker. */
export function parseMarkerLine(line: string): MarkerInfo {
  const text = line.trim();
  let kind: BlockquoteMeta['kind'];
  let rest: string;

  const kp = KP_RE.exec(text);
  if (kp) {
    kind = 'kp_notice';
    rest = text.slice(kp[0].length).trim();
  } else {
    const npc = NPC_KW_RE.exec(text);
    if (!npc) return { kind: null, name: '', tag: '' };
    const keyword = npc[1];
    rest = text.slice(npc[0].length).trim();
    kind = keyword === 'NPC' ? 'npc' : keyword === 'Mob' ? 'mob' : 'enemy';
  }

  if (rest.startsWith('：') || rest.startsWith(':')) {
    rest = rest.slice(1).trim();
  }

  let tag = '';
  const tagMatch = TAG_TAIL_RE.exec(rest);
  if (tagMatch) {
    tag = tagMatch[1];
    rest = rest.slice(0, tagMatch.index).trim();
  }
  return { kind, name: rest, tag };
}

function parseFenceInfo(info: string): { kind: string; tag: string } {
  const parts = info.trim().split(/\s+/, 2);
  const kind = parts[0] ?? '';
  let tag = '';
  if ((kind === 'aloud' || kind === 'handout') && parts[1]) {
    const match = FENCE_TAG_RE.exec(parts[1]);
    if (match) tag = match[1];
  }
  return { kind, tag };
}

interface EntityStatMatch {
  label: string;
  value: string;
}

/**
 * Recognise character-card stats written as inline code:
 * `STR 50`, `力量 70`, `STR "=POW"`, `移动 "流动 12 / 飞行 70"`.
 */
function parseEntityStat(text: string): EntityStatMatch | null {
  const quoted = ENTITY_STAT_QUOTED_RE.exec(text);
  if (quoted) {
    return { label: quoted[1].trim(), value: quoted[2] };
  }
  const number = ENTITY_STAT_NUMBER_RE.exec(text);
  if (number) {
    return { label: number[1].trim(), value: number[2] };
  }
  return null;
}

function isStandardAttribute(label: string): boolean {
  return STANDARD_ATTRIBUTES.has(label.trim().toUpperCase());
}

function firstLineSplit(children: Token[]): [Token[], Token[]] {
  for (let i = 0; i < children.length; i += 1) {
    const token = children[i];
    if (token.type === 'softbreak' || token.type === 'hardbreak') {
      return [children.slice(0, i), children.slice(i + 1)];
    }
  }
  return [children, []];
}

function cloneToken(token: Token): Token {
  const clone = Object.assign(
    Object.create(Object.getPrototypeOf(token) as object),
    token,
  ) as Token;
  clone.attrs = token.attrs ? token.attrs.map((pair) => [...pair] as [string, string]) : null;
  clone.children = token.children ? [...token.children] : null;
  return clone;
}

class Compiler {
  private readonly md: MarkdownIt;
  private readonly env: Record<string, unknown> = {};

  private readonly registry = new TagRegistry();
  private readonly ids = new UniqueIds();

  private aloudCount = 0;
  private kpCount = 0;
  private npcCount = 0;
  private clueCount = 0;
  private handoutCount = 0;

  private currentHeadingTitle = '';

  private headings: HeadingInfo[] = [];
  private anchors: AnchorInfo[] = [];
  /** Line count of the stripped front matter, so anchors use full-source lines. */
  private lineOffset = 0;
  private readonly headingMeta = new Map<Token, HeadingMeta>();
  private readonly fenceMeta = new Map<Token, FenceMeta>();
  private readonly blockquoteMeta = new Map<Token, BlockquoteMeta>();
  private readonly clueMeta = new Map<Token, ClueMeta>();
  private readonly skillByName = new Map<string, SkillReference>();
  private readonly usedSkills = new Map<string, CompiledSkillRef>();

  private readonly indexNpc: TagEntry[] = [];
  private readonly indexMonster: TagEntry[] = [];
  private readonly clueIndex = new Map<string, TagEntry>();
  private readonly locations: Array<{ title: string; id: string; preview: string }> = [];
  private readonly unresolved = new Set<string>();

  constructor(options: CompileOptions = {}) {
    this.md = new MarkdownIt('commonmark');
    this.md.enable('table');
    this.md.enable('strikethrough');

    for (const skill of options.skills ?? []) {
      const name = skill.name?.trim();
      if (!name) continue;
      this.skillByName.set(name.toLowerCase(), skill);
    }
  }

  compile(source: string): CompiledDocument {
    const [meta, body] = splitFrontmatter(source);
    this.lineOffset = prefixLineCount(source, body);
    const tokens = this.md.parse(body, this.env);

    this.registerPass(tokens);
    const tree = this.buildTree(tokens);

    const bodyHtml = this.renderTree(tree);
    const sidebarHtml = this.renderSidebar(tree);
    const indexHtml = this.renderIndex();

    const tags = Array.isArray(meta.tags)
      ? meta.tags.map((item) => String(item))
      : [];

    return {
      title: typeof meta.title === 'string' ? meta.title : '',
      meta: Object.fromEntries(Object.entries(meta).filter(([key]) => key !== 'title')),
      tags,
      bodyHtml,
      sidebarHtml,
      indexHtml,
      summary: this.summary(tokens),
      unresolved: [...this.unresolved].sort(),
      tagKeys: this.registry.keys(),
      headings: this.headings,
      anchors: [...this.anchors].sort((a, b) => a.line - b.line),
      skills: [...this.usedSkills.values()],
      stats: {
        headings: this.headings.length,
        aloud: this.aloudCount,
        kp: this.kpCount,
        entities: this.npcCount,
        clues: this.clueCount,
        handouts: this.handoutCount,
        unresolved: this.unresolved.size,
        characters: [...body].length,
      },
    };
  }

  // ------------------------------------------------------------------ //
  // Pass A: registration
  // ------------------------------------------------------------------ //
  private registerPass(tokens: Token[]): void {
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type === 'heading_open') {
        this.registerHeading(tokens, i);
        i += 3;
      } else if (token.type === 'fence') {
        this.registerFence(token);
        i += 1;
      } else if (token.type === 'blockquote_open') {
        const [inlineTokens, closeIndex] = this.collectBlockquote(tokens, i);
        this.registerBlockquote(token, inlineTokens);
        for (const inline of inlineTokens) {
          this.scanClues(inline.children ?? []);
        }
        i = closeIndex + 1;
      } else if (token.type === 'inline') {
        this.scanClues(token.children ?? []);
        i += 1;
      } else {
        i += 1;
      }
    }
  }

  private registerHeading(tokens: Token[], index: number): void {
    const openToken = tokens[index];
    const inlineToken = tokens[index + 1];
    const level = Number(openToken.tag.slice(1));
    const { title, explicitId } = this.headingTitle(inlineToken);
    const id = this.ids.make(explicitId || slugify(title));

    this.currentHeadingTitle = title;

    const preview = trunc(this.sectionPreview(tokens, index + 3));
    const entry: TagEntry = {
      type: 'section',
      label: title,
      targetId: id,
      preview,
      number: 0,
      name: '',
      keys: [`#${id}`, title],
    };
    this.registry.register(entry);
    this.headingMeta.set(openToken, { level, id, title });
    this.headings.push({ level, id, title });
    this.anchors.push({
      line: this.lineOffset + (openToken.map?.[0] ?? 0),
      id,
      level,
    });

    if (title.startsWith('地点：') || title.startsWith('地点:')) {
      const locationTitle = title.split('：').slice(-1)[0].split(':').slice(-1)[0].trim();
      this.locations.push({ title: locationTitle, id, preview });
    }
  }

  private headingTitle(inlineToken: Token): { title: string; explicitId: string } {
    const raw = this.plain(inlineToken.children ?? []).trim();
    const match = HEADING_ATTR_RE.exec(raw);
    if (match) {
      return {
        title: raw.slice(0, match.index).trim(),
        explicitId: match[1],
      };
    }
    return { title: raw, explicitId: '' };
  }

  private sectionPreview(tokens: Token[], start: number): string {
    let i = start;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type === 'inline') {
        const text = this.firstNonemptyLine(token.children ?? []);
        if (text) return text;
        i += 1;
      } else if (token.type === 'heading_open') {
        break;
      } else if (token.type === 'fence') {
        i += 1;
      } else if (token.type === 'blockquote_open') {
        const level = token.level;
        i += 1;
        while (
          i < tokens.length
          && !(tokens[i].type === 'blockquote_close' && tokens[i].level === level)
        ) {
          i += 1;
        }
        i += 1;
      } else {
        i += 1;
      }
    }
    return '';
  }

  private firstNonemptyLine(children: Token[]): string {
    const text = this.plain(children);
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) return line.trim();
    }
    return '';
  }

  private summary(tokens: Token[]): string {
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token.type === 'heading_open') {
        i += 2;
        continue;
      }
      if (token.type === 'inline' && token.children) {
        const text = this.plain(token.children).trim();
        if (text) return trunc(text, 160);
      }
    }
    return '';
  }

  private registerFence(token: Token): void {
    const { kind, tag } = parseFenceInfo(token.info);
    if (kind === 'aloud') {
      this.aloudCount += 1;
      const number = this.aloudCount;
      const preview = trunc(token.content.split('\n', 1)[0]);
      const label = `向调查员宣读 #${number}${tag ? ` · ${tag}` : ''}`;
      const entry: TagEntry = {
        type: 'aloud',
        label,
        targetId: `aloud-${number}`,
        preview,
        number,
        name: tag,
        keys: [...(tag ? [tag] : []), `aloud#${number}`],
      };
      this.registry.register(entry);
      this.fenceMeta.set(token, {
        kind: 'aloud',
        entry,
        shortLabel: `#${number}${tag ? ` · ${tag}` : ''}`,
        copy: token.content,
        preview,
      });
    } else if (kind === 'handout') {
      this.handoutCount += 1;
      const entry: TagEntry = {
        type: 'handout',
        label: `Handout${tag ? `·${tag}` : ''}`,
        targetId: `handout-${this.handoutCount}`,
        preview: trunc(token.content.split('\n', 1)[0]),
        number: this.handoutCount,
        name: tag,
        keys: tag ? [tag] : [],
      };
      this.registry.register(entry);
      this.fenceMeta.set(token, {
        kind: 'handout',
        entry,
        shortLabel: tag || `#${this.handoutCount}`,
        copy: token.content,
        preview: entry.preview,
      });
    }

    const registered = this.fenceMeta.get(token);
    if (registered) {
      this.anchors.push({
        line: this.lineOffset + (token.map?.[0] ?? 0),
        id: registered.entry.targetId,
        level: 0,
      });
    }
  }

  private registerBlockquote(openToken: Token, inlineTokens: Token[]): void {
    const { kind, name, tag } = this.detectBlockquoteKind(inlineTokens);
    if (!kind) return;

    let entry: TagEntry;
    if (kind === 'kp_notice') {
      this.kpCount += 1;
      const number = this.kpCount;
      entry = {
        type: 'kp_notice',
        label: `守密人提示 #${number}${tag ? ` · ${tag}` : ''}`,
        targetId: `kp-${number}`,
        preview: this.blockquotePreview(inlineTokens, name),
        number,
        name: tag,
        keys: [tag, `kp_notice#${number}`].filter(Boolean),
      };
    } else {
      this.npcCount += 1;
      const number = this.npcCount;
      const prefix = NPC_PREFIX[kind] ?? 'NPC';
      entry = {
        type: kind,
        label: name ? `${prefix}·${name}` : `${prefix} #${number}`,
        targetId: `npc-${number}`,
        preview: this.blockquotePreview(inlineTokens, name),
        number,
        name,
        keys: [tag, name].filter(Boolean),
      };
      if (kind === 'npc') this.indexNpc.push(entry);
      else this.indexMonster.push(entry);
    }

    this.registry.register(entry);
    this.blockquoteMeta.set(openToken, {
      kind,
      entry,
      shortLabel: kind === 'kp_notice'
        ? `#${entry.number}${tag ? ` · ${tag}` : ''}`
        : name || tag || `#${entry.number}`,
      copy: this.blockquoteCopy(inlineTokens),
      preview: entry.preview,
    });
    this.anchors.push({
      line: this.lineOffset + (openToken.map?.[0] ?? 0),
      id: entry.targetId,
      level: 0,
    });
  }

  private detectBlockquoteKind(inlineTokens: Token[]): MarkerInfo {
    if (!inlineTokens.length) return { kind: null, name: '', tag: '' };
    const [firstLine] = firstLineSplit(inlineTokens[0].children ?? []);
    return parseMarkerLine(this.plain(firstLine));
  }

  private blockquoteContentChunks(inlineTokens: Token[]): Token[][] {
    const chunks: Token[][] = [];
    inlineTokens.forEach((inline, index) => {
      const children = inline.children ?? [];
      if (index === 0) {
        const [, rest] = firstLineSplit(children);
        if (rest.length) chunks.push(rest);
      } else if (children.length) {
        chunks.push(children);
      }
    });
    return chunks;
  }

  private blockquotePreview(inlineTokens: Token[], name: string): string {
    let text = this.blockquoteContentChunks(inlineTokens)
      .map((chunk) => this.plain(chunk).trim())
      .filter(Boolean)
      .join(' ');
    if (name && !text.startsWith(name)) text = `${name} ${text}`.trim();
    return trunc(text);
  }

  private blockquoteCopy(inlineTokens: Token[]): string {
    return this.blockquoteContentChunks(inlineTokens)
      .map((chunk) => this.plain(chunk))
      .filter((part) => part.trim())
      .join('\n\n');
  }

  private scanClues(children: Token[]): void {
    let i = 0;
    while (i < children.length) {
      const token = children[i];
      if (token.type === 'code_inline') {
        const match = Compiler.clueMatch(children, i);
        if (match) {
          const tag = match[1];
          this.clueCount += 1;
          const number = this.clueCount;
          const targetId = `clue-${number}`;
          const label = `线索·${tag}`;
          const preview = `在${this.currentHeadingTitle || '文档开头'}被发现。`;
          const entry: TagEntry = {
            type: 'clue',
            label,
            targetId,
            preview,
            number,
            name: tag,
            keys: [tag],
          };
          this.registry.register(entry);
          this.clueMeta.set(token, { tag, targetId, label, preview, entry });
          if (!this.clueIndex.has(tag)) this.clueIndex.set(tag, entry);
          i += 2;
          continue;
        }
      }
      i += 1;
    }
  }

  private static clueMatch(children: Token[], index: number): RegExpExecArray | null {
    const token = children[index];
    if (token.type !== 'code_inline') return null;
    const next = children[index + 1];
    if (!next || next.type !== 'text') return null;
    return CLUE_TAG_RE.exec(next.content);
  }

  // ------------------------------------------------------------------ //
  // Pass B: build tree & render
  // ------------------------------------------------------------------ //
  private buildTree(tokens: Token[]): TreeNode[] {
    const root: TreeNode[] = [];
    const stack: Array<{ level: number; children: TreeNode[] }> = [
      { level: -1, children: root },
    ];

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.type === 'heading_open') {
        const meta = this.headingMeta.get(token);
        if (!meta) {
          i += 1;
          continue;
        }
        const node: ChapterNode = {
          kind: 'chapter',
          level: meta.level,
          id: meta.id,
          title: meta.title,
          titleHtml: this.renderHeadingTitle(tokens[i + 1]),
          children: [],
        };
        while (stack.length && stack[stack.length - 1].level >= node.level) {
          stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push({ level: node.level, children: node.children });
        i += 3;
      } else {
        const [chunk, next] = this.renderBlock(tokens, i);
        if (chunk !== null) stack[stack.length - 1].children.push({ kind: 'html', html: chunk });
        i = next;
      }
    }
    return root;
  }

  private renderHeadingTitle(inlineToken: Token): string {
    return this.renderInline(this.stripAttrSuffix(inlineToken.children ?? []));
  }

  private stripAttrSuffix(children: Token[]): Token[] {
    const out = [...children];
    const last = out[out.length - 1];
    if (last && last.type === 'text') {
      const match = HEADING_ATTR_RE.exec(last.content);
      if (match) {
        const clone = cloneToken(last);
        clone.content = last.content.slice(0, match.index).trimEnd();
        out[out.length - 1] = clone;
      }
    }
    return out;
  }

  private renderBlock(tokens: Token[], index: number): [string | null, number] {
    const token = tokens[index];
    const type = token.type;

    if (type === 'fence') {
      const meta = this.fenceMeta.get(token);
      if (meta) return [this.renderFenceBlock(meta, token), index + 1];
      return [this.renderRule(tokens, index), index + 1];
    }

    if (type === 'blockquote_open') {
      const meta = this.blockquoteMeta.get(token);
      if (meta) {
        const [inlineTokens, closeIndex] = this.collectBlockquote(tokens, index);
        return [this.renderSpecialBlockquote(meta, inlineTokens), closeIndex + 1];
      }
      return [this.md.renderer.renderToken(tokens, index, this.md.options), index + 1];
    }

    if (type === 'html_block') {
      if (COMPILE_RE.test(token.content)) return [null, index + 1];
      return [this.renderRule(tokens, index), index + 1];
    }

    if (type === 'inline') {
      return [this.renderInline(token.children ?? []), index + 1];
    }

    return [this.renderRule(tokens, index), index + 1];
  }

  private renderRule(tokens: Token[], index: number): string {
    const rule = this.md.renderer.rules[tokens[index].type];
    if (rule) {
      return rule(tokens, index, this.md.options, this.env, this.md.renderer);
    }
    return this.md.renderer.renderToken(tokens, index, this.md.options);
  }

  private renderFenceBlock(meta: FenceMeta, token: Token): string {
    const { entry } = meta;
    const copySource = escapeAttr(meta.copy);

    if (meta.kind === 'aloud') {
      return (
        `<section class="block aloud-block" id="${escapeAttr(entry.targetId)}" data-sync-anchor `
        + `data-copy-src="${copySource}" data-name="${escapeAttr(entry.label)}" data-type="aloud">`
        + '<details><summary>'
        + '<span class="type-badge type-aloud">宣读</span>'
        + `<span class="block-label">${escapeHtml(meta.shortLabel)}</span>`
        + `<span class="block-preview">${escapeHtml(meta.preview)}</span>`
        + '<button class="copy-btn" type="button">复制</button></summary>'
        + `<pre class="aloud-content">${escapeHtml(token.content)}</pre>`
        + '</details></section>'
      );
    }

    return (
      `<section class="block handout-block" id="${escapeAttr(entry.targetId)}" data-sync-anchor `
      + `data-copy-src="${copySource}" data-name="${escapeAttr(entry.label)}" data-type="handout">`
      + '<details open><summary>'
      + '<span class="type-badge type-handout">Handout</span>'
      + `<span class="block-label">${escapeHtml(meta.shortLabel)}</span>`
      + '<button class="copy-btn" type="button">复制</button></summary>'
      + `<pre class="handout-content">${escapeHtml(token.content)}</pre>`
      + '</details></section>'
    );
  }

  private renderSpecialBlockquote(meta: BlockquoteMeta, inlineTokens: Token[]): string {
    const { entry, kind } = meta;
    const content = kind === 'kp_notice'
      ? this.renderBlockquoteContent(inlineTokens)
      : this.renderEntityContent(inlineTokens);
    const name = escapeAttr(entry.label);
    const copySource = escapeAttr(meta.copy);

    if (kind === 'kp_notice') {
      return (
        `<section class="keeper" id="${escapeAttr(entry.targetId)}" data-sync-anchor `
        + `data-copy-src="${copySource}" data-name="${name}" data-type="kp_notice">`
        + '<details open><summary class="keeper-head">'
        + '<span class="keeper-label">守密人提示</span>'
        + `<span class="block-label">${escapeHtml(meta.shortLabel)}</span>`
        + '<button class="copy-btn" type="button">复制</button></summary>'
        + `<div class="keeper-body">${content}</div>`
        + '</details></section>'
      );
    }

    const badgeByKind: Record<string, [string, string]> = {
      npc: ['NPC', 'type-npc'],
      mob: ['Mob', 'type-myth'],
      enemy: ['敌人', 'type-myth'],
    };
    const badge = badgeByKind[kind] ?? ['NPC', 'type-npc'];
    return (
      `<section class="entity ${badge[1]}-entity" id="${escapeAttr(entry.targetId)}" data-sync-anchor `
      + `data-copy-src="${copySource}" data-name="${name}" data-type="${kind}">`
      + '<details open><summary class="entity-head">'
      + `<span class="type-badge ${badge[1]}">${badge[0]}</span>`
      + `<span class="block-label">${escapeHtml(meta.shortLabel)}</span>`
      + '<button class="copy-btn" type="button">复制</button></summary>'
      + `<div class="entity-body">${content}</div>`
      + '</details></section>'
    );
  }

  /**
   * Entity cards pull character stats out of inline code. CoC characteristics
   * become compact stat chips; derived and custom values become meta rows.
   */
  private renderEntityContent(inlineTokens: Token[]): string {
    const stats: Array<[string, string]> = [];
    const meta: Array<[string, string]> = [];
    const paragraphs: string[] = [];

    for (const chunk of this.blockquoteContentChunks(inlineTokens)) {
      const kept: Token[] = [];
      for (const token of chunk) {
        if (token.type === 'code_inline') {
          const match = parseEntityStat(token.content);
          if (match) {
            if (isStandardAttribute(match.label)) stats.push([match.label, match.value]);
            else meta.push([match.label, match.value]);
            continue;
          }
        }
        kept.push(token);
      }

      if (!kept.length) continue;
      const text = this.plain(kept);
      if (!text.trim() || ENTITY_SEPARATOR_RE.test(text)) continue;
      const html = this.renderInline(kept, true);
      if (html) paragraphs.push(`<p>${html}</p>`);
    }

    const statHtml = stats.length
      ? '<div class="char-stat-grid">'
        + stats.map(([label, value]) => (
          '<div class="char-stat">'
          + `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`
          + '</div>'
        )).join('')
        + '</div>'
      : '';
    const metaHtml = meta.length
      ? '<dl class="char-meta">'
        + meta.map(([label, value]) => (
          '<div class="char-meta-row">'
          + `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
          + '</div>'
        )).join('')
        + '</dl>'
      : '';

    return `${paragraphs.join('\n')}${statHtml}${metaHtml}`;
  }

  private renderBlockquoteContent(inlineTokens: Token[]): string {
    return this.blockquoteContentChunks(inlineTokens)
      .filter((chunk) => this.plain(chunk).trim().length > 0)
      .map((chunk) => `<p>${this.renderInline(chunk, true)}</p>`)
      .join('\n');
  }

  // ------------------------------------------------------------------ //
  // Inline rendering
  // ------------------------------------------------------------------ //
  private renderInline(children: Token[], softbreakAsBreak = false): string {
    const out: string[] = [];
    let i = 0;
    while (i < children.length) {
      const token = children[i];
      const type = token.type;

      if (type === 'text') {
        out.push(this.renderText(token.content));
      } else if (type === 'code_inline') {
        const clue = this.clueMeta.get(token);
        if (clue) {
          const match = Compiler.clueMatch(children, i);
          const rest = match && children[i + 1] ? children[i + 1].content.slice(match[0].length) : '';
          out.push(this.renderClue(clue, token.content));
          if (rest) out.push(this.renderText(rest));
          i += 2;
          continue;
        }
        out.push(`<code>${escapeHtml(token.content)}</code>`);
      } else if (type === 'em_open') {
        const close = this.findEmClose(children, i);
        if (close > i) {
          const inner = children.slice(i + 1, close);
          const match = this.matchSkill(this.plain(inner));
          if (match) {
            out.push(this.renderSkillCheck(match, inner));
            i = close + 1;
            continue;
          }
        }
        out.push('<em>');
      } else if (type === 'strong_open') {
        out.push('<strong>');
      } else if (type === 's_open') {
        out.push('<s>');
      } else if (type === 'em_close' || type === 'strong_close' || type === 's_close') {
        out.push(type === 'em_close' ? '</em>' : type === 'strong_close' ? '</strong>' : '</s>');
      } else if (type === 'link_open') {
        out.push(this.renderLinkOpen(token));
      } else if (type === 'link_close') {
        out.push('</a>');
      } else if (type === 'image') {
        const src = token.attrGet('src') ?? '';
        out.push(
          `<img class="handout-img" src="${escapeAttr(src)}" alt="${escapeAttr(token.content)}">`,
        );
      } else if (type === 'softbreak') {
        out.push(softbreakAsBreak ? '<br>\n' : '\n');
      } else if (type === 'hardbreak') {
        out.push('<br>\n');
      } else if (type === 'html_inline') {
        out.push(token.content);
      }
      i += 1;
    }
    return out.join('');
  }

  private findEmClose(children: Token[], start: number): number {
    let depth = 0;
    for (let i = start + 1; i < children.length; i += 1) {
      if (children[i].type === 'em_open') depth += 1;
      else if (children[i].type === 'em_close') {
        if (depth === 0) return i;
        depth -= 1;
      }
    }
    return -1;
  }

  private matchSkill(text: string): { skill: SkillReference; difficulty: string } | null {
    if (!this.skillByName.size) return null;
    let value = text.trim();
    if (!value) return null;

    let difficulty = '';
    const diff = SKILL_DIFFICULTY_RE.exec(value);
    if (diff) {
      difficulty = diff[1];
      value = value.slice(diff[0].length).trim();
    }

    value = value.replace(SKILL_CHECK_SUFFIX_RE, '').trim();
    value = value.replace(SKILL_SPECIALTY_RE, '').trim();
    if (!value) return null;

    const skill = this.skillByName.get(value.toLowerCase());
    return skill ? { skill, difficulty } : null;
  }

  private renderSkillCheck(
    match: { skill: SkillReference; difficulty: string },
    inner: Token[],
  ): string {
    const { skill, difficulty } = match;
    const id = skill.id || skill.name;
    if (!this.usedSkills.has(id)) {
      this.usedSkills.set(id, {
        id,
        name: skill.name,
        base: skill.base ?? '',
        description: trunc(skill.description ?? '', 220),
      });
    }
    const difficultyAttr = difficulty
      ? ` data-skill-difficulty="${escapeAttr(difficulty)}"`
      : '';
    return `<span class="skill-check" tabindex="0" role="note" `
      + `data-skill="${escapeAttr(id)}"${difficultyAttr}>${this.renderInline(inner)}</span>`;
  }

  private renderText(text: string): string {
    const regex = new RegExp(XREF_RE.source, 'gu');
    const out: string[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      out.push(escapeHtml(text.slice(last, match.index)));
      out.push(this.renderXref(match[1]));
      last = match.index + match[0].length;
    }
    out.push(escapeHtml(text.slice(last)));
    return out.join('');
  }

  private renderXref(key: string): string {
    const entries = this.registry.resolve(key);
    if (!entries.length) {
      this.unresolved.add(key);
      return escapeHtml(`@${key}`);
    }
    return this.makeXref(entries);
  }

  private makeXref(entries: TagEntry[]): string {
    const label = entries[0].label;
    const display = entries.length === 1 ? label : `${label} (1/${entries.length})`;
    const targets = JSON.stringify(entries.map(tagTarget));
    return (
      `<a class="xref" href="#${escapeAttr(entries[0].targetId)}" `
      + 'data-index="0" '
      + `data-targets="${escapeAttr(targets)}" `
      + `data-label="${escapeAttr(label)}">${escapeHtml(display)}</a>`
    );
  }

  private renderClue(clue: ClueMeta, code: string): string {
    return (
      `<span class="clue" id="${escapeAttr(clue.targetId)}" `
      + `title="${escapeAttr(clue.label)}">${escapeHtml(code)}</span>`
    );
  }

  private renderLinkOpen(token: Token): string {
    const href = token.attrGet('href') ?? '';
    if (href.startsWith('#')) {
      let fragment = href.slice(1);
      try {
        fragment = decodeURIComponent(fragment);
      } catch {
        // Keep the raw fragment when it is not valid percent-encoding.
      }
      const entries = this.registry.resolve(`#${fragment}`);
      if (entries.length) {
        const targets = JSON.stringify(entries.map(tagTarget));
        return (
          `<a class="xref" href="#${escapeAttr(entries[0].targetId)}" `
          + 'data-index="0" '
          + `data-targets="${escapeAttr(targets)}" `
          + `data-label="${escapeAttr(entries[0].label)}">`
        );
      }
    }
    return `<a${this.md.renderer.renderAttrs(token)}>`;
  }

  // ------------------------------------------------------------------ //
  // Chapter tree & sidebar rendering
  // ------------------------------------------------------------------ //
  private renderTree(nodes: TreeNode[]): string {
    return nodes
      .map((node) => (node.kind === 'html' ? node.html : this.renderChapter(node)))
      .join('\n');
  }

  private renderChapter(node: ChapterNode): string {
    const headingTag = `h${node.level}`;
    const head = (
      '<div class="chapter-head">'
      + `<${headingTag} id="${escapeAttr(node.id)}" data-sync-anchor>${node.titleHtml}</${headingTag}>`
      + '<button class="fold-toggle" type="button" aria-label="折叠章节" aria-expanded="true">'
      + '<span class="fold-chevron" aria-hidden="true">▾</span>'
      + '</button>'
      + '</div>'
    );
    const body = (
      '<div class="chapter-body"><div class="chapter-body-inner">'
      + `${this.renderTree(node.children)}</div></div>`
    );
    return `<section class="chapter">${head}${body}</section>`;
  }

  private renderSidebar(nodes: TreeNode[]): string {
    let toc = nodes.filter((node): node is ChapterNode => node.kind === 'chapter');
    if (toc.length === 1 && toc[0].children.length) {
      toc = toc[0].children.filter((node): node is ChapterNode => node.kind === 'chapter');
    }
    const actions = (
      '<div class="sidebar-actions">'
      + '<button id="toc-expand" type="button">全部展开</button>'
      + '<button id="toc-collapse" type="button">全部折叠</button></div>'
    );
    const groups = toc.map((node) => this.renderTocNode(node, 0)).join('');
    return `${actions}${groups}<a class="toc-link toc-depth-0" style="--toc-depth:0" href="#index-top">索引</a>`;
  }

  private renderTocNode(node: ChapterNode, depth: number): string {
    const children = node.children.filter(
      (child): child is ChapterNode => child.kind === 'chapter',
    );
    const level = Math.min(depth, 5);
    const depthStyle = `--toc-depth:${level}`;
    const classes = `toc-depth-${level}`;

    if (!children.length) {
      return `<a class="toc-link ${classes}" style="${depthStyle}" `
        + `href="#${escapeAttr(node.id)}">${escapeHtml(node.title)}</a>`;
    }

    const links = children.map((child) => this.renderTocNode(child, depth + 1)).join('');
    return `<details class="toc-details ${classes}" style="${depthStyle}" open>`
      + '<summary>'
      + `<span class="toc-summary-label">${escapeHtml(node.title)}</span>`
      + `<a class="toc-jump" href="#${escapeAttr(node.id)}" title="跳到本节" `
      + `aria-label="跳到本节：${escapeAttr(node.title)}">↗</a>`
      + `</summary>${links}</details>`;
  }

  // ------------------------------------------------------------------ //
  // Index rendering
  // ------------------------------------------------------------------ //
  private renderIndex(): string {
    const groups: Array<[string, TagEntry[]]> = [
      ['NPC', this.indexNpc],
      ['怪物', this.indexMonster],
      ['线索', [...this.clueIndex.values()]],
      [
        '地点',
        this.locations.map((location) => ({
          type: 'section' as TagType,
          label: location.title,
          targetId: location.id,
          preview: location.preview,
          number: 0,
          name: '',
          keys: [],
        })),
      ],
    ];

    const out = ['<section class="index"><h2 id="index-top">索引</h2>'];
    for (const [title, entries] of groups) {
      if (!entries.length) continue;
      const links = entries.map((entry) => this.makeXref([entry])).join('');
      out.push(`<div class="index-group"><h3>${title}</h3><p>${links}</p></div>`);
    }
    out.push('</section>');
    return out.join('\n');
  }

  // ------------------------------------------------------------------ //
  // Utilities
  // ------------------------------------------------------------------ //
  private collectBlockquote(tokens: Token[], index: number): [Token[], number] {
    const level = tokens[index].level;
    const inlineTokens: Token[] = [];
    let j = index + 1;
    while (j < tokens.length) {
      const token = tokens[j];
      if (token.type === 'blockquote_close' && token.level === level) {
        return [inlineTokens, j];
      }
      if (token.type === 'inline') inlineTokens.push(token);
      j += 1;
    }
    return [inlineTokens, tokens.length - 1];
  }

  private plain(children: Token[]): string {
    const parts: string[] = [];
    for (const token of children ?? []) {
      if (token.type === 'text' || token.type === 'code_inline') {
        parts.push(token.content);
      } else if (token.type === 'softbreak' || token.type === 'hardbreak') {
        parts.push('\n');
      } else if (token.type === 'image') {
        parts.push(token.content);
      } else if (token.children) {
        parts.push(this.plain(token.children));
      }
    }
    return parts.join('');
  }
}

export function compileScenario(source: string, options: CompileOptions = {}): CompiledDocument {
  return new Compiler(options).compile(source);
}
