import './rulebook.css';
import { hydrateIcons, icon } from '../ui/icons';
import type { RulebookData, RulebookMonster, RulebookSkill, RulebookWeapon } from './types';

const THEME_KEY = 'CoDices:ui-theme';

type Tab = 'skills' | 'monsters' | 'weapons';

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'skills', label: '技能', icon: 'feather' },
  { id: 'monsters', label: '怪物', icon: 'skull' },
  { id: 'weapons', label: '武器', icon: 'shield' },
];

const SKILL_FILTERS = ['全部', '专攻', '非常规', '现代'];
const MONSTER_FILTERS = ['全部', '神话生物', '神话诸神', '经典妖魔', '野兽'];
const WEAPON_FILTERS = [
  '全部',
  '近战与弓弩',
  '手枪',
  '步枪',
  '霰弹枪',
  '冲锋枪',
  '机枪',
  '投掷武器',
  '重武器与爆炸物',
];

let data: RulebookData | null = null;
let activeTab: Tab = 'skills';
let query = '';
let activeFilter = '全部';
let skillsById = new Map<string, RulebookSkill>();
let monstersById = new Map<string, RulebookMonster>();
let lastFocused: HTMLElement | null = null;
let overlayCloseTimer = 0;

const urlParams = new URLSearchParams(window.location.search);
const requestedTab = urlParams.get('tab');
if (requestedTab === 'skills' || requestedTab === 'monsters' || requestedTab === 'weapons') {
  activeTab = requestedTab;
}

const content = document.getElementById('rb-content') as HTMLElement;
const stats = document.getElementById('rb-stats') as HTMLElement;
const tabs = document.getElementById('rb-tabs') as HTMLElement;
const search = document.getElementById('rb-search') as HTMLInputElement;
const filters = document.getElementById('rb-filters') as HTMLElement;
const overlay = document.getElementById('rb-overlay') as HTMLElement | null;
const overlayPanel = document.getElementById('rb-overlay-panel') as HTMLElement | null;
const overlayKicker = document.getElementById('rb-overlay-kicker') as HTMLElement | null;
const overlayTitle = document.getElementById('rb-overlay-title') as HTMLElement | null;
const overlaySubtitle = document.getElementById('rb-overlay-subtitle') as HTMLElement | null;
const overlayBase = document.getElementById('rb-overlay-base') as HTMLElement | null;
const overlayBody = document.getElementById('rb-overlay-body') as HTMLElement | null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paragraph(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function display(value: string): string {
  const text = value?.trim();
  return text ? paragraph(text) : '—';
}

function searchable(value: unknown): string {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(searchable).join(' ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(searchable).join(' ');
  }
  return '';
}

function matchesQuery(item: unknown): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return searchable(item).includes(text);
}

function filteredSkills(): RulebookSkill[] {
  if (!data) return [];
  return data.skills.filter((skill) => {
    if (activeFilter !== '全部' && !skill.tags.includes(activeFilter)) return false;
    return matchesQuery(skill);
  });
}

function filteredMonsters(): RulebookMonster[] {
  if (!data) return [];
  return data.monsters.filter((monster) => {
    if (activeFilter !== '全部' && monster.section !== activeFilter) return false;
    return matchesQuery(monster);
  });
}

function filteredWeapons(): RulebookWeapon[] {
  if (!data) return [];
  return data.weapons.filter((weapon) => {
    if (activeFilter !== '全部' && weapon.category !== activeFilter) return false;
    return matchesQuery(weapon);
  });
}

function renderStats(): void {
  if (!data || !data.available) {
    stats.innerHTML = '<span class="rb-stat-note">本地规则书数据未生成</span>';
    return;
  }
  const items: Array<[number, string]> = [
    [data.counts.skills, '技能'],
    [data.counts.monsters, '怪物'],
    [data.counts.weapons, '武器'],
  ];
  stats.innerHTML = items
    .map(([count, label]) => `
      <div class="rb-stat-chip">
        <strong>${count}</strong>
        <span>${label}</span>
      </div>
    `)
    .join('');
}

function renderTabs(): void {
  tabs.innerHTML = TABS.map((tab) => `
    <button
      class="rb-tab${tab.id === activeTab ? ' is-active' : ''}"
      type="button"
      role="tab"
      aria-selected="${tab.id === activeTab}"
      data-tab="${tab.id}"
    >
      <span data-icon="${tab.icon}" data-icon-size="16"></span>
      <span>${tab.label}</span>
    </button>
  `).join('');
  hydrateIcons(tabs);
}

function filterOptions(): string[] {
  if (activeTab === 'skills') return SKILL_FILTERS;
  if (activeTab === 'monsters') return MONSTER_FILTERS;
  return WEAPON_FILTERS;
}

function renderFilters(): void {
  const options = filterOptions();
  if (options.length <= 1) {
    filters.innerHTML = '';
    return;
  }
  filters.innerHTML = options
    .map((option) => `
      <button
        class="rb-filter${option === activeFilter ? ' is-active' : ''}"
        type="button"
        data-filter="${escapeHtml(option)}"
      >${escapeHtml(option)}</button>
    `)
    .join('');
}

function renderSkillCard(skill: RulebookSkill): string {
  const tags = skill.tags.length
    ? `<div class="rb-tags">${skill.tags
        .map((tag) => `<span class="rb-tag">${escapeHtml(tag)}</span>`)
        .join('')}</div>`
    : '';

  const detailCount = skill.sections.length
    ? `${skill.sections.length} 条规则细节`
    : '完整说明';

  return `<article
    class="rb-card rb-skill"
    role="button"
    tabindex="0"
    aria-haspopup="dialog"
    aria-label="展开 ${escapeHtml(skill.name)} 的完整规则"
    data-skill-id="${escapeHtml(skill.id)}"
  >
    <header class="rb-card-head">
      <h2>${escapeHtml(skill.name)}</h2>
      <span class="rb-base">${escapeHtml(skill.base)}</span>
    </header>
    ${tags}
    <p class="rb-desc rb-desc-clamp">${paragraph(skill.description)}</p>
    <footer class="rb-card-foot">
      <span>${detailCount}</span>
      <span class="rb-card-expand">展开阅读${icon('chevron-right', 14)}</span>
    </footer>
  </article>`;
}

function renderSkillRules(skill: RulebookSkill): string {
  if (!skill.sections.length) return '';
  return `<div class="rb-overlay-rules">
    ${skill.sections
      .map((section) => `
        <div class="rb-rule">
          <h3>${escapeHtml(section.label)}</h3>
          <p>${paragraph(section.text)}</p>
        </div>
      `)
      .join('')}
  </div>`;
}

interface OverlayContent {
  kicker: string;
  title: string;
  subtitle?: string;
  badge?: string;
  tags?: string[];
  body: string;
}

function openOverlay(content: OverlayContent): void {
  if (!overlay || !overlayPanel || !overlayTitle || !overlayBody) return;

  window.clearTimeout(overlayCloseTimer);
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (overlayKicker) overlayKicker.textContent = content.kicker;
  overlayTitle.textContent = content.title;
  if (overlaySubtitle) {
    overlaySubtitle.textContent = content.subtitle ?? '';
    overlaySubtitle.hidden = !content.subtitle;
  }
  if (overlayBase) {
    overlayBase.textContent = content.badge ?? '';
    overlayBase.hidden = !content.badge;
  }

  const tags = content.tags?.length
    ? `<div class="rb-tags">${content.tags
        .map((tag) => `<span class="rb-tag">${escapeHtml(tag)}</span>`)
        .join('')}</div>`
    : '';

  overlayBody.innerHTML = `${tags}${content.body}`;
  overlayBody.scrollTop = 0;

  overlay.hidden = false;
  document.documentElement.classList.add('rb-overlay-open');
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    overlayPanel.focus({ preventScroll: true });
  });
}

function openSkillOverlay(skillId: string): void {
  const skill = skillsById.get(skillId);
  if (!skill) return;

  openOverlay({
    kicker: '技能',
    title: skill.name,
    badge: skill.base,
    tags: skill.tags,
    body: `<p class="rb-overlay-desc">${paragraph(skill.description)}</p>${renderSkillRules(skill)}`,
  });
}

function closeOverlay(): void {
  if (!overlay || overlay.hidden) return;

  overlay.classList.remove('is-open');
  document.documentElement.classList.remove('rb-overlay-open');
  window.clearTimeout(overlayCloseTimer);
  overlayCloseTimer = window.setTimeout(() => {
    if (!overlay.classList.contains('is-open')) overlay.hidden = true;
  }, 220);

  const focusTarget = lastFocused;
  lastFocused = null;
  if (focusTarget?.isConnected) {
    focusTarget.focus({ preventScroll: true });
  }
}

function trapOverlayFocus(event: KeyboardEvent): void {
  if (!overlay || overlay.hidden || !overlayPanel || event.key !== 'Tab') return;

  const focusable = Array.from(
    overlayPanel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null);

  if (!focusable.length) {
    event.preventDefault();
    overlayPanel.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || active === overlayPanel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function renderMonsterStats(monster: RulebookMonster): string {
  const statItems: Array<[string, string]> = [
    ['STR', monster.stats.str],
    ['CON', monster.stats.con],
    ['SIZ', monster.stats.siz],
    ['DEX', monster.stats.dex],
    ['INT', monster.stats.int],
    ['POW', monster.stats.pow],
    ['HP', monster.stats.hp],
  ];

  return `<div class="rb-stat-grid">${statItems
    .map(([label, value]) => `
      <div class="rb-stat">
        <span>${label}</span>
        <strong>${display(value)}</strong>
      </div>
    `)
    .join('')}</div>`;
}

function renderMonsterMeta(monster: RulebookMonster): string {
  const metaItems: Array<[string, string]> = [
    ['伤害加值', monster.db],
    ['体格', monster.build],
    ['魔法值', monster.magic],
    ['移动', monster.move],
    ['护甲', monster.armor],
    ['理智损失', monster.sanity],
    ['攻击', monster.attacks],
  ];

  const meta = metaItems
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([label, value]) => `
      <div class="rb-meta-row">
        <dt>${label}</dt>
        <dd>${paragraph(value)}</dd>
      </div>
    `)
    .join('');

  return meta ? `<dl class="rb-meta">${meta}</dl>` : '';
}

function renderMonsterQuote(monster: RulebookMonster): string {
  return monster.quote
    ? `<blockquote class="rb-quote">${paragraph(monster.quote)}</blockquote>`
    : '';
}

function renderMonsterCard(monster: RulebookMonster): string {
  const subtitle = monster.subtitle
    ? `<span class="rb-subtitle">${escapeHtml(monster.subtitle)}</span>`
    : '';

  const description = monster.description
    ? `<p class="rb-desc rb-desc-clamp">${paragraph(monster.description)}</p>`
    : '';

  return `<article
    class="rb-card rb-monster"
    role="button"
    tabindex="0"
    aria-haspopup="dialog"
    aria-label="展开 ${escapeHtml(monster.name)} 的完整条目"
    data-monster-id="${escapeHtml(monster.id)}"
  >
    <header class="rb-card-head">
      <div class="rb-title-block">
        <h2>${escapeHtml(monster.name)}</h2>
        ${subtitle}
      </div>
      <span class="rb-section-badge">${escapeHtml(monster.section)}</span>
    </header>
    ${renderMonsterQuote(monster)}
    ${description}
    ${renderMonsterStats(monster)}
    ${renderMonsterMeta(monster)}
    <footer class="rb-card-foot">
      <span>完整描述与数据</span>
      <span class="rb-card-expand">展开阅读${icon('chevron-right', 14)}</span>
    </footer>
  </article>`;
}

function openMonsterOverlay(monsterId: string): void {
  const monster = monstersById.get(monsterId);
  if (!monster) return;

  const description = monster.description
    ? `<p class="rb-overlay-desc">${paragraph(monster.description)}</p>`
    : '';

  openOverlay({
    kicker: '怪物',
    title: monster.name,
    subtitle: monster.subtitle,
    badge: monster.section,
    body: `${renderMonsterQuote(monster)}${description}${renderMonsterStats(monster)}${renderMonsterMeta(monster)}`,
  });
}

function renderWeaponRow(weapon: RulebookWeapon): string {
  return `<tr>
    <th scope="row">
      <span class="rb-weapon-name">${escapeHtml(weapon.name)}</span>
      <span class="rb-weapon-skill">${escapeHtml(weapon.skill)}</span>
    </th>
    <td>${display(weapon.damage)}</td>
    <td>${display(weapon.range)}</td>
    <td>${display(weapon.perRound)}</td>
    <td>${display(weapon.ammo)}</td>
    <td>${display(weapon.price)}</td>
    <td>${display(weapon.malfunction)}</td>
    <td>${display(weapon.era)}</td>
  </tr>`;
}

function renderWeaponTable(weapons: RulebookWeapon[]): string {
  return `<div class="rb-table-wrap">
    <table class="rb-table">
      <thead>
        <tr>
          <th scope="col">名称 / 技能</th>
          <th scope="col">伤害</th>
          <th scope="col">基础射程</th>
          <th scope="col">每轮</th>
          <th scope="col">装弹量</th>
          <th scope="col">价格</th>
          <th scope="col">故障</th>
          <th scope="col">时代</th>
        </tr>
      </thead>
      <tbody>${weapons.map(renderWeaponRow).join('')}</tbody>
    </table>
  </div>`;
}

function renderEmpty(message: string): string {
  return `<div class="rb-empty">
    <p>${escapeHtml(message)}</p>
    <button class="rb-reset" type="button" data-reset>清除筛选</button>
  </div>`;
}

function renderContent(): void {
  if (!data || !data.available) {
    renderUnavailable();
    return;
  }

  renderFilters();

  if (activeTab === 'skills') {
    const skills = filteredSkills();
    content.innerHTML = skills.length
      ? `<div class="rb-result-note">共 ${skills.length} 个技能</div>
         <div class="rb-grid rb-grid-skills">${skills.map(renderSkillCard).join('')}</div>`
      : renderEmpty('没有匹配的技能。');
    return;
  }

  if (activeTab === 'monsters') {
    const monsters = filteredMonsters();
    content.innerHTML = monsters.length
      ? `<div class="rb-result-note">共 ${monsters.length} 个怪物</div>
         <div class="rb-grid rb-grid-monsters">${monsters.map(renderMonsterCard).join('')}</div>`
      : renderEmpty('没有匹配的怪物。');
    return;
  }

  const weapons = filteredWeapons();
  content.innerHTML = weapons.length
    ? `<div class="rb-result-note">共 ${weapons.length} 件武器</div>${renderWeaponTable(weapons)}`
    : renderEmpty('没有匹配的武器。');
}

function renderUnavailable(): void {
  renderStats();
  filters.innerHTML = '';
  content.innerHTML = `<section class="rb-missing">
    <p class="rb-kicker">数据未生成</p>
    <h2>规则书还没有装入这一份构建</h2>
    <p>
      本页的技能、怪物与武器数据由本地的
      <code>prompts/rulebook</code> 源文本生成。当前构建里没有找到可用数据，
      因此不会展示任何规则书原文。
    </p>
    <p>
      请在包含源文本的工作副本中运行 <code>npm run build:rulebook</code>，
      然后刷新此页。公开构建可以继续保持这个空状态。
    </p>
    <a class="rb-link-button" href="../">返回编辑器</a>
  </section>`;
}

function renderAll(): void {
  renderStats();
  renderTabs();
  renderContent();
}

async function loadData(): Promise<RulebookData | null> {
  try {
    const response = await fetch(new URL('./rulebook-data.json', window.location.href), {
      cache: 'no-cache',
    });
    if (!response.ok) return null;
    return (await response.json()) as RulebookData;
  } catch {
    return null;
  }
}

function currentTheme(): 'light' | 'dark' {
  const requested = new URLSearchParams(window.location.search).get('theme');
  if (requested === 'light' || requested === 'dark') return requested;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#14120f' : '#f7f1e7');

  const button = document.getElementById('rb-theme');
  if (button) {
    const name = theme === 'dark' ? 'sun' : 'moon';
    button.dataset.icon = name;
    button.setAttribute('title', theme === 'dark' ? '切换为浅色' : '切换为深色');
    button.innerHTML = icon(name, Number(button.dataset.iconSize ?? 17));
  }
}

function bindEvents(): void {
  tabs.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!target) return;
    const tab = target.dataset.tab as Tab | undefined;
    if (!tab || tab === activeTab) return;
    activeTab = tab;
    activeFilter = '全部';
    search.placeholder = placeholderFor(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url);
    renderAll();
  });

  filters.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-filter]');
    if (!target) return;
    activeFilter = target.dataset.filter ?? '全部';
    renderContent();
  });

  content.addEventListener('click', (event) => {
    const reset = (event.target as HTMLElement).closest<HTMLElement>('[data-reset]');
    if (reset) {
      query = '';
      search.value = '';
      activeFilter = '全部';
      renderContent();
      return;
    }

    const card = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-skill-id], [data-monster-id]',
    );
    if (!card) return;
    if (card.dataset.skillId) openSkillOverlay(card.dataset.skillId);
    else if (card.dataset.monsterId) openMonsterOverlay(card.dataset.monsterId);
  });

  content.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-skill-id], [data-monster-id]',
    );
    if (!card) return;
    event.preventDefault();
    if (card.dataset.skillId) openSkillOverlay(card.dataset.skillId);
    else if (card.dataset.monsterId) openMonsterOverlay(card.dataset.monsterId);
  });

  overlay?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === overlay || target.closest('[data-overlay-close]')) closeOverlay();
  });

  document.addEventListener('keydown', (event) => {
    if (!overlay || overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeOverlay();
      return;
    }
    trapOverlayFocus(event);
  });

  search.addEventListener('input', () => {
    query = search.value;
    renderContent();
  });

  document.getElementById('rb-theme')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set('theme', next);
    window.history.replaceState(null, '', url);
    applyTheme(next);
  });
}

function placeholderFor(tab: Tab): string {
  if (tab === 'skills') return '搜索技能、专攻或规则…';
  if (tab === 'monsters') return '搜索怪物、神话生物或属性…';
  return '搜索武器、技能或伤害…';
}

async function init(): Promise<void> {
  applyTheme(currentTheme());
  search.placeholder = placeholderFor(activeTab);
  hydrateIcons();

  data = await loadData();
  if (data) {
    skillsById = new Map(data.skills.map((skill) => [skill.id, skill]));
    monstersById = new Map(data.monsters.map((monster) => [monster.id, monster]));
  }
  renderAll();
  bindEvents();
}

void init();
