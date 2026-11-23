/** Assemble the final self-contained HTML5 document. */

import { escapeHtml, type CompiledDocument } from './compiler';

export interface RenderOptions {
  /** Preset preview theme. Omit to use the reader's saved/system theme. */
  theme?: 'light' | 'dark';
  /** Scroll offset to restore before first paint (editor preview only). */
  scrollY?: number;
}

const STYLE = String.raw`
:root{
  --bg:#f4f1ea; --card:#fffdf8; --ink:#2b2620; --muted:#8a8176;
  --accent:#7a1f1f; --link:#6a4a9c; --keeper-bg:#fff6d6; --keeper-border:#e0a800;
  --line:#e4ddd0;
  --h3:#5a5144; --hover-bg:#efe9dc; --chip-bg:#e6ddd0; --pushbox-bg:#f0ece2;
  --handout-bg:#fbf7ee; --handout-border:#b9a98a; --ref-hover:#eee4ff;
  --thead-bg:#efe9dc; --check-border:#ccc; --atmosphere:#6b5a4a;
  --tooltip-bg:#241d17; --tooltip-fg:#f4f1ea; --tooltip-name:#ffd98a; --tooltip-muted:#b8ad9b;
  --topbar-bg:#f7f1e7; --topbar-bg-2:#f0e6d7; --topbar-fg:#2b2620; --topbar-border:#d9cdbb;
  --topbar-field:#fffdf8; --topbar-hover:rgba(78,54,30,.08); --topbar-track:rgba(78,54,30,.12);
  --sidebar-bg:#faf6ee;
  --scrollbar:#c7b8a2; --scrollbar-hover:#a58f75;
  --ok:#2d6a2d; --fail:#8a3b3b; --shadow:rgba(0,0,0,.08);
  color-scheme: light;
}
[data-theme="dark"]{
  --bg:#14120f; --card:#1e1a16; --ink:#e8e0d4; --muted:#9a9186;
  --accent:#d98a5f; --link:#b79bf0; --keeper-bg:#3a2f14; --keeper-border:#c99700;
  --line:#3a3329;
  --h3:#c9bdab; --hover-bg:#2a241c; --chip-bg:#2f2a22; --pushbox-bg:#2a241c;
  --handout-bg:#1a1611; --handout-border:#6b5a3a; --ref-hover:#372b4d;
  --thead-bg:#2a241c; --check-border:#4a4236; --atmosphere:#b09a7a;
  --tooltip-bg:#2a241c; --tooltip-fg:#f4f1ea; --tooltip-name:#ffd98a; --tooltip-muted:#b8ad9b;
  --topbar-bg:#1e1a16; --topbar-bg-2:#17130f; --topbar-fg:#e8e0d4; --topbar-border:#3a3329;
  --topbar-field:#1f1b16; --topbar-hover:rgba(255,255,255,.08); --topbar-track:rgba(255,255,255,.12);
  --sidebar-bg:#1b1713;
  --scrollbar:#463c31; --scrollbar-hover:#665847;
  --ok:#7fc77f; --fail:#e08a8a; --shadow:rgba(0,0,0,.5);
  color-scheme: dark;
}
*{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--scrollbar) transparent}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--scrollbar);border:3px solid transparent;
  border-radius:10px;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:var(--scrollbar-hover)}
::-webkit-scrollbar-corner{background:transparent}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Noto Serif SC","Songti SC",Georgia,"Times New Roman",serif;line-height:1.7}
a{color:var(--link)}
img{max-width:100%}
.skip-link{position:fixed;left:.6rem;top:-4rem;z-index:1000;background:var(--accent);color:#fff;
  padding:.5rem .8rem;border-radius:4px;transition:top .15s}
.skip-link:focus{top:.6rem}

/* ---- topbar ---- */
.topbar{position:sticky;top:0;z-index:20;display:flex;gap:1rem;align-items:center;
  padding:.7rem 1.2rem;background:linear-gradient(180deg,var(--topbar-bg),var(--topbar-bg-2));
  color:var(--topbar-fg);border-bottom:1px solid var(--topbar-border);
  box-shadow:0 2px 10px var(--shadow)}
.topbar .brand{font-weight:bold;font-size:1.05rem;letter-spacing:.02em;white-space:nowrap}
.topbar input#filter{flex:1;max-width:22rem;padding:.4rem .7rem;border:1px solid var(--topbar-border);
  border-radius:4px;background:var(--topbar-field);color:var(--ink);font-size:.95rem;font-family:inherit}
.topbar input#filter:focus{outline:2px solid var(--keeper-border);outline-offset:1px}
.topbar input#filter::placeholder{color:var(--muted)}
.tb-btn{cursor:pointer;background:none;border:1px solid var(--topbar-border);color:var(--topbar-fg);
  border-radius:4px;padding:.3rem .6rem;font-size:.8rem;font-family:inherit}
.tb-btn:hover{background:var(--topbar-hover)}
.reading-progress{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--topbar-track)}
.reading-progress span{display:block;height:100%;width:0;background:var(--keeper-border);
  transition:width .1s linear}

/* ---- layout ---- */
.layout{display:flex}
.sidebar{width:250px;min-width:250px;align-self:stretch;font-size:.85rem;
  background:var(--sidebar-bg);border-right:1px solid var(--line)}
.sidebar-inner{position:sticky;top:50px;max-height:calc(100vh - 50px);
  overflow-y:auto;padding:1rem .8rem}
.sidebar-actions{display:flex;gap:.4rem;margin-bottom:.6rem}
.sidebar-actions button{cursor:pointer;font-size:.72rem;padding:.2rem .5rem;border:1px solid var(--line);
  background:var(--card);color:var(--muted);border-radius:4px;font-family:inherit}
.sidebar-actions button:hover{color:var(--accent);border-color:var(--accent)}
.toc-details{margin:.35rem 0}
.toc-details summary{display:flex;align-items:center;gap:.35rem;cursor:pointer;font-weight:bold;color:var(--accent);
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif;
  font-size:.8rem;letter-spacing:.04em;list-style:none;user-select:none;
  padding:.15rem .3rem .15rem calc(.3rem + var(--toc-depth,0) * .7rem)}
.toc-details summary::-webkit-details-marker{display:none}
.toc-details summary::before{content:'▸ ';display:inline-block;flex:0 0 auto;transition:transform .15s}
.toc-details[open] summary::before{transform:rotate(90deg)}
.toc-summary-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc-jump{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;
  width:1.25rem;height:1.25rem;border-radius:3px;color:var(--muted);
  font-size:.72rem;font-weight:normal;line-height:1;text-decoration:none;opacity:.55}
.toc-details summary:hover{background:var(--hover-bg)}
.toc-details summary:hover .toc-jump,.toc-jump:focus-visible{opacity:1}
.toc-jump:hover,.toc-jump:focus-visible{color:var(--accent);background:var(--chip-bg);
  outline:2px solid var(--keeper-border);outline-offset:1px}
.toc-link{display:block;color:var(--ink);text-decoration:none;
  border-left:2px solid transparent;font-size:.85rem;
  padding:.12rem .3rem .12rem calc(.3rem + var(--toc-depth,0) * .7rem)}
.toc-link:hover{color:var(--accent);border-left-color:var(--accent);background:var(--hover-bg)}
main{flex:1;padding:1.5rem 2rem;max-width:900px;min-width:0}

/* ---- narrow-screen sidebar drawer ---- */
.sidebar-fab,.sidebar-hotzone,.sidebar-backdrop{display:none}
@media (max-width:1000px){
  .sidebar{position:fixed;top:50px;left:0;bottom:0;z-index:40;width:min(300px,86vw);
    min-width:0;overflow:hidden;border-right:1px solid var(--line);
    box-shadow:6px 0 24px rgba(0,0,0,.22);transform:translateX(-100%);
    transition:transform .2s ease}
  .sidebar.is-open{transform:translateX(0)}
  .sidebar-inner{position:static;max-height:none;height:100%;padding-top:1.2rem}
  .sidebar-hotzone{display:block;position:fixed;left:0;top:50px;bottom:0;width:10%;
    z-index:35;padding:0;border:0;background:transparent;cursor:pointer}
  .sidebar-hotzone:focus-visible{outline:2px solid var(--keeper-border);outline-offset:-4px}
  .sidebar-fab{display:inline-flex;position:fixed;left:12px;bottom:14px;z-index:41;
    align-items:center;gap:.4rem;padding:.55rem .85rem;border-radius:999px;
    border:1px solid var(--topbar-border);background:var(--topbar-bg);color:var(--topbar-fg);
    box-shadow:0 4px 14px var(--shadow);font-family:inherit;font-size:.8rem;cursor:pointer}
  .sidebar-fab:hover{background:var(--topbar-hover)}
  body.sidebar-open{overflow:hidden}
  body.sidebar-open .sidebar-fab{border-color:var(--accent);color:var(--accent)}
  .sidebar-backdrop{display:block;position:fixed;left:0;right:0;top:50px;bottom:0;z-index:39;
    background:rgba(20,14,9,.34);opacity:0;visibility:hidden;pointer-events:none;
    transition:opacity .2s ease,visibility .2s}
  body.sidebar-open .sidebar-backdrop{opacity:1;visibility:visible;pointer-events:auto}
}

/* ---- hero ---- */
.hero{background:var(--card);border:1px solid var(--line);border-radius:8px;
  padding:1.4rem 1.6rem;margin-bottom:1.5rem;box-shadow:0 1px 4px var(--shadow)}
.hero h1{margin:0 0 .2rem;color:var(--accent);font-size:1.9rem;line-height:1.3}
.hero .subtitle{font-style:italic;color:var(--muted)}
.hero .summary{margin:.7rem 0}
.meta-row{display:flex;flex-wrap:wrap;gap:.4rem .8rem;font-size:.85rem;color:var(--muted)}
.meta-item strong{text-transform:capitalize;color:var(--h3);margin-right:.2rem}

/* ---- prose ---- */
main p{margin:.7em 0}
main ul,main ol{padding-left:1.5em}
main blockquote{margin:.8rem 0;padding:.4rem .9rem;border-left:3px solid var(--line);
  color:var(--atmosphere);background:var(--card)}
main code{background:var(--chip-bg);border-radius:3px;padding:.05em .3em;font-size:.9em}
main pre{overflow:auto;background:var(--pushbox-bg);padding:.8rem 1rem;border-radius:6px}
main table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.92rem}
main th,main td{border:1px solid var(--line);padding:.35rem .55rem;text-align:left}
main th{background:var(--thead-bg)}

/* ---- chapters ---- */
.chapter{margin:0 0 6px}
.chapter-head{display:flex;align-items:baseline;gap:8px}
.chapter-head h1,.chapter-head h2,.chapter-head h3,
.chapter-head h4,.chapter-head h5,.chapter-head h6{margin:.6em 0 .3em;color:var(--ink)}
.chapter-head h2{color:var(--accent)}
.chapter-head h3{color:var(--h3)}
.chapter-body{display:grid;grid-template-rows:1fr;padding-left:0;
  transition:grid-template-rows .28s ease,opacity .2s ease}
.chapter-body-inner{min-height:0;overflow:hidden}
.chapter.collapsed>.chapter-body{grid-template-rows:0fr;opacity:0;visibility:hidden;
  transition:grid-template-rows .28s ease,opacity .2s ease,visibility 0s .28s}
.chapter.no-fold-animation>.chapter-body{transition:none}
.fold-toggle{display:inline-flex;align-items:center;justify-content:center;border:0;
  background:transparent;color:var(--muted);cursor:pointer;font-size:.8rem;padding:0 4px;
  font-family:inherit}
.fold-toggle:hover{color:var(--accent)}
.fold-chevron{display:inline-block;line-height:1;font-size:1.5rem;transition:transform .2s ease}
.chapter.collapsed .fold-chevron{transform:rotate(-90deg)}

/* ---- type badges ---- */
.type-badge{display:inline-block;font-size:.64rem;font-weight:bold;color:#fff;
  padding:.1rem .5rem;border-radius:10px;vertical-align:middle;letter-spacing:.05em;
  text-transform:uppercase;margin-right:.3rem;flex:0 0 auto;
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif}
.type-npc{background:#7a3b1f}.type-location{background:#2d7a4f}
.type-clue{background:#5b3b8a}.type-myth{background:#a02020}
.type-aloud{background:#286068}.type-handout{background:#555}

/* ---- xref / clue ---- */
a.xref{color:var(--link);text-decoration:none;border-bottom:1px dotted var(--link);
  padding:0 .05rem;cursor:pointer}
a.xref:hover{background:var(--ref-hover);border-bottom-style:solid}
.clue{background:var(--chip-bg);border-radius:4px;padding:0 .3rem;color:var(--ink);
  border-bottom:1px dashed var(--accent);cursor:help}

/* ---- skill checks ---- */
.skill-check{font-style:normal;font-weight:600;color:var(--accent);cursor:help;
  border-bottom:1px dashed var(--accent);border-radius:2px;padding:0 .06em}
.skill-check:hover,.skill-check:focus-visible{background:var(--ref-hover);outline:none}

/* ---- blocks (aloud / handout) ---- */
.block{margin:14px 0;border:1px solid var(--line);border-radius:8px;overflow:hidden;
  background:var(--card);box-shadow:0 1px 3px var(--shadow);scroll-margin-top:64px}
.block summary{list-style:none;cursor:pointer;display:flex;flex-wrap:wrap;
  align-items:center;gap:8px;padding:.5rem .8rem;user-select:none}
.block summary::-webkit-details-marker{display:none}
.block .block-label{font-weight:bold}
.block .block-preview{color:var(--muted);font-size:.85em;flex:1 1 auto}
.aloud-block{border-left:3px solid var(--accent)}
.aloud-content{background:var(--pushbox-bg);margin:0;padding:.8rem 1rem;white-space:pre-wrap;
  font-family:inherit;border-top:1px dashed var(--line);font-size:.95em}
.handout-block{border-left:3px solid var(--handout-border)}
.handout-content{background:var(--handout-bg);margin:0;padding:.6rem .9rem;font-family:'Courier New',monospace;
  font-size:.88rem;white-space:pre-wrap;border-top:1px dashed var(--handout-border)}
.handout-img{max-width:100%;border:1px solid var(--line);border-radius:6px}

/* ---- keeper box ---- */
.keeper{background:var(--keeper-bg);border:1px solid var(--keeper-border);
  border-left:5px solid var(--keeper-border);border-radius:6px;margin:.8rem 0;scroll-margin-top:64px}
.keeper details>summary{list-style:none;cursor:pointer;user-select:none}
.keeper details>summary::-webkit-details-marker{display:none}
.keeper-head{display:flex;align-items:center;gap:8px;padding:.3rem .6rem .2rem .4rem}
.keeper-label{display:inline-block;background:var(--keeper-border);color:#3a2c00;
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif;
  font-size:.66rem;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;
  padding:.12rem .5rem;border-radius:0 0 6px 0;flex:0 0 auto}
.keeper .block-label{font-weight:bold}
.keeper-body{padding:.1rem .8rem .6rem}
.keeper-body p{margin:.35rem 0}

/* ---- entity cards (npc / mob / enemy) ---- */
.entity{background:var(--card);border:1px solid var(--line);border-radius:8px;
  margin:.8rem 0;box-shadow:0 1px 3px var(--shadow);scroll-margin-top:64px;overflow:hidden}
.entity details>summary{list-style:none;cursor:pointer;user-select:none}
.entity details>summary::-webkit-details-marker{display:none}
.entity-head{display:flex;align-items:center;gap:8px;padding:.5rem .8rem;border-bottom:1px solid var(--line)}
.entity .block-label{font-weight:bold}
.block .block-label,.keeper .block-label,.entity .block-label{
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif}
.entity-body{padding:.5rem .9rem .7rem}
.entity-body p{margin:.35rem 0}
.char-stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(3.6rem,1fr));
  gap:6px;margin:.55rem 0 .2rem}
.char-stat{display:flex;flex-direction:column;align-items:center;gap:1px;
  padding:6px 4px 5px;border:1px solid var(--line);border-radius:6px;background:var(--pushbox-bg)}
.char-stat span{color:var(--muted);font-size:.6rem;font-weight:700;letter-spacing:.09em;
  font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei","Heiti SC",sans-serif}
.char-stat strong{color:var(--ink);font-size:.92rem;font-variant-numeric:tabular-nums;
  line-height:1.3;white-space:nowrap}
.char-meta{display:grid;margin:.55rem 0 0;border-top:1px solid var(--line)}
.char-meta-row{display:grid;grid-template-columns:5.2em minmax(0,1fr);gap:.6rem;
  padding:.35rem 0;border-bottom:1px dotted var(--line)}
.char-meta-row:last-child{border-bottom:0}
.char-meta-row dt{color:var(--muted);font-size:.72rem;letter-spacing:.04em;white-space:nowrap}
.char-meta-row dd{margin:0;color:var(--ink);font-size:.86rem;line-height:1.6;white-space:pre-wrap}
.type-npc-entity{border-left:4px solid #7a3b1f}
.type-myth-entity{border-left:4px solid #a02020}

/* ---- copy button ---- */
.copy-btn{border:1px solid var(--line);background:var(--card);color:var(--muted);
  border-radius:5px;padding:2px 10px;font-size:.72rem;cursor:pointer;margin-left:auto;
  font-family:inherit;flex:0 0 auto}
.copy-btn:hover{color:var(--accent);border-color:var(--accent)}

/* ---- xref target highlight ---- */
.xref-target{animation:xref-flash 2s ease-out}
@keyframes xref-flash{0%{background:var(--keeper-bg)}100%{background:transparent}}

/* ---- tooltip ---- */
#tooltip{position:fixed;display:none;z-index:100;max-width:320px;background:var(--tooltip-bg);
  color:var(--tooltip-fg);border-radius:6px;padding:.6rem .75rem;font-size:.82rem;
  box-shadow:0 4px 14px rgba(0,0,0,.45)}
#tooltip .tip-name{font-weight:bold;color:var(--tooltip-name);margin-bottom:.25rem}
#tooltip .tip-preview{color:var(--tooltip-fg);opacity:.9;white-space:pre-wrap}
#tooltip .tip-base{color:var(--tooltip-muted);font-size:.78rem;margin-top:.3rem}
#tooltip .tip-pager{color:var(--tooltip-muted);font-size:.78rem;margin-top:.3rem}
#tooltip .tip-go{margin-top:.5rem;border:1px solid var(--tooltip-name);background:transparent;
  color:var(--tooltip-name);border-radius:5px;padding:2px 12px;cursor:pointer;font-size:.8rem;
  font-family:inherit}
#tooltip .tip-go:hover{background:rgba(255,255,255,.1)}

/* ---- index ---- */
.index{border-top:2px solid var(--accent);margin-top:2rem;padding-top:1rem}
.index h2{margin:.3rem 0 .6rem;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;
  font-size:1.2rem}
.index-group{margin:.8rem 0}
.index-group h3{margin:0 0 .3rem;font-size:.95rem;color:var(--h3);border-bottom:1px solid var(--line);
  padding-bottom:.2rem}
.index-group p{margin:0}
.index-group .xref{margin-right:14px}

/* ---- print / responsive ---- */
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .xref-target{animation:none;outline:2px solid var(--keeper-border);outline-offset:2px}
  .chapter-body,.fold-chevron{transition:none}
}
@media print{
  .topbar,.sidebar,.skip-link,.fold-toggle{display:none}
  main{max-width:none;padding:0}
  .block,.entity,.keeper{box-shadow:none;break-inside:avoid}
  details{display:block}
  details>summary{list-style:none}
  .chapter-body{display:grid!important;grid-template-rows:1fr!important;
    opacity:1!important;visibility:visible!important}
}
@media (max-width:760px){
  .layout{display:block}
  .sidebar{width:min(300px,88vw)}
  main{padding:1rem 1rem 4.5rem;max-width:none}
  .topbar{gap:.5rem;padding:.6rem .7rem}
  .topbar input#filter{max-width:none;min-width:0}
  .topbar .brand{max-width:45vw;overflow:hidden;text-overflow:ellipsis}
  .hero{padding:1rem 1.1rem}
  .hero h1{font-size:1.5rem}
}
`;

const SCRIPT = String.raw`
(function () {
  "use strict";

  var root = document.documentElement;
  var tip = document.getElementById("tooltip");
  var isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  var skillData = {};
  var skillNode = document.getElementById("skill-data");
  if (skillNode) {
    try { skillData = JSON.parse(skillNode.textContent || "{}"); } catch (e) { skillData = {}; }
  }

  // ---- theme ---------------------------------------------------------
  function setTheme(mode) {
    root.setAttribute("data-theme", mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#1c1814" : "#f7f1e7");
  }
  var preset = root.getAttribute("data-theme");
  if (preset === "light" || preset === "dark") {
    setTheme(preset);
  } else {
    var saved = null;
    try { saved = localStorage.getItem("CoDices-theme"); } catch (e) {}
    var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(saved === "light" || saved === "dark" ? saved : (dark ? "dark" : "light"));
  }
  var themeButton = document.getElementById("theme-toggle");
  if (themeButton) themeButton.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem("CoDices-theme", next); } catch (e) {}
  });
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (data && data.type === "CoDices:theme" && (data.theme === "light" || data.theme === "dark")) {
      setTheme(data.theme);
    }
  });

  // ---- reading progress ---------------------------------------------
  var progress = document.getElementById("reading-progress-bar");
  function updateProgress() {
    if (!progress) return;
    var height = document.documentElement.scrollHeight - window.innerHeight;
    var ratio = height > 0 ? window.scrollY / height : 0;
    progress.style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  // ---- editor scroll-sync anchor cache --------------------------------
  // Folded chapters, filtered blocks, images and font swaps all change the
  // vertical geometry used by the editor bridge. Mark it dirty instead of
  // measuring the whole document on every scroll event.
  var syncAnchorsDirty = true;
  function invalidateSyncAnchors() { syncAnchorsDirty = true; }
  window.addEventListener("resize", invalidateSyncAnchors);
  window.addEventListener("load", invalidateSyncAnchors, true);
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(invalidateSyncAnchors);
  }

  // ---- filter --------------------------------------------------------
  var filter = document.getElementById("filter");
  if (filter) filter.addEventListener("input", function () {
    var query = this.value.toLowerCase().trim();
    document.querySelectorAll(".block,.keeper,.entity").forEach(function (el) {
      var name = (el.getAttribute("data-name") || "").toLowerCase();
      var type = (el.getAttribute("data-type") || "").toLowerCase();
      el.style.display = (!query || name.indexOf(query) >= 0 || type.indexOf(query) >= 0) ? "" : "none";
    });
    invalidateSyncAnchors();
  });

  // ---- toc expand / collapse -----------------------------------------
  var expand = document.getElementById("toc-expand");
  var collapse = document.getElementById("toc-collapse");
  if (expand) expand.addEventListener("click", function () {
    document.querySelectorAll(".toc-details").forEach(function (d) { d.open = true; });
  });
  if (collapse) collapse.addEventListener("click", function () {
    document.querySelectorAll(".toc-details").forEach(function (d) { d.open = false; });
  });

  // ---- narrow-screen sidebar drawer -----------------------------------
  var sidebar = document.getElementById("sidebar");
  var sidebarFab = document.getElementById("sidebar-fab");
  var sidebarHotzone = document.getElementById("sidebar-hotzone");
  var sidebarBackdrop = document.getElementById("sidebar-backdrop");
  var narrowScreen = window.matchMedia("(max-width: 1000px)");
  var mobileScreen = window.matchMedia("(max-width: 760px)");
  var hotzoneTimer = null;
  var leaveTimer = null;
  function sidebarIsOpen() {
    return !!sidebar && sidebar.classList.contains("is-open");
  }
  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("is-open", open);
    document.body.classList.toggle("sidebar-open", open && narrowScreen.matches);
    sidebar.inert = narrowScreen.matches ? !open : false;
    if (sidebarFab) {
      sidebarFab.setAttribute("aria-expanded", open ? "true" : "false");
      sidebarFab.setAttribute("aria-label", open ? "关闭目录" : "打开目录");
      sidebarFab.textContent = open ? "✕ 关闭" : "☰ 目录";
    }
  }
  function closeSidebar() { setSidebar(false); }

  if (sidebar) {
    if (sidebarFab) sidebarFab.addEventListener("click", function () {
      setSidebar(!sidebarIsOpen());
    });
    if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeSidebar);
    if (sidebarHotzone) {
      sidebarHotzone.addEventListener("mouseenter", function () {
        clearTimeout(leaveTimer);
        clearTimeout(hotzoneTimer);
        hotzoneTimer = setTimeout(function () { setSidebar(true); }, 500);
      });
      sidebarHotzone.addEventListener("mouseleave", function () {
        clearTimeout(hotzoneTimer);
        if (sidebarIsOpen()) {
          clearTimeout(leaveTimer);
          leaveTimer = setTimeout(closeSidebar, 450);
        }
      });
      sidebarHotzone.addEventListener("click", function () { setSidebar(true); });
      sidebarHotzone.addEventListener("focus", function () { setSidebar(true); });
    }
    sidebar.addEventListener("mouseenter", function () { clearTimeout(leaveTimer); });
    sidebar.addEventListener("mouseleave", function () {
      if (mobileScreen.matches) return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(closeSidebar, 450);
    });
    sidebar.addEventListener("click", function (event) {
      var target = event.target;
      if (target instanceof Element && target.closest("a.toc-link")) closeSidebar();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && sidebarIsOpen()) closeSidebar();
    });
    if (narrowScreen.addEventListener) {
      narrowScreen.addEventListener("change", function () { closeSidebar(); });
    }
    setSidebar(false);
  }

  // ---- chapter folding -----------------------------------------------
  document.querySelectorAll(".fold-toggle").forEach(function (button) {
    button.addEventListener("click", function () {
      var chapter = button.closest(".chapter");
      if (!chapter) return;
      var collapsed = chapter.classList.toggle("collapsed");
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.setAttribute("aria-label", collapsed ? "展开章节" : "折叠章节");
      invalidateSyncAnchors();
    });
  });
  document.addEventListener("toggle", invalidateSyncAnchors, true);
  ["transitionend", "transitioncancel"].forEach(function (name) {
    document.addEventListener(name, function (event) {
      var target = event.target;
      if (target instanceof Element && target.classList.contains("chapter-body")) {
        invalidateSyncAnchors();
      }
    }, true);
  });

  // ---- copy ----------------------------------------------------------
  function copyText(text, button) {
    function done() {
      var old = button.textContent;
      button.textContent = "已复制";
      setTimeout(function () { button.textContent = old; }, 1200);
    }
    function fallback() {
      var area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(area);
      done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }
  document.querySelectorAll(".copy-btn").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var block = button.closest(".block,.keeper,.entity");
      if (block) copyText(block.getAttribute("data-copy-src") || "", button);
    });
  });

  // ---- xref data helpers ---------------------------------------------
  function targetsOf(el) {
    try { return JSON.parse(el.getAttribute("data-targets") || "[]"); }
    catch (e) { return []; }
  }
  function indexOf(el) {
    return parseInt(el.getAttribute("data-index") || "0", 10);
  }
  function setIndex(el, index) {
    var targets = targetsOf(el);
    if (!targets.length) return;
    index = ((index % targets.length) + targets.length) % targets.length;
    el.setAttribute("data-index", String(index));
    el.setAttribute("href", "#" + targets[index].id);
    var base = el.getAttribute("data-label") || targets[index].label;
    el.textContent = targets.length === 1 ? base : base + " (" + (index + 1) + "/" + targets.length + ")";
  }

  // ---- tooltip -------------------------------------------------------
  function showTip(el) {
    if (!tip) return;
    var targets = targetsOf(el);
    if (!targets.length) return;
    var index = indexOf(el);
    var target = targets[index];
    tip.innerHTML =
      '<div class="tip-name"></div><div class="tip-preview"></div>' +
      (targets.length > 1 ? '<div class="tip-pager"></div>' : "") +
      '<button class="tip-go" type="button">前往</button>';
    tip.querySelector(".tip-name").textContent = target.label;
    tip.querySelector(".tip-preview").textContent = target.preview || "";
    if (targets.length > 1) {
      tip.querySelector(".tip-pager").textContent = (index + 1) + " / " + targets.length;
    }
    tip.style.display = "block";
    var go = tip.querySelector(".tip-go");
    go.addEventListener("click", function () { jumpTo(el); hideTip(); });
    positionTip(el);
  }
  function positionTip(el, x, y) {
    if (!tip) return;
    var rect = el.getBoundingClientRect();
    var width = tip.offsetWidth;
    var height = tip.offsetHeight;
    var left = (x != null ? x : rect.left);
    var top = (y != null ? y : rect.bottom + 6);
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (top + height > window.innerHeight - 8) {
      top = (y != null ? y - height - 6 : rect.top - height - 6);
    }
    tip.style.left = Math.max(4, left) + "px";
    tip.style.top = Math.max(4, top) + "px";
  }
  function hideTip() { if (tip) tip.style.display = "none"; }

  function showSkillTip(el) {
    if (!tip) return;
    var skill = skillData[el.getAttribute("data-skill") || ""];
    if (!skill) return;
    var difficulty = el.getAttribute("data-skill-difficulty") || "";
    tip.innerHTML =
      '<div class="tip-name"></div><div class="tip-preview"></div>' +
      (skill.base ? '<div class="tip-base"></div>' : "");
    tip.querySelector(".tip-name").textContent =
      (difficulty ? difficulty + " · " : "") + (skill.name || "");
    tip.querySelector(".tip-preview").textContent = skill.description || "";
    var base = tip.querySelector(".tip-base");
    if (base) base.textContent = "基础值 " + skill.base;
    tip.style.display = "block";
    positionTip(el);
  }

  document.querySelectorAll(".skill-check").forEach(function (el) {
    el.addEventListener("mouseenter", function () { showSkillTip(el); });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("focus", function () { showSkillTip(el); });
    el.addEventListener("blur", hideTip);
    el.addEventListener("click", function (event) {
      event.preventDefault();
      showSkillTip(el);
    });
  });

  // ---- jump & highlight ----------------------------------------------
  function jumpToId(id) {
    var target = document.getElementById(id);
    if (!target) return;
    var parent = target;
    var expanded = [];
    while (parent) {
      if (parent.tagName === "DETAILS") parent.setAttribute("open", "");
      if (parent.classList && parent.classList.contains("chapter")) {
        if (parent.classList.contains("collapsed")) {
          // Expand instantly so scrolling to the target does not race the
          // chapter-height transition.
          parent.classList.add("no-fold-animation");
          parent.classList.remove("collapsed");
          expanded.push(parent);
        }
        var toggle = parent.querySelector(".chapter-head .fold-toggle");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "true");
          toggle.setAttribute("aria-label", "折叠章节");
        }
      }
      parent = parent.parentElement;
    }
    if (expanded.length) {
      void target.offsetWidth;
      window.requestAnimationFrame(function () {
        expanded.forEach(function (chapter) {
          chapter.classList.remove("no-fold-animation");
        });
      });
    }
    target.classList.remove("xref-target");
    void target.offsetWidth;
    target.classList.add("xref-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function jumpTo(el) {
    var targets = targetsOf(el);
    if (!targets.length) return;
    jumpToId(targets[indexOf(el)].id);
  }

  function followTocLink(link, event) {
    var href = link.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;
    event.preventDefault();
    event.stopPropagation();
    jumpToId(href.slice(1));
    // srcdoc iframes cannot rewrite their about:srcdoc URL. Building the
    // standalone file still gets deep-linkable headings, while previews
    // simply skip the address-bar update.
    try {
      if (history.replaceState) history.replaceState(null, "", href);
    } catch (e) {}
    closeSidebar();
  }

  document.querySelectorAll(".toc-jump").forEach(function (link) {
    link.addEventListener("click", function (event) {
      followTocLink(link, event);
    });
  });

  document.querySelectorAll("a.toc-link").forEach(function (link) {
    link.addEventListener("click", function (event) {
      followTocLink(link, event);
    });
  });

  var current = null;
  document.querySelectorAll(".xref").forEach(function (el) {
    if (isTouch) {
      el.addEventListener("click", function (event) {
        if (el.getAttribute("data-card-open") === "1") {
          el.removeAttribute("data-card-open");
          hideTip();
          jumpTo(el);
          event.preventDefault();
        } else {
          el.setAttribute("data-card-open", "1");
          showTip(el);
          event.preventDefault();
        }
      });
    } else {
      var showTimer = null;
      var hideTimer = null;
      el.addEventListener("mouseenter", function () {
        clearTimeout(hideTimer);
        showTimer = setTimeout(function () { current = el; showTip(el); }, 200);
      });
      el.addEventListener("mouseleave", function () {
        clearTimeout(showTimer);
        current = null;
        hideTimer = setTimeout(hideTip, 100);
      });
      el.addEventListener("mousemove", function (event) {
        if (current === el && tip && tip.style.display === "block") {
          positionTip(el, event.clientX, event.clientY);
        }
      });
      el.addEventListener("click", function (event) {
        event.preventDefault();
        jumpTo(el);
      });
      el.addEventListener("wheel", function (event) {
        var targets = targetsOf(el);
        if (targets.length < 2) return;
        event.preventDefault();
        setIndex(el, indexOf(el) + (event.deltaY > 0 ? 1 : -1));
        showTip(el);
      }, { passive: false });
    }
  });

  document.addEventListener("click", function (event) {
    if (!isTouch || !tip) return;
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (!tip.contains(target) && !target.closest(".xref") && !target.closest(".skill-check")) {
      hideTip();
      document.querySelectorAll(".xref[data-card-open]").forEach(function (link) {
        link.removeAttribute("data-card-open");
      });
    }
  });

  window.addEventListener("hashchange", function () {
    if (location.hash.length > 1) jumpToId(decodeURIComponent(location.hash.slice(1)));
  });

  // ---- sandboxed preview bridge ---------------------------------------
  // When embedded by the editor, keep the parent informed of scrolling and
  // accept scroll restoration / anchor-sync requests. Exported files ignore
  // this block entirely.
  if (window.parent && window.parent !== window) {
    var suppressNotifyUntil = 0;
    var anchorCache = null;

    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }
    function scrollRatio() {
      var max = maxScroll();
      return max > 0 ? window.scrollY / max : 0;
    }
    function topbarHeight() {
      var bar = document.querySelector(".topbar");
      return bar ? Math.max(0, bar.offsetHeight) : 0;
    }
    function documentTop(element) {
      return element.getBoundingClientRect().top + window.scrollY;
    }
    // A folded chapter still lays out its body (it is clipped, not removed),
    // so anchors inside it have meaningless positions. Map them to the
    // highest collapsed ancestor heading instead of auto-expanding folds.
    function resolveAnchor(element) {
      var resolved = element;
      var node = element;
      while (node && node !== document.body) {
        if (
          node.classList
          && node.classList.contains("chapter")
          && node.classList.contains("collapsed")
        ) {
          var head = node.firstElementChild;
          if (head && head.classList.contains("chapter-head") && !head.contains(element)) {
            var heading = head.querySelector("h1,h2,h3,h4,h5,h6");
            if (heading && heading.id) resolved = heading;
          }
        }
        node = node.parentElement;
      }
      return resolved;
    }
    function buildAnchorCache() {
      var elements = document.querySelectorAll("[data-sync-anchor][id]");
      var resolved = Object.create(null);
      var tops = Object.create(null);
      var seen = Object.create(null);
      var list = [];
      Array.prototype.forEach.call(elements, function (element) {
        var target = resolveAnchor(element);
        resolved[element.id] = target && target.id ? target.id : null;
        if (!target || !target.id) return;
        if (target.getClientRects().length === 0) {
          tops[target.id] = null;
          return;
        }
        if (seen[target.id]) return;
        seen[target.id] = true;
        tops[target.id] = documentTop(target);
        list.push({ id: target.id, top: tops[target.id] });
      });
      list.sort(function (a, b) { return a.top - b.top; });
      anchorCache = { list: list, resolved: resolved, tops: tops };
      syncAnchorsDirty = false;
      return anchorCache;
    }
    function getAnchorCache() {
      if (!anchorCache || syncAnchorsDirty) buildAnchorCache();
      return anchorCache;
    }
    function anchorTop(id) {
      if (!id) return null;
      var cache = getAnchorCache();
      var target = cache.resolved[id];
      if (!target) return null;
      var top = cache.tops[target];
      return typeof top === "number" ? top : null;
    }
    function currentAnchorState() {
      var cache = getAnchorCache();
      var bar = topbarHeight();
      var position = window.scrollY + bar;
      var list = cache.list;
      var previous = null;
      var next = null;
      for (var i = 0; i < list.length; i += 1) {
        if (list[i].top <= position) previous = list[i];
        else {
          next = list[i];
          break;
        }
      }
      var fromTop = previous ? previous.top : bar;
      var toTop = next ? next.top : maxScroll() + bar;
      var progress = toTop > fromTop
        ? Math.max(0, Math.min(1, (position - fromTop) / (toTop - fromTop)))
        : 0;
      return {
        anchor: previous ? previous.id : null,
        next: next ? next.id : null,
        progress: progress
      };
    }
    function postScrollState() {
      var anchors = currentAnchorState();
      try {
        window.parent.postMessage({
          type: "CoDices:scroll",
          y: window.scrollY,
          ratio: scrollRatio(),
          anchor: anchors.anchor,
          next: anchors.next,
          progress: anchors.progress
        }, "*");
      } catch (e) {}
    }
    function notifyScroll() {
      if (Date.now() < suppressNotifyUntil) return;
      postScrollState();
    }
    function applyScroll(y) {
      // Programmatic alignment is a mechanical jump: suppress the automatic
      // scroll event, then report the final position once so the parent always
      // knows where to restore the preview after the next compile.
      suppressNotifyUntil = Date.now() + 90;
      var previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      try { window.scrollTo(0, y); } catch (e) {}
      root.style.scrollBehavior = previous;
      postScrollState();
    }
    function targetScrollY(anchor, next, progress) {
      var fromTop = anchorTop(anchor);
      var toTop = anchorTop(next);
      if (anchor && fromTop === null) return null;
      if (next && toTop === null) return null;
      if (!anchor && !next) return null;
      var bar = topbarHeight();
      var max = maxScroll();
      var start = fromTop === null ? bar : fromTop;
      var end = toTop === null ? max + bar : toTop;
      var bounded = typeof progress === "number" && isFinite(progress)
        ? Math.max(0, Math.min(1, progress))
        : 0;
      var position = end > start ? start + (end - start) * bounded : start;
      return Math.max(0, Math.min(max, position - bar));
    }

    window.addEventListener("scroll", notifyScroll, { passive: true });
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data) return;
      if (data.type === "CoDices:scrollTo" && typeof data.y === "number") {
        applyScroll(data.y);
      } else if (data.type === "CoDices:scrollToAnchor") {
        var target = targetScrollY(data.anchor, data.next, data.progress);
        if (target !== null) {
          applyScroll(target);
        } else if (typeof data.ratio === "number") {
          applyScroll(Math.max(0, Math.min(1, data.ratio)) * maxScroll());
        }
      } else if (data.type === "CoDices:scrollToRatio" && typeof data.ratio === "number") {
        var ratio = Math.max(0, Math.min(1, data.ratio));
        applyScroll(ratio * maxScroll());
      }
    });
  }
})();
`;

function renderHero(doc: CompiledDocument): string {
  const title = doc.title || '模组';
  const subtitle = String(doc.meta.system ?? '');
  const metaItems: string[] = [];

  for (const [key, value] of Object.entries(doc.meta)) {
    if (key === 'system') continue;
    const text = Array.isArray(value) ? value.map(String).join('、') : String(value);
    metaItems.push(
      `<span class="meta-item"><strong>${escapeHtml(key)}</strong>${escapeHtml(text)}</span>`,
    );
  }

  let hero = `<section class="hero"><h1>${escapeHtml(title)}</h1>`;
  if (subtitle) hero += `<div class="subtitle">${escapeHtml(subtitle)}</div>`;
  if (doc.summary) hero += `<div class="summary">${escapeHtml(doc.summary)}</div>`;
  if (metaItems.length) hero += `<div class="meta-row">${metaItems.join('')}</div>`;
  hero += '</section>';
  return hero;
}

export function renderPage(doc: CompiledDocument, options: RenderOptions = {}): string {
  const title = doc.title || '模组';
  const titleEscaped = escapeHtml(title);
  const themeAttr = options.theme ? ` data-theme="${options.theme}"` : '';
  const restoreScroll = typeof options.scrollY === 'number' && Number.isFinite(options.scrollY)
    ? Math.max(0, Math.round(options.scrollY))
    : null;
  const scrollScript = restoreScroll === null
    ? ''
    : `<script>try{var r=document.documentElement;r.style.scrollBehavior="auto";window.scrollTo(0,${restoreScroll});r.style.scrollBehavior="";}catch(e){}</script>`;
  const skillData = doc.skills.length
    ? Object.fromEntries(doc.skills.map((skill) => [skill.id, skill]))
    : null;
  const skillScript = skillData
    ? `<script type="application/json" id="skill-data">${JSON.stringify(skillData).replace(/</g, '\\u003c')}</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN"${themeAttr}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f7f1e7">
<meta name="generator" content="CoDices">
<script>(function(){try{var r=document.documentElement;if(r.getAttribute("data-theme")!=="light"&&r.getAttribute("data-theme")!=="dark"){var s=localStorage.getItem("CoDices-theme");var d=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;r.setAttribute("data-theme",s==="light"||s==="dark"?s:(d?"dark":"light"));}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",r.getAttribute("data-theme")==="dark"?"#1c1814":"#f7f1e7");}catch(e){}})();</script>
<title>${titleEscaped}</title>
<style>${STYLE}</style>
</head>
<body>
<a class="skip-link" href="#content">跳到正文</a>
<div class="topbar"><div class="brand">${titleEscaped}</div><input id="filter" type="search" placeholder="按名字或类型筛选…" aria-label="筛选内容"><button id="theme-toggle" class="tb-btn" type="button" title="切换明暗主题" aria-label="切换明暗主题">&#9681;</button><div class="reading-progress" aria-hidden="true"><span id="reading-progress-bar"></span></div></div>
<button class="sidebar-hotzone" id="sidebar-hotzone" type="button" aria-controls="sidebar" aria-label="打开目录"></button>
<div class="layout"><aside class="sidebar" id="sidebar"><div class="sidebar-inner">${doc.sidebarHtml}</div></aside>
<main id="content">
${renderHero(doc)}
${doc.bodyHtml}
${doc.indexHtml}
</main></div>
<div class="sidebar-backdrop" id="sidebar-backdrop" aria-hidden="true"></div>
<button class="sidebar-fab" id="sidebar-fab" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="打开目录">☰ 目录</button>
<div id="tooltip" role="tooltip"></div>
${skillScript}
${scrollScript}
<script>${SCRIPT}</script>
</body>
</html>
`;
}
