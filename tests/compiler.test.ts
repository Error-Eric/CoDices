import { describe, expect, it } from 'vitest';
import { compileScenario, parseMarkerLine } from '../src/compiler/compiler';
import { splitFrontmatter } from '../src/compiler/frontmatter';
import { renderPage } from '../src/compiler/render';
import { slugify, UniqueIds } from '../src/compiler/slug';

describe('front matter', () => {
  it('reads title, system and tags', () => {
    const doc = compileScenario(
      '---\ntitle: Test\nsystem: CoC7e\ntags: [a, b]\n---\n\n# Heading\n',
    );
    expect(doc.title).toBe('Test');
    expect(doc.meta.system).toBe('CoC7e');
    expect(doc.tags).toEqual(['a', 'b']);
  });

  it('degrades malformed YAML to plain body', () => {
    const [meta, body] = splitFrontmatter('---\ntitle: [broken\n---\nbody');
    expect(meta).toEqual({});
    expect(body).toBe('body');
  });
});

describe('headings', () => {
  it('creates slug ids and de-duplicates them', () => {
    const doc = compileScenario('# Foo\n\n## Foo\n');
    expect(doc.bodyHtml).toContain('id="foo"');
    expect(doc.bodyHtml).toContain('id="foo-2"');
  });

  it('supports explicit heading ids', () => {
    const doc = compileScenario('## My Title {#custom}\n');
    expect(doc.bodyHtml).toContain('id="custom"');
    expect(doc.bodyHtml).not.toContain('{#custom}');
  });

  it('registers heading titles and #id as references', () => {
    const doc = compileScenario('# Hall\n\n@Hall and @#hall.\n');
    expect(doc.bodyHtml).toContain('href="#hall"');
    expect(doc.unresolved).toEqual([]);
  });

  it('slugifies CJK and punctuation', () => {
    expect(slugify('地点：书房')).toBe('地点-书房');
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(slugify('???')).toBe('section');
  });

  it('appends numeric suffixes for duplicate ids', () => {
    const ids = new UniqueIds();
    expect([ids.make('x'), ids.make('x'), ids.make('x')]).toEqual(['x', 'x-2', 'x-3']);
  });

  it('nests multi-layer sidebar chapters', () => {
    const doc = compileScenario('# Book\n\n## Part\n\n### Sub\n\n#### Leaf\n');
    expect(doc.sidebarHtml).toContain('class="toc-details toc-depth-0"');
    expect(doc.sidebarHtml).toContain('class="toc-details toc-depth-1"');
    expect(doc.sidebarHtml).toContain('class="toc-link toc-depth-2"');
    expect(doc.sidebarHtml).toContain('--toc-depth:2');
  });
});

describe('sync anchors', () => {
  it('tracks headings and generated blocks in full-source coordinates', () => {
    const source = [
      '---',
      'title: Test',
      '---',
      '',
      '# Chapter {#ch}',
      '',
      'text',
      '',
      '```aloud [voice]',
      'hello',
      '```',
      '',
      '> kp_notice [warn]',
      '> beware',
      '',
      '## Sub {#sub}',
      '',
      '```handout [letter]',
      'note',
      '```',
    ].join('\n');
    const doc = compileScenario(source);
    expect(doc.anchors).toEqual([
      { line: 4, id: 'ch', level: 1 },
      { line: 8, id: 'aloud-1', level: 0 },
      { line: 12, id: 'kp-1', level: 0 },
      { line: 15, id: 'sub', level: 2 },
      { line: 17, id: 'handout-1', level: 0 },
    ]);
  });

  it('marks each anchor in the generated body for preview discovery', () => {
    const doc = compileScenario('# Chapter {#ch}\n\n```aloud\nhi\n```\n');
    expect(doc.bodyHtml).toContain('<h1 id="ch" data-sync-anchor>');
    expect(doc.bodyHtml).toContain('id="aloud-1" data-sync-anchor');
  });
});

describe('cross references', () => {
  it('resolves forward references', () => {
    const doc = compileScenario('见 @later。\n\n```aloud [later]\nhello\n```\n');
    expect(doc.bodyHtml).toContain('href="#aloud-1"');
    expect(doc.bodyHtml).not.toContain('@later');
  });

  it('supports automatic aloud and keeper tags', () => {
    const doc = compileScenario(
      'See @aloud#1 and @kp_notice#1.\n\n```aloud\nhello\n```\n\n> kp_notice\n> warn\n',
    );
    expect(doc.bodyHtml).toContain('href="#aloud-1"');
    expect(doc.bodyHtml).toContain('href="#kp-1"');
    expect(doc.unresolved).toEqual([]);
  });

  it('renders multiple targets with a pager', () => {
    const doc = compileScenario('`A`[same]\n\n`B`[same]\n\n@same\n');
    expect(doc.bodyHtml).toContain('(1/2)');
    expect(doc.bodyHtml).toContain('data-targets=');
  });

  it('renders internal Markdown links as xrefs', () => {
    const doc = compileScenario('## 地点：书房\n\n参见 [书房](#地点-书房)。\n');
    expect(doc.bodyHtml).toContain('class="xref"');
    expect(doc.bodyHtml).toContain('>书房</a>');
    expect(doc.bodyHtml).not.toContain('</a></a>');
  });

  it('keeps unresolved tags as plain text', () => {
    const doc = compileScenario('@nope');
    expect(doc.bodyHtml).toContain('@nope');
    expect(doc.unresolved).toContain('nope');
  });
});

describe('TRPG blocks', () => {
  it('parses keeper markers', () => {
    expect(parseMarkerLine('kp_notice [warn]')).toEqual({
      kind: 'kp_notice',
      name: '',
      tag: 'warn',
    });
    expect(parseMarkerLine('守密人提示：注意')).toEqual({
      kind: 'kp_notice',
      name: '注意',
      tag: '',
    });
  });

  it('renders keeper notices', () => {
    const doc = compileScenario('> kp_notice [warn]\n> beware\n');
    expect(doc.bodyHtml).toContain('class="keeper"');
    expect(doc.bodyHtml).toContain('class="keeper-label">守密人提示</span>');
    expect(doc.bodyHtml).toContain('<span class="block-label">#1 · warn</span>');
    expect(doc.bodyHtml).toContain('beware');
  });

  it('keeps derived blockquote paragraphs and line breaks', () => {
    const doc = compileScenario('> kp_notice\n> 第一行\n> 第二行\n>\n> 第二段\n');
    expect(doc.bodyHtml).toContain('<p>第一行<br>');
    expect(doc.bodyHtml).toContain('第二行</p>');
    expect(doc.bodyHtml).toContain('<p>第二段</p>');
    expect(doc.bodyHtml).not.toContain('第一行\n第二行</p>');
  });

  it('renders NPC blocks with names as tags', () => {
    const doc = compileScenario('> NPC：教授 [prof]\n> note\n');
    expect(doc.bodyHtml).toContain('type-npc-entity');
    expect(doc.bodyHtml).toContain('data-name="NPC·教授"');
    expect(doc.bodyHtml).toContain('<span class="block-label">教授</span>');
    expect(doc.tagKeys.map((tag) => tag.key)).toContain('教授');
  });

  it('renders monsters and enemies', () => {
    const doc = compileScenario('> Mob：潜藏者 [lurker]\n> stats\n\n> 敌人：猎犬\n> stats\n');
    expect(doc.bodyHtml).toContain('data-name="Mob·潜藏者"');
    expect(doc.bodyHtml).toContain('data-name="敌人·猎犬"');
    expect(doc.bodyHtml).toContain('<span class="block-label">潜藏者</span>');
    expect(doc.bodyHtml).toContain('<span class="block-label">猎犬</span>');
    expect(doc.stats.entities).toBe(2);
  });

  it('renders clue spans', () => {
    const doc = compileScenario('找到`一封信`[letter]。\n');
    expect(doc.bodyHtml).toContain('class="clue"');
    expect(doc.bodyHtml).toContain('>一封信</span>');
    expect(doc.bodyHtml).toContain('id="clue-1"');
  });

  it('respects the clue negative lookahead for links', () => {
    const doc = compileScenario('`text`[not-a-clue](https://example.com)\n');
    expect(doc.bodyHtml).not.toContain('class="clue"');
  });

  it('renders handouts', () => {
    const doc = compileScenario('```handout [letter]\nhello\n```\n');
    expect(doc.bodyHtml).toContain('handout-block');
    expect(doc.bodyHtml).toContain('data-name="Handout·letter"');
    expect(doc.bodyHtml).toContain('<span class="block-label">letter</span>');
  });

  it('skips compile directives', () => {
    const doc = compileScenario('text\n\n<!-- compile: reset-aloud-counter -->\n');
    expect(doc.bodyHtml).not.toContain('compile:');
  });
});

describe('generated page', () => {
  it('is a complete self-contained document', () => {
    const html = renderPage(compileScenario('# Hi\n'));
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).toContain('class="topbar"');
    expect(html).toContain('id="tooltip"');
  });

  it('can preset a theme for the live editor preview', () => {
    const html = renderPage(compileScenario('# Hi\n'), { theme: 'dark' });
    expect(html).toContain('<html lang="zh-CN" data-theme="dark">');
  });

  it('styles scrollbars for both themes', () => {
    const html = renderPage(compileScenario('# Hi\n'));
    expect(html).toContain('scrollbar-width:thin');
    expect(html).toContain('::-webkit-scrollbar-thumb');
    expect(html).toContain('--scrollbar:#c7b8a2');
    expect(html).toContain('--scrollbar:#463c31');
  });

  it('ships both narrow-screen sidebar entry points and anchor scroll sync', () => {
    const html = renderPage(compileScenario('# Hi\n'));
    expect(html).toContain('id="sidebar-hotzone"');
    expect(html).toContain('id="sidebar-fab"');
    expect(html).toContain('CoDices:scrollToAnchor');
    expect(html).toContain('data-sync-anchor');
    expect(html).toContain('@media (max-width:1000px)');
    expect(html).toContain('.sidebar-fab{display:inline-flex');
    // The hotzone must not be hidden again at the phone breakpoint.
    expect(html).not.toContain('.sidebar-hotzone{display:none}');
  });

  it('builds sidebar, index and stats', () => {
    const source = [
      '# Scenario',
      '',
      '## 地点：书房',
      '',
      'A clue: `letter`[letter].',
      '',
      '> NPC：教授 [prof]',
      '> note',
      '',
      '> Mob：潜藏者 [lurker]',
      '> stats',
      '',
      '```aloud',
      'hello',
      '```',
    ].join('\n');
    const doc = compileScenario(source);
    expect(doc.sidebarHtml).toContain('地点：书房');
    expect(doc.indexHtml).toContain('NPC');
    expect(doc.indexHtml).toContain('怪物');
    expect(doc.indexHtml).toContain('线索');
    expect(doc.indexHtml).toContain('地点');
    expect(doc.stats).toMatchObject({
      headings: 2,
      aloud: 1,
      entities: 2,
      clues: 1,
      unresolved: 0,
    });
  });
});
