/**
 * Build the rulebook dataset from the local source texts.
 *
 * `prompts/` is intentionally gitignored: the source chapters are copyrighted
 * and must not be published with the repository. This script therefore reads
 * them only when they are present and emits a small JSON payload for the
 * `/rulebook/` page. When the source is absent (for example in a clean CI
 * checkout) it writes an empty, well-formed payload so the page can show a
 * helpful "not generated" state instead of failing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'prompts', 'rulebook');
const OUTPUT_DIR = path.join(ROOT, 'public', 'rulebook');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'rulebook-data.json');

const SKILLS_FILE = path.join(SOURCE_DIR, 'Skills-zh-CN.md');
const MONSTERS_FILE = path.join(SOURCE_DIR, 'Monsters-Beasts-and-Alien-Gods-zh-CN.md');
const APPENDIX_FILE = path.join(SOURCE_DIR, 'Appendix-zh-CN.md');

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function linesOf(text) {
  return text.split(/\r?\n/);
}

function compact(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function paragraphText(value) {
  return compact(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const SKILL_HEADING_RE =
  /^([^\s（][^（]*?)(?:（专攻）)?（([^（）]+%)）(?:\s*\[([^\]]+)\])?\s*$/;

const SKILL_LABELS = [
  '对抗技能/难度等级',
  '对抗技能',
  '常规难度',
  '困难难度',
  '极难难度',
  '孤注一掷的例子',
  '孤注一掷失败的范例结果',
  '注释',
  '译注',
];

const SKILL_SPECIALTY_NAMES = new Set([
  '艺术与手艺',
  '格斗',
  '射击',
  '其他语言',
  '科学',
  '生存',
]);

function splitSkillLines(lines) {
  const headings = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.length > 48) continue;
    if (line.includes('—见') || line.includes('图例') || line.includes('Ω')) continue;
    if ((line.match(/（/g) || []).length > 2) continue;
    const match = SKILL_HEADING_RE.exec(line);
    if (!match) continue;
    headings.push({
      line: i,
      name: match[1].trim(),
      base: match[2].trim(),
      tag: match[3] ?? '',
      specialty: line.includes('（专攻）'),
    });
  }

  const skills = [];
  for (let h = 0; h < headings.length; h += 1) {
    const heading = headings[h];
    const start = heading.line + 1;
    const end = h + 1 < headings.length ? headings[h + 1].line : lines.length;
    let block = lines.slice(start, end);

    if (heading.name === '估价') {
      block = deinterleaveValuation(block);
    }
    if (heading.name === '艺术与手艺') {
      block = trimArtCraftSidebar(block);
    }

    block = block.filter((line) => {
      const text = line.trim();
      if (!text) return false;
      if (text.includes('图例') || text.includes('Ω')) return false;
      if (/（(?:\d+%|DEX一半的%|EDU%|各种各样%)）\s*$/.test(text) && text !== heading.name) {
        return false;
      }
      return true;
    });

    const paragraphs = normalizeSkillParagraphs(block);
    const { description, sections } = splitSkillSections(paragraphs);
    const tags = [];
    if (heading.tag) tags.push(heading.tag);
    if (heading.specialty || SKILL_SPECIALTY_NAMES.has(heading.name)) tags.push('专攻');

    skills.push({
      id: `skill-${h + 1}`,
      name: heading.name,
      base: normalizeSkillBase(heading.base),
      baseRaw: heading.base,
      tags: [...new Set(tags)],
      description,
      sections,
      sourceLine: heading.line + 1,
    });
  }
  return skills;
}

/**
 * The 估价 entry is split by a two-column skill table in the source. Drop the
 * table and recombine the left/right columns of the continuation lines.
 */
function deinterleaveValuation(block) {
  const legend = block.findIndex((line) => line.includes('图例'));
  let resume = -1;
  if (legend >= 0) {
    resume = block.findIndex((line, i) => i > legend && line.trim().startsWith('物品的年龄'));
  }
  const before = legend >= 0 ? block.slice(0, legend) : block;
  const after = resume >= 0 ? block.slice(resume) : [];

  const left = [];
  const right = [];
  for (const raw of [...before, ...after]) {
    const line = raw.trim();
    if (!line) continue;
    const fields = line.split(/\s{2,}/).filter(Boolean);
    if (fields.length > 1) {
      left.push(fields[0]);
      right.push(fields.slice(1).join(' '));
    } else {
      left.push(line);
    }
  }
  return [...left, ...right];
}

/**
 * The 艺术与手艺 entry has a social-skills sidebar interleaved into its
 * per-specialty examples. Keep the main entry (which is complete) and stop
 * before the interleaved appendix.
 */
function trimArtCraftSidebar(block) {
  const cut = block.findIndex((line) => line.trim().startsWith('校注：'));
  const trimmed = cut >= 0 ? block.slice(0, cut) : block;

  // The specialty list is extracted one item per line; join it for display.
  const start = trimmed.findIndex((line) => line.includes('例如：'));
  const end = trimmed.findIndex(
    (line, index) => index > start && line.trim().startsWith('许多这些例子'),
  );
  if (start >= 0 && end > start) {
    const items = trimmed
      .slice(start + 1, end)
      .map((line) => line.trim())
      .filter(Boolean);
    return [
      ...trimmed.slice(0, start),
      `${trimmed[start].trim()}${items.join('、')}。`,
      ...trimmed.slice(end),
    ];
  }
  return trimmed;
}

function isSkillLabel(line) {
  if (SKILL_LABELS.some((label) => line.startsWith(label))) return true;
  if (/^如果一个疯狂的调查员/.test(line)) return true;
  if (/^[^，。；：\s]{1,14}：$/.test(line)) return true;
  return false;
}

function normalizeSkillParagraphs(blockLines) {
  const out = [];
  let buffer = '';

  const flush = () => {
    const text = compact(buffer);
    if (text) out.push(text);
    buffer = '';
  };

  for (const raw of blockLines) {
    const line = raw.trim();
    if (!line) continue;
    if (isSkillLabel(line)) {
      flush();
      out.push(line);
      continue;
    }
    if (/^[·•]/.test(line)) {
      flush();
      out.push(line);
      continue;
    }
    if (!buffer) {
      buffer = line;
      continue;
    }
    const last = buffer.slice(-1);
    if (/[。！？；：”」』…]/.test(last)) {
      flush();
      buffer = line;
    } else {
      buffer += line;
    }
  }
  flush();
  return out;
}

function splitSkillSections(paragraphs) {
  const description = [];
  const sections = [];
  let current = null;

  for (const paragraph of paragraphs) {
    const label = SKILL_LABELS.find((item) => paragraph.startsWith(item));
    if (label) {
      if (current) sections.push(current);
      const text = paragraph.slice(label.length).replace(/^[:：]\s*/, '').trim();
      current = { label, text };
      continue;
    }
    if (/^如果一个疯狂的调查员/.test(paragraph)) {
      if (current) sections.push(current);
      current = { label: '疯狂调查员', text: paragraph };
      continue;
    }
    if (/^[^，。；：\s]{1,14}：$/.test(paragraph)) {
      if (current) sections.push(current);
      current = { label: paragraph.replace(/：$/, ''), text: '' };
      continue;
    }
    if (current) {
      current.text += (current.text ? '\n' : '') + paragraph;
    } else {
      description.push(paragraph);
    }
  }
  if (current) sections.push(current);

  return {
    description: compact(description.join('\n\n')),
    sections: sections
      .map((section) => ({ label: section.label, text: compact(section.text) }))
      .filter((section) => section.text),
  };
}

function normalizeSkillBase(base) {
  if (base === 'DEX一半的%') return 'DEX / 2';
  if (base === '各种各样%') return '视专攻';
  if (base === 'EDU%') return 'EDU';
  return base.replace(/^0+(\d)/, '$1');
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

const MONSTER_SECTIONS = [
  { id: 'mythos', title: '神话生物', start: '14.1 神话生物', end: '14.2 神话诸神' },
  { id: 'gods', title: '神话诸神', start: '14.2 神话诸神', end: '14.3 经典妖魔' },
  { id: 'classic', title: '经典妖魔', start: '14.3 经典妖魔', end: '14.4 野兽' },
  { id: 'beasts', title: '野兽', start: '14.4 野兽', end: '14.5 可选规则' },
];

const MONSTER_TITLES = [
  { name: '拜亚基', section: 'mythos' },
  { name: '钻地魔虫', section: 'mythos' },
  { name: '星之彩', section: 'mythos' },
  { name: '蠕行者', section: 'mythos' },
  { name: '达贡&海德拉', title: '达贡&海德拉（特殊深潜者）', section: 'mythos' },
  { name: '黑山羊幼崽', section: 'mythos' },
  { name: '深潜者', special: 'glued', section: 'mythos' },
  { name: '混种深潜者', section: 'mythos' },
  { name: '巨噬蠕虫', section: 'mythos' },
  { name: '空鬼', section: 'mythos' },
  { name: '古老者', section: 'mythos' },
  { name: '炎之精', section: 'mythos' },
  { name: '飞水螅', section: 'mythos' },
  { name: '无形眷族', section: 'mythos' },
  { name: '妖鬼', section: 'mythos' },
  { name: '食尸鬼', section: 'mythos' },
  { name: '格拉基之仆', section: 'mythos' },
  { name: '诺弗·刻', section: 'mythos' },
  { name: '伊斯之伟大种族', section: 'mythos' },
  { name: '庭达罗斯的猎犬', section: 'mythos' },
  { name: '恐怖猎手', section: 'mythos' },
  { name: '罗伊格尔', section: 'mythos' },
  { name: '米-戈', title: '米-戈，来自犹格斯的真菌', section: 'mythos' },
  { name: '夜魇', section: 'mythos' },
  { name: '人面鼠', section: 'mythos' },
  { name: '潜沙怪', section: 'mythos' },
  { name: '蛇人', section: 'mythos' },
  { name: '外神仆役', section: 'mythos' },
  { name: '夏盖妖虫', section: 'mythos' },
  { name: '夏塔克鸟', section: 'mythos' },
  { name: '修格斯', section: 'mythos' },
  { name: '修格斯主宰', section: 'mythos' },
  { name: '克苏鲁的星之眷族', section: 'mythos' },
  { name: '星之精', section: 'mythos' },
  { name: '乔乔人', section: 'mythos' },

  { name: '阿布霍斯', section: 'gods' },
  { name: '阿特拉克·纳克亚', section: 'gods' },
  { name: '阿撒托斯', section: 'gods' },
  { name: '芭丝特', section: 'gods' },
  { name: '昌格纳·方庚', section: 'gods' },
  { name: '克图格亚', section: 'gods' },
  { name: '伟大的克苏鲁', section: 'gods' },
  { name: '赛伊格亚', section: 'gods' },
  { name: '道罗斯', section: 'gods' },
  { name: '埃霍特', section: 'gods' },
  { name: '加塔诺托亚', section: 'gods' },
  { name: '格拉基', section: 'gods' },
  { name: '哈斯塔', title: '哈斯塔，不可名状者', section: 'gods' },
  { name: '伊塔库亚', section: 'gods' },
  { name: '黄衣之王', title: '黄衣之王，哈斯塔的化身', section: 'gods' },
  { name: '诺登斯', section: 'gods' },
  { name: '奈亚拉托提普', section: 'gods' },
  { name: '尼约格萨', section: 'gods' },
  { name: '兰-提格斯', section: 'gods' },
  { name: '莎布-尼古拉斯', section: 'gods' },
  { name: '修德梅尔', section: 'gods' },
  { name: '撒托古亚', section: 'gods' },
  { name: '图尔兹查', section: 'gods' },
  { name: '乌波-萨斯拉', section: 'gods' },
  { name: '伊戈罗纳克', section: 'gods' },
  { name: '伊波-兹特尔', section: 'gods' },
  { name: '伊格', section: 'gods' },
  { name: '犹格-索托斯', section: 'gods' },
  { name: '佐斯-奥摩格', section: 'gods' },

  { name: '幽灵', section: 'classic' },
  { name: '木乃伊', section: 'classic' },
  { name: '吸血鬼', section: 'classic' },
  { name: '狼人', section: 'classic' },
  { name: '丧尸', section: 'classic' },

  { name: '蝙蝠', section: 'beasts' },
  { name: '鳄鱼', section: 'beasts' },
  { name: '狗', section: 'beasts' },
  { name: '马', section: 'beasts' },
  { name: '老鼠', section: 'beasts', messy: true },
  { name: '狮子', section: 'beasts', special: 'glued-any', messy: true },
  { name: '鲨鱼', section: 'beasts', special: 'glued-any', messy: true },
  { name: '蛇', section: 'beasts', special: 'glued-tail', messy: true },
  { name: '巨型乌贼', section: 'beasts' },
  { name: '狼', section: 'beasts' },
];

const MONSTER_OVERRIDES = {
  星之彩: {
    str: '15', con: 'N/A', siz: '= POW', dex: '95', int: '70', pow: '50*', hp: 'N/A',
    db: 'N/A', build: '0', magic: '10*', move: '流动 12 / 飞行 20',
    armor: '免疫物理伤害；强磁场可以禁锢',
    sanity: '0/1D4（见到被猎食的受害者 1/1D8）',
    attacks: '每回合 1 次；属性吸取、精神攻击；闪避 47%',
    description: '有知觉的纯色生物，没有物质实体。白天躲在阴暗凉爽处，进食时吸取受害者的 STR、CON、POW、DEX 与 APP。',
  },
  罗伊格尔: {
    str: '200', con: '140', siz: '250', dex: '50', int: '100', pow: '70', hp: '39',
    db: '+5D6', build: '6', magic: '14', move: '7（无形状态穿岩 3）',
    armor: '', sanity: '0/1D8（爬行动物形态）',
    attacks: '每回合 1 次；格斗、念动；无形状态只有 INT、POW、DEX',
    description: '自然形态是不可见的能量漩涡，只有耗费魔法值才能显现为巨大的爬行动物躯体。以念动力和吸取魔力著称。',
  },
  尼约格萨: {
    con: '200', db: '无', subtitle: '不应存世的尼约格萨',
  },
  蝙蝠: {
    str: '25', con: '35', siz: '15', dex: '105', int: '', pow: '35', hp: '5',
    db: '-2', build: '-2', magic: '', move: '1/12 飞行', armor: '无',
    sanity: '',
    attacks: '每回合 1 次；格斗 40%，1D2（集群每多一只伤害上限 +1）；躲避 52%',
  },
  伟大的克苏鲁: {
    sanity: '直视克苏鲁丧失 1D10/1D100 点理智',
  },
  黑山羊幼崽: {
    sanity: '见到黑山羊幼崽丧失 1D3/1D10 点理智值',
  },
  马: {
    str: '140', con: '65', siz: '165', dex: '50', pow: '50', hp: '23',
    db: '+3D6', build: '4', magic: '', move: '12', armor: '',
    sanity: '', attacks: '每回合 2 次；格斗 25%，2D6+DB；躲避 25%',
    description: '马分为骑乘用马、驮马、驴子和骡子。骑乘用马需要骑术技能；所有的马都会在超自然事物面前惊慌失措。',
  },
  老鼠: {
    str: '35', con: '55', siz: '35', dex: '70', pow: '50', hp: '9',
    db: '-1', build: '-1', magic: '', move: '9', armor: '无',
    sanity: '', attacks: '每回合 1 次；格斗 40%，1D3；淹覆（战技）2D6；躲避 42%',
    description: '单只老鼠不构成威胁，但十只左右的鼠群会淹覆目标，攻击时获得奖励骰。',
  },
  狮子: {
    str: '95', con: '50', siz: '80', dex: '95', pow: '65', hp: '13',
    db: '+1D6', build: '2', magic: '', move: '10', armor: '2 点毛皮和皮肤',
    sanity: '', attacks: '每回合 2 次；大型猫科动物，使用爪牙攻击。',
    description: '包括狮子、老虎、山狮、美洲豹和美洲狮。老虎更强壮，猎豹更轻、更快。',
  },
  鲨鱼: {
    str: '110', con: '65', siz: '70', dex: '65', pow: '50', hp: '13',
    db: '+1D6', build: '2', magic: '', move: '6',
    armor: '5 点粗糙外皮',
    sanity: '', attacks: '每回合 1 次；格斗 75%，2D3+半DB；噬咬（战技）2D6+DB；躲避 25%',
    description: '普通鲨鱼样本；更大的鲨鱼拥有更高的 SIZ、STR 和 CON。常见种类包括牛鲨、大白鲨和锤头鲨。',
  },
  蛇: {
    str: '90', con: '90', siz: '90', dex: '50', pow: '50', hp: '18',
    db: '+1D6', build: '2', magic: '', move: '12（游泳）',
    armor: '2 点光滑皮肤',
    sanity: '', attacks: '每回合 2 次；格斗 40%，1D3；绞杀（战技）1D6+DB；躲避 25%',
    description: '此处为蟒类数据；毒蛇（眼镜蛇、蝰蛇等）体型更小，使用剧毒撕咬。',
  },
};

function parseMonsters(text) {
  const lines = linesOf(text);
  const sectionRanges = MONSTER_SECTIONS.map((section) => {
    const start = lines.findIndex((line) => line.trim() === section.start);
    const end = lines.findIndex((line) => line.trim() === section.end);
    return { ...section, start, end: end > start ? end : lines.length };
  });

  const located = [];
  for (const monster of MONSTER_TITLES) {
    const section = sectionRanges.find((item) => item.id === monster.section);
    if (!section || section.start < 0) continue;
    const previousEnd = located.length ? located[located.length - 1].start : section.start;
    const start = findMonsterStart(lines, monster, previousEnd, section.end);
    if (start < 0) continue;
    located.push({ ...monster, start, section: section.title });
  }

  const monsters = located.map((monster, index) => {
    const next = located[index + 1];
    const end = next ? next.start : (sectionRanges.find((item) => item.title === monster.section)?.end ?? lines.length);
    let entryLines = lines.slice(monster.start, end);

    if (monster.special === 'glued') {
      entryLines = stripGluedTitle(entryLines, monster.name);
    } else if (monster.special === 'glued-tail') {
      entryLines = stripGluedTail(entryLines, monster.name);
    }

    const parsed = parseMonsterEntry(monster, entryLines);
    return {
      id: `monster-${index + 1}`,
      ...parsed,
      sourceLine: monster.start + 1,
    };
  });

  return monsters;
}

function findMonsterStart(lines, monster, from, to) {
  const title = monster.title ?? monster.name;
  for (let i = Math.max(0, from); i < to; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (monster.special === 'glued') {
      if (line.startsWith(monster.name) && line.length > 80) return i;
      continue;
    }
    if (monster.special === 'glued-any') {
      if (line.startsWith(monster.name)) return i;
      continue;
    }
    if (monster.special === 'glued-tail') {
      if (line.endsWith(monster.name) && line.length > 20) return i;
      continue;
    }
    if (line === title || line.startsWith(`${title}，`)) return i;
  }
  return -1;
}

function stripGluedTitle(entryLines, name) {
  const copy = [...entryLines];
  const first = copy.findIndex((line) => line.trim().startsWith(name));
  if (first >= 0) {
    copy[first] = copy[first].trim().slice(name.length).trim();
  }
  return copy;
}

function stripGluedTail(entryLines, name) {
  const copy = [...entryLines];
  const first = copy.findIndex((line) => line.trim().endsWith(name));
  if (first >= 0) {
    copy[first] = copy[first].trim().slice(0, -name.length).trim();
  }
  return copy;
}

function parseMonsterEntry(monster, entryLines) {
  const override = MONSTER_OVERRIDES[monster.name] ?? {};
  const text = entryLines.join('\n');
  const statStart = findStatStart(entryLines);

  let description = '';
  let quote = '';
  if (!monster.messy) {
    const descriptionLines = statStart > 0 ? entryLines.slice(0, statStart) : entryLines;
    const paragraphs = descriptionLines
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('——'))
      .filter((line) => !isMonsterHeadingLine(line, monster));
    const firstQuote = paragraphs.findIndex((line) => line.startsWith('“') || line.startsWith('‘'));
    if (firstQuote === 0 && paragraphs.length > 1) {
      quote = paragraphs[0];
      description = compact(paragraphs.slice(1).join('\n\n'));
    } else {
      description = compact(paragraphs.join('\n\n'));
    }
  }

  const stats = {
    str: override.str ?? firstStat(text, 'STR'),
    con: override.con ?? firstStat(text, 'CON'),
    siz: override.siz ?? firstStat(text, 'SIZ'),
    dex: override.dex ?? firstStat(text, 'DEX'),
    int: override.int ?? firstStat(text, 'INT'),
    pow: override.pow ?? firstStat(text, 'POW'),
    hp: override.hp ?? firstStat(text, 'HP'),
  };

  const subtitle = override.subtitle ?? findSubtitle(entryLines, monster.name);

  return {
    name: monster.name,
    subtitle,
    section: monster.section,
    quote,
    description: compact(override.description ?? description),
    stats,
    db: normalizeDb(override.db ?? firstLabel(text, ['伤害加值', '平均伤害加值'])),
    build: override.build ?? firstLabel(text, ['体格', '平均体格']),
    magic: override.magic ?? firstLabel(text, ['魔法值', '平均魔法值']),
    move: override.move ?? firstMove(text),
    armor: override.armor ?? firstLabel(text, ['护甲']),
    sanity: override.sanity ?? firstLabel(text, ['理智损失']),
    attacks: override.attacks ?? firstLabel(text, ['每回合攻击']),
  };
}

function findStatStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^STR\s*[:：]?\s*\d/.test(line)) return i;
    if (line.includes('属性') && line.includes('平均') && line.includes('掷骰')) return i;
    if (line.includes('属性') && line.includes('平均')) return i;
  }
  return lines.length;
}

function firstStat(text, key) {
  const re = new RegExp(`${key}\\*?\\s*[:：]?\\s*(\\d[\\d,]*)`);
  const match = re.exec(text);
  return match ? normalizeStat(match[1]) : '';
}

function normalizeStat(value) {
  return value.replace(/,/g, '').replace(/^0+(?=\d)/, '');
}

const MONSTER_LABEL_STOPS = [
  '平均伤害加值', '伤害加值', '平均体格', '体格', '平均魔法值', '魔法值',
  '移动', '护甲', '理智损失', '每回合攻击', '战斗方式', '技能', '栖息地',
  '法术', '特殊能力', '攻击', 'HP', 'STR', 'CON', 'SIZ', 'DEX', 'INT',
  'POW', 'APP', 'EDU',
];

function firstLabel(text, labels) {
  const stopRe = new RegExp(`(?:${MONSTER_LABEL_STOPS.join('|')})\\s*[:：]`);
  const statStop = /\s{2,}[A-Z]{3}\s+\d/;
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:：]\\s*([^\\n]*)`);
    const match = re.exec(text);
    if (!match) continue;
    let value = match[1];
    const stopMatch = stopRe.exec(value);
    if (stopMatch) value = value.slice(0, stopMatch.index);
    const statMatch = statStop.exec(value);
    if (statMatch) value = value.slice(0, statMatch.index);
    value = compact(value).replace(/\s+/g, ' ');
    if (value) return value;
  }
  return '';
}

function firstMove(text) {
  const match = /移动\s*[:：]\s*([^\n]*)/.exec(text);
  if (!match) return '';
  return compact(match[1].split(/攻击|每回合/)[0]);
}

function isMonsterHeadingLine(line, monster) {
  const text = line.trim();
  if (!text) return false;
  if (text === monster.name) return true;
  if (monster.title && text === monster.title) return true;
  if (text.startsWith(`${monster.name}，`) || text.startsWith(`${monster.name},`)) return true;
  if (
    text.length <= 14 &&
    text.endsWith(monster.name) &&
    !/[。！？；：，,]/.test(text)
  ) {
    return true;
  }
  return false;
}

function normalizeDb(value) {
  const text = compact(value);
  if (!text) return '';
  if (text === '+0' || text === '0' || text === '-' || text === '无') return '无';
  if (/^\d/.test(text)) return `+${text}`;
  return text;
}

function findSubtitle(lines, name) {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith(name)) continue;
    const rest = line.slice(name.length).trim();
    if (!rest) continue;
    if (rest.startsWith('，') || rest.startsWith(',')) {
      const value = rest.slice(1).trim();
      if (value && value.length <= 18 && !/[。！？]/.test(value)) return value;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

const WEAPON_SKILL_RE =
  /(射击\([^)]*\)|格斗\([^)]*\)|投掷|炮术|爆破|电气维修)/;

const WEAPON_CATEGORY_RULES = [
  { test: /^常规武器/, category: '近战与弓弩' },
  { test: /^手枪/, category: '手枪' },
  { test: /^步枪/, category: '步枪' },
  { test: /^霰弹枪/, category: '霰弹枪' },
  { test: /^突击步枪/, category: '步枪' },
  { test: /^冲锋枪/, category: '冲锋枪' },
  { test: /^机枪/, category: '机枪' },
  { test: /^爆炸物/, category: '重武器与爆炸物' },
];

const WEAPON_NAME_FIXES = {
  '贝格曼MP181/MP2811': '贝格曼MP18/MP28',
  '塑胶炸弹(C-4)，4盎': '塑胶炸弹(C-4)，4盎司',
  '转管速射机枪*(7.62mm)': '转管速射机枪* (7.62mm)',
  'FN米尼米机枪(5.56mm)': 'FN米尼米机枪 (5.56mm)',
};

const WEAPON_FIELD_FIXES = {
  '16号双管霰弹枪': { damage: '2D6+2/1D6+1/1D4' },
  '10号双管霰弹枪': { damage: '4D6+2/2D6+1/1D4', era: '1920s，稀有' },
  '信号枪': { damage: '1D10+1D3+燃烧', era: '1920s，现代' },
  '莫洛托夫鸡尾酒': { era: '1920s，现代' },
  '炸药棒*': { era: '1920s，现代' },
  '手榴弹*': { era: '1920s，现代' },
  '75mm野战炮': { era: '1920s，现代' },
  '雷管': {
    range: 'N/A', perRound: 'N/A', ammo: '一次性',
    price: '$1/$20', malfunction: '100', era: '1920s，现代',
  },
  '管状土制炸弹': { perRound: '布置', ammo: '一次性', era: '1920s，现代' },
  '塑胶炸弹(C-4)，4盎司': { perRound: '布置', ammo: '一次性', era: '现代' },
  '莫兰上校的气动步枪': { price: '$200/-' },
};

const EXTRA_WEAPONS = [
  {
    name: '120mm坦克炮', skill: '炮术', category: '重武器与爆炸物',
    damage: '15D10/2码', range: '2000码', perRound: '1', ammo: '独立装弹',
    price: 'N/A', malfunction: '100', era: '现代',
  },
  {
    name: '5英寸(127mm)舰载炮', skill: '炮术', category: '重武器与爆炸物',
    damage: '12D10/4码', range: '3000码', perRound: '1', ammo: '自动上弹',
    price: 'N/A', malfunction: '98', era: '现代',
  },
  {
    name: '反步兵地雷', skill: '爆破', category: '重武器与爆炸物',
    damage: '4D10/5码', range: '即地', perRound: '布置', ammo: '一次性',
    price: 'N/A', malfunction: '99', era: '现代',
  },
  {
    name: '阔剑地雷*', skill: '爆破', category: '重武器与爆炸物',
    damage: '6D6/20码', range: '即地', perRound: '布置', ammo: '一次性',
    price: 'N/A', malfunction: '99', era: '现代',
  },
  {
    name: '火焰喷射器', skill: '射击(火焰喷射器)', category: '重武器与爆炸物',
    damage: '2D6+燃烧', range: '25码', perRound: '1', ammo: '至少10',
    price: 'N/A', malfunction: '93', era: '1920s，现代',
  },
  {
    name: 'M72反坦克火箭筒', skill: '射击(重武器)', category: '重武器与爆炸物',
    damage: '8D10/1码', range: '150码', perRound: '1', ammo: '1',
    price: 'N/A', malfunction: '98', era: '现代',
  },
];

const WEAPON_HEADER_RE = /^(名称|价格|基础射|程|故障|值|时代|20s\/现代)$/;
const WEAPON_ERA_RE = /^(1920s[，,]?|现代|二战及以后|稀有|20s\/现代)$/;

function parseWeapons(text) {
  const lines = linesOf(text);
  const start = lines.findIndex((line) => line.trim() === '常规武器');
  const end = lines.findIndex((line) => line.trim() === '注释');
  if (start < 0 || end < 0) return [];

  const region = lines.slice(start, end);
  const rows = [];
  let category = '近战与弓弩';
  let pendingName = '';
  let pendingDamage = '';
  let pendingEra = '';
  let pendingAmmo = '';
  let pendingPrice = '';
  let pendingMalfunction = '';

  const resetPending = () => {
    pendingName = '';
    pendingDamage = '';
    pendingEra = '';
    pendingAmmo = '';
    pendingPrice = '';
    pendingMalfunction = '';
  };

  for (let i = 0; i < region.length; i += 1) {
    let line = region[i].trim();
    if (!line) continue;

    // The machine-gun table puts its skill in a separate vertical column.
    line = line
      .replace(/\s{2,}射击\(机\s*$/, '')
      .replace(/\s{2,}枪\)\s*$/, '')
      .trim();
    if (!line) continue;
    if (line === '射击(机' || line === '枪)') continue;

    // Repeated table headers are interleaved with the rows.
    if (/^(名称|价格|基础射|程|故障|值|时代|20s\/现代)/.test(line)) {
      pendingName = '';
      continue;
    }

    // These rows are split into a vertical block by the PDF extraction.
    if (line.startsWith('射击(火焰喷射')) {
      while (i + 1 < region.length && !region[i].includes('器)')) i += 1;
      continue;
    }
    if (line.startsWith('5英寸(127mm)舰载')) {
      let j = i + 1;
      while (j < region.length && region[j].trim() !== '炮') j += 1;
      i = j;
      continue;
    }

    const categoryRule = WEAPON_CATEGORY_RULES.find((rule) => rule.test.test(line));
    if (categoryRule) {
      category = categoryRule.category;
      continue;
    }

    if (WEAPON_HEADER_RE.test(line)) continue;

    // A standalone parenthetical extends the name it belongs to.
    if (/^[（(][^）)]*[）)]$/.test(line)) {
      if (pendingName) pendingName += line;
      else if (rows.length) rows[rows.length - 1].name += line;
      continue;
    }

    // A line closing an unmatched parenthesis continues that name.
    if (
      hasUnclosedParen(pendingName) &&
      !WEAPON_SKILL_RE.test(line) &&
      !looksLikeWeaponRow(line)
    ) {
      pendingName += line;
      continue;
    }
    if (
      rows.length &&
      hasUnclosedParen(rows[rows.length - 1].name) &&
      !WEAPON_SKILL_RE.test(line) &&
      !looksLikeWeaponRow(line)
    ) {
      rows[rows.length - 1].name += line;
      continue;
    }

    // Join a skill split across lines, e.g. 射击(机 / 枪).
    if (line.includes('(') && !line.includes(')') && WEAPON_SKILL_RE.test(line)) {
      let joined = line;
      for (let j = i + 1; j < Math.min(region.length, i + 4); j += 1) {
        const next = region[j].trim();
        if (!next) continue;
        joined += next;
        if (next.includes(')')) {
          i = j;
          break;
        }
      }
      line = joined;
    }

    const fields = line.split(/\s{2,}/).filter(Boolean);
    const skillIndex = fields.findIndex((field) => WEAPON_SKILL_RE.test(field));

    if (skillIndex >= 0) {
      const skill = fields[skillIndex].match(WEAPON_SKILL_RE)?.[1] ?? fields[skillIndex];
      const before = fields.slice(0, skillIndex).join(' ');
      const after = fields.slice(skillIndex + 1).filter((field) => field !== '贯穿');

      let name = compact(before || pendingName);
      if (before && pendingName && /^[（(]/.test(before)) {
        name = compact(`${pendingName}${before}`);
      }
      if (!name) continue;

      const parsed = mapWeaponFields(after, {
        damage: pendingDamage,
        era: pendingEra,
        ammo: pendingAmmo,
        price: pendingPrice,
        malfunction: pendingMalfunction,
      });
      rows.push({
        id: `weapon-${rows.length + 1}`,
        name,
        skill,
        category: weaponCategory(skill, name, category),
        ...parsed,
      });
      resetPending();
      continue;
    }

    // Machine-gun rows have no skill column; the skill is the section heading.
    if (category === '机枪' && looksLikeWeaponRow(line)) {
      const parts = [...fields];
      const name = compact(pendingName || parts.shift() || '');
      if (!name) continue;
      const parsed = mapWeaponFields(parts, {
        damage: pendingDamage,
        era: pendingEra,
        ammo: pendingAmmo,
        price: pendingPrice,
        malfunction: pendingMalfunction,
      });
      rows.push({
        id: `weapon-${rows.length + 1}`,
        name,
        skill: '射击(机枪)',
        category: '机枪',
        ...parsed,
      });
      resetPending();
      continue;
    }

    // The Bernelli shotgun's name starts on the row and ends on the next line.
    if (
      rows.length &&
      /^枪[（(]/.test(line) &&
      !WEAPON_SKILL_RE.test(line) &&
      !looksLikeWeaponRow(line)
    ) {
      rows[rows.length - 1].name += line;
      continue;
    }

    // A bare number can finish a damage expression split across lines.
    if (/^\d+$/.test(line) && rows.length && /D$/.test(rows[rows.length - 1].damage)) {
      rows[rows.length - 1].damage += line;
      continue;
    }

    // A trailing 燃烧 extends the previous weapon's damage.
    if (line.startsWith('燃烧') && rows.length) {
      if (fields[0] === '燃烧') rows[rows.length - 1].damage += '+燃烧';
      for (const field of fields.slice(1)) {
        if (isEraFragment(field)) {
          rows[rows.length - 1].era = joinEra(rows[rows.length - 1].era, field);
        }
      }
      continue;
    }

    // Fragment line: damage, era, ammo, price, or a name.
    let firstHandled = false;
    for (let f = 0; f < fields.length; f += 1) {
      const field = fields[f];
      let handled = false;

      if (isDiceFragment(field)) {
        pendingDamage += field;
        handled = true;
      } else if (isEraFragment(field)) {
        pendingEra = joinEra(pendingEra, field);
        handled = true;
      } else if (field === '一次性' || field === '一次' || field === '性') {
        pendingAmmo = field === '性' ? `${pendingAmmo}性` : field;
        handled = true;
      } else if (field === '每盒') {
        handled = true;
      } else if (/^\$/.test(field)) {
        if (rows.length && !rows[rows.length - 1].price) {
          rows[rows.length - 1].price = field;
        } else {
          pendingPrice = field;
        }
        handled = true;
      } else if (/^\d{2,3}$/.test(field) && rows.length && !rows[rows.length - 1].malfunction) {
        rows[rows.length - 1].malfunction = field;
        handled = true;
      }

      if (handled && f === 0) firstHandled = true;
    }

    const nameField = fields[0];
    if (!firstHandled && nameField && isNameFragment(nameField)) {
      pendingName += nameField;
    }
  }

  const fixed = rows.map((row) => {
    const name = WEAPON_NAME_FIXES[row.name] ?? row.name;
    const fieldFix = WEAPON_FIELD_FIXES[name] ?? {};
    return {
      ...row,
      ...fieldFix,
      name,
      category: weaponCategory(row.skill, name, row.category),
    };
  });

  for (const extra of EXTRA_WEAPONS) {
    const index = fixed.findIndex((row) => row.name === extra.name);
    if (index >= 0) {
      fixed[index] = { ...fixed[index], ...extra };
    } else {
      fixed.push({ id: `weapon-${fixed.length + 1}`, ...extra });
    }
  }

  const seen = new Set();
  return fixed.filter((row) => {
    if (seen.has(row.name)) return false;
    seen.add(row.name);
    return true;
  });
}

function looksLikeWeaponRow(line) {
  return /D\d/.test(line) && /码|接触/.test(line) && /[$\d]/.test(line);
}

/**
 * Map the fields that follow the skill column. The source table has optional
 * price / malfunction columns, so work from the right edge: era, malfunction,
 * price, then the fixed damage / range / rate / ammo prefix.
 */
function mapWeaponFields(fields, pending = {}) {
  const remaining = [...fields];
  let damage = pending.damage ?? '';
  let ammo = pending.ammo ?? '';
  let price = pending.price ?? '';
  let malfunction = pending.malfunction ?? '';
  let era = pending.era ?? '';

  const takeLast = (predicate) => {
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (predicate(remaining[i])) return remaining.splice(i, 1)[0];
    }
    return '';
  };

  era = takeLast((field) => /1920s|现代|二战|稀有|20s/.test(field)) || era;
  malfunction =
    takeLast((field) => /^\d{2,3}$/.test(field) || /^(N\/A|稀有)$/.test(field)) || malfunction;
  price = takeLast((field) => /\$/.test(field) || /^(N\/A|稀有|-)$/.test(field)) || price;

  if (!damage) {
    damage = remaining.shift() ?? '';
  } else if (remaining.length && isDiceFragment(remaining[0])) {
    damage += remaining.shift();
  }

  const range = remaining.shift() ?? '';
  const perRound = remaining.shift() ?? '';
  const ammoField = remaining.shift() ?? '';
  if (ammoField) ammo = ammoField;

  return {
    damage: compact(damage),
    range: compact(range),
    perRound: compact(perRound),
    ammo: compact(ammo),
    price: compact(price),
    malfunction: compact(malfunction),
    era: compact(era),
  };
}

function isDiceFragment(value) {
  return /^[\dDd+\-/]+$/.test(value) && /D/i.test(value);
}

function isEraFragment(value) {
  return WEAPON_ERA_RE.test(value);
}

function joinEra(current, next) {
  if (!current) return next;
  if (!next) return current;
  const left = current.replace(/[，,]\s*$/, '');
  const right = next.replace(/^[，,]\s*/, '');
  if (left === right) return left;
  return `${left}，${right}`;
}

function hasUnclosedParen(text) {
  const opens = (text.match(/[（(]/g) || []).length;
  const closes = (text.match(/[）)]/g) || []).length;
  return opens > closes;
}

function isNameFragment(value) {
  const text = value.trim();
  if (!text) return false;
  if (text.length > 40) return false;
  if (/[。；：]/.test(text)) return false;
  if (isDiceFragment(text)) return false;
  if (/^\d+$/.test(text)) return false;
  return /[\u4e00-\u9fff]/.test(text) || /^[（(]/.test(text);
}

function weaponCategory(skill, name, fallback) {
  if (/^格斗/.test(skill)) return '近战与弓弩';
  if (/^射击\(手枪\)/.test(skill)) return '手枪';
  if (/^射击\(步枪\)/.test(skill)) return '步枪';
  if (/^射击\(霰弹枪\)/.test(skill)) return '霰弹枪';
  if (/^射击\(冲锋枪\)/.test(skill)) return '冲锋枪';
  if (/^射击\(机枪\)/.test(skill)) return '机枪';
  if (/^射击\(弓\)/.test(skill)) return '近战与弓弩';
  if (/^投掷$/.test(skill)) return '投掷武器';
  if (/^射击\(重武器\)|^炮术|^爆破|^电气维修/.test(skill)) return '重武器与爆炸物';
  if (/手榴弹|地雷|炸弹|炸药|火箭|迫击炮|野战炮|坦克炮|舰载炮|火焰喷射器/.test(name)) {
    return '重武器与爆炸物';
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  const skillsText = readText(SKILLS_FILE);
  const monstersText = readText(MONSTERS_FILE);
  const appendixText = readText(APPENDIX_FILE);

  const available = Boolean(skillsText || monstersText || appendixText);
  const skills = skillsText ? splitSkillLines(linesOf(skillsText)) : [];
  const monsters = monstersText ? parseMonsters(monstersText) : [];
  const weapons = appendixText ? parseWeapons(appendixText) : [];

  const payload = {
    available,
    generatedAt: new Date().toISOString(),
    source: 'Call of Cthulhu 7e Keeper Rulebook (Chinese transcription)',
    counts: {
      skills: skills.length,
      monsters: monsters.length,
      weapons: weapons.length,
    },
    skills,
    monsters,
    weapons,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const status = available
    ? `skills ${skills.length}, monsters ${monsters.length}, weapons ${weapons.length}`
    : 'source not found; wrote placeholder payload';
  console.log(`[rulebook] ${status} -> ${path.relative(ROOT, OUTPUT_FILE)}`);
}

build();
