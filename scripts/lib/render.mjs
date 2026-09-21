// グラレコ（グラフィックレコーディング）風 HTML のレンダラ。
// 外部ライブラリ・外部JSに依存せず、インライン SVG + CSS だけで描画する。
import { jstLabel } from './util.mjs';

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple'];

// ─────────────────────────────────────────────
// SVG パーツ（手描き風）
// ─────────────────────────────────────────────
const svgDefs = `
<svg class="gr-defs" aria-hidden="true" focusable="false">
  <defs>
    <filter id="rough" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="rough-soft" x="-12%" y="-12%" width="124%" height="124%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" result="n2"/>
      <feDisplacementMap in="SourceGraphic" in2="n2" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
  </defs>
</svg>`;

const squiggle = (w = 220) => `
<svg class="gr-squiggle" viewBox="0 0 ${w} 12" preserveAspectRatio="none" aria-hidden="true">
  <path d="M2,8 C ${w * 0.15},2 ${w * 0.3},11 ${w * 0.45},6 S ${w * 0.75},2 ${w - 2},7"
        fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" filter="url(#rough)"/>
</svg>`;

const arrowDown = () => `
<svg class="gr-arrow" viewBox="0 0 40 64" aria-hidden="true">
  <path d="M20,4 C14,20 26,34 19,58" fill="none" stroke="currentColor" stroke-width="3"
        stroke-linecap="round" marker-end="url(#arrowhead)" filter="url(#rough-soft)"/>
</svg>`;

const rankBadge = (rank) => `
<svg class="gr-rank" viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="2.6" filter="url(#rough)"/>
  <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".45" filter="url(#rough)"/>
  <text x="24" y="31" text-anchor="middle" font-size="19" font-weight="700" fill="currentColor">${rank}</text>
</svg>`;

/** 手描き風のスコアメーター（0〜100） */
const scoreMeter = (score) => {
  const w = 120;
  const filled = Math.max(4, Math.round((score / 100) * (w - 8)));
  return `
<svg class="gr-meter" viewBox="0 0 ${w} 16" role="img" aria-label="重要度 ${score} / 100">
  <rect x="2" y="3" width="${w - 4}" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".55" filter="url(#rough-soft)"/>
  <rect x="4" y="5" width="${filled}" height="6" rx="3" class="gr-meter-fill" filter="url(#rough-soft)"/>
</svg>`;
};

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const css = `
:root{
  color-scheme: light;
  --paper:#fdf8ec; --paper-2:#f6efdd; --grid:rgba(120,96,60,.13);
  --ink:#2b2420; --ink-soft:#6b5d51; --ink-faint:#9b8a79;
  --accent:#e2603c; --accent-2:#2f7d8c; --accent-3:#c9a227;
  --note-yellow:#ffe9a8; --note-pink:#ffd3dd; --note-blue:#cfe6f7;
  --note-green:#d6f0cd; --note-orange:#ffd9b0; --note-purple:#e2d8f7;
  --note-ink:#2b2420; --card:#fffdf6; --shadow:rgba(80,62,40,.22);
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --paper:#1b1a22; --paper-2:#222230; --grid:rgba(190,205,255,.09);
  --ink:#f2ece2; --ink-soft:#c3bab0; --ink-faint:#8d8478;
  --accent:#ff8a63; --accent-2:#63c8d8; --accent-3:#f0c64a;
  --note-yellow:#6a5a1e; --note-pink:#6d2f42; --note-blue:#1f4a66;
  --note-green:#2c5330; --note-orange:#6d4420; --note-purple:#433562;
  --note-ink:#f6f1e7; --card:#262533; --shadow:rgba(0,0,0,.5);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --paper:#1b1a22; --paper-2:#222230; --grid:rgba(190,205,255,.09);
    --ink:#f2ece2; --ink-soft:#c3bab0; --ink-faint:#8d8478;
    --accent:#ff8a63; --accent-2:#63c8d8; --accent-3:#f0c64a;
    --note-yellow:#6a5a1e; --note-pink:#6d2f42; --note-blue:#1f4a66;
    --note-green:#2c5330; --note-orange:#6d4420; --note-purple:#433562;
    --note-ink:#f6f1e7; --card:#262533; --shadow:rgba(0,0,0,.5);
  }
}

*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background-color:var(--paper);
  background-image:
    radial-gradient(var(--grid) 1.1px, transparent 1.1px),
    linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%);
  background-size:22px 22px, 100% 100%;
  color:var(--ink);
  font-family:"Yomogi","Klee One","Zen Kurenaido","Kalam","Comic Sans MS","Segoe Print",
    "Hiragino Maru Gothic ProN","BIZ UDPGothic","Yu Gothic",system-ui,sans-serif;
  line-height:1.75;
  -webkit-text-size-adjust:100%;
  overflow-x:hidden;
}
.gr-defs{position:absolute;width:0;height:0}
.wrap{max-width:1040px;margin:0 auto;padding:20px 16px 64px}
a{color:inherit}

/* ── ヘッダー ── */
.masthead{position:relative;text-align:center;padding:26px 8px 12px}
.masthead h1{
  font-size:clamp(26px,7vw,46px);line-height:1.25;margin:0 0 6px;
  letter-spacing:.02em;
}
.masthead .mark{
  background:linear-gradient(transparent 62%, var(--accent-3) 62%, var(--accent-3) 92%, transparent 92%);
  padding:0 .15em;
}
.masthead .period{color:var(--ink-soft);font-size:14px;margin:0}
.gr-squiggle{display:block;width:min(280px,72%);height:12px;margin:2px auto 0;color:var(--accent)}

/* ── テーマ切替 ── */
.theme-bar{display:flex;justify-content:flex-end;gap:6px}
.theme-toggle{
  display:inline-flex;align-items:center;gap:6px;cursor:pointer;
  font:inherit;font-size:13px;color:var(--ink);background:var(--card);
  border:2.2px solid var(--ink);padding:6px 12px;
  border-radius:225px 14px 210px 16px/16px 200px 14px 225px;
  box-shadow:2px 2px 0 var(--shadow);
}
.theme-toggle:hover{transform:translate(-1px,-1px);box-shadow:3px 3px 0 var(--shadow)}
.theme-toggle:active{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--shadow)}
.theme-toggle .tt-icon{font-size:15px;line-height:1}

/* ── 中央「今週の要点」 ── */
.hero{position:relative;margin:26px auto 8px;max-width:760px}
.hero-bubble{
  position:relative;background:var(--card);
  border:3px solid var(--ink);
  border-radius:245px 18px 235px 20px/20px 230px 18px 245px;
  padding:22px 22px 24px;box-shadow:5px 6px 0 var(--shadow);
  transform:rotate(-.5deg);
}
.hero-label{
  display:inline-block;font-size:13px;letter-spacing:.14em;color:var(--paper);
  background:var(--accent);padding:3px 14px;border-radius:200px 12px 200px 12px/12px 200px 12px 200px;
  transform:rotate(-2deg);margin-bottom:10px;
}
.hero-head{font-size:clamp(19px,4.6vw,29px);line-height:1.5;margin:0 0 10px;font-weight:700}
.hero-sum{margin:0;color:var(--ink-soft);font-size:clamp(13px,3.4vw,15px)}
.gr-arrow{display:block;width:34px;height:54px;margin:2px auto;color:var(--accent-2)}

/* ── 付箋（要点） ── */
.keypoints{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:14px;margin:16px 0 8px}
.note{
  position:relative;padding:14px 14px 16px;color:var(--note-ink);
  border-radius:4px 14px 6px 12px;box-shadow:3px 4px 0 var(--shadow);
  font-size:14px;line-height:1.65;
}
.note::after{
  content:"";position:absolute;top:-7px;left:50%;width:46px;height:15px;transform:translateX(-50%) rotate(-3deg);
  background:rgba(160,160,160,.35);border-radius:2px;
}
.note:nth-child(4n+1){transform:rotate(-1.4deg);background:var(--note-yellow)}
.note:nth-child(4n+2){transform:rotate(1.1deg);background:var(--note-blue)}
.note:nth-child(4n+3){transform:rotate(-.7deg);background:var(--note-green)}
.note:nth-child(4n+4){transform:rotate(1.6deg);background:var(--note-pink)}
.note b{display:block;font-size:15px;margin-bottom:2px}

/* ── タグの吹き出し ── */
.tagrow{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin:20px 0 6px}
.tagbubble{
  font-size:13px;padding:5px 13px;border:2.2px solid var(--ink);background:var(--card);
  border-radius:200px 14px 200px 14px/14px 200px 14px 200px;box-shadow:2px 2px 0 var(--shadow);
}
.tagbubble small{color:var(--ink-faint);margin-left:4px}

/* ── セクション見出し ── */
.section-head{display:flex;align-items:center;gap:10px;margin:38px 0 14px}
.section-head h2{font-size:clamp(18px,4.6vw,24px);margin:0;white-space:nowrap}
.section-head .rule{flex:1;height:3px;background:repeating-linear-gradient(90deg,var(--ink) 0 14px,transparent 14px 22px);opacity:.5;border-radius:2px}

/* ── トピックカード ── */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:18px}
.card{
  position:relative;background:var(--card);border:2.6px solid var(--ink);
  border-radius:230px 16px 220px 18px/18px 215px 16px 235px;
  padding:16px 16px 14px;box-shadow:4px 5px 0 var(--shadow);
  display:flex;flex-direction:column;gap:9px;
}
.card:nth-child(3n+1){transform:rotate(-.45deg)}
.card:nth-child(3n+2){transform:rotate(.35deg)}
.card:nth-child(3n+3){transform:rotate(-.2deg)}
.card:hover{transform:rotate(0deg) translateY(-3px);box-shadow:6px 8px 0 var(--shadow)}
.card-top{display:flex;align-items:flex-start;gap:10px}
.gr-rank{width:44px;height:44px;flex:none;color:var(--accent)}
.card-title{margin:0;font-size:16px;line-height:1.5;font-weight:700}
.card-title a{text-decoration:none;background:linear-gradient(transparent 88%, var(--accent-2) 88%);}
.card-title a:hover{background:linear-gradient(transparent 20%, color-mix(in srgb, var(--accent-3) 55%, transparent) 20%)}
.card-orig{font-size:11.5px;color:var(--ink-faint);margin:0;word-break:break-word}
.card-sum{margin:0;font-size:13.5px;color:var(--ink);line-height:1.7}
.card-why{
  margin:0;font-size:12.5px;color:var(--ink-soft);
  border-left:3px dashed var(--accent-2);padding-left:9px;
}
.card-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding-top:4px}
.chip{font-size:11.5px;padding:2px 9px;border:1.8px solid var(--ink-soft);border-radius:180px 10px 180px 10px/10px 180px 10px 180px;color:var(--ink-soft)}
.chip.src{border-color:var(--accent-2);color:var(--accent-2)}
.chip.hn{border-color:var(--accent);color:var(--accent)}
.gr-meter{width:104px;height:15px;color:var(--ink-soft)}
.gr-meter-fill{fill:var(--accent)}
.meter-wrap{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-faint);margin-left:auto}

/* ── 情報源サマリ ── */
.sources{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:10px}
.source{
  border:2.2px dashed var(--ink-soft);border-radius:12px;padding:9px 12px;font-size:13px;background:var(--card);
}
.source b{display:block;font-size:13.5px}
.source span{color:var(--ink-faint);font-size:12px}
.source.err{border-color:var(--accent);color:var(--accent)}

/* ── アーカイブ ── */
.archive{display:flex;flex-wrap:wrap;gap:8px}
.archive a{
  font-size:13px;text-decoration:none;padding:5px 12px;background:var(--card);
  border:2.2px solid var(--ink);box-shadow:2px 2px 0 var(--shadow);
  border-radius:190px 12px 190px 12px/12px 190px 12px 190px;
}
.archive a[aria-current="page"]{background:var(--accent-3);color:var(--note-ink)}

footer{margin-top:44px;text-align:center;color:var(--ink-faint);font-size:12px;line-height:1.9}
footer a{color:var(--accent-2)}

@media (max-width:420px){
  .wrap{padding:14px 12px 48px}
  .hero-bubble{padding:18px 15px 20px;border-radius:180px 14px 175px 16px/16px 170px 14px 185px}
  .card{padding:14px 13px 12px}
  .gr-rank{width:38px;height:38px}
  .meter-wrap{margin-left:0}
}
@media (prefers-reduced-motion: reduce){ *{transition:none!important} }
.card,.theme-toggle{transition:transform .15s ease, box-shadow .15s ease}
`;

// ─────────────────────────────────────────────
// 本体
// ─────────────────────────────────────────────
function renderCard(t) {
  const title = t.titleJa || t.title;
  const showOriginal = t.titleJa && t.titleJa !== t.title;
  return `
      <article class="card">
        <div class="card-top">
          ${rankBadge(t.rank)}
          <div>
            <h3 class="card-title"><a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></h3>
            ${showOriginal ? `<p class="card-orig">原題: ${esc(t.title)}</p>` : ''}
          </div>
        </div>
        <p class="card-sum">${esc(t.summaryJa)}</p>
        ${t.whyJa ? `<p class="card-why">なぜ重要? ${esc(t.whyJa)}</p>` : ''}
        <div class="card-foot">
          <span class="chip src">${esc(t.sourceLabel)}</span>
          <span class="chip">${esc(jstLabel(t.publishedAt))}</span>
          ${t.tags.map((tag) => `<span class="chip">#${esc(tag)}</span>`).join('')}
          ${typeof t.points === 'number' ? `<a class="chip hn" href="${esc(t.discussionUrl)}" target="_blank" rel="noopener noreferrer">▲${t.points}</a>` : ''}
          <span class="meter-wrap">${scoreMeter(t.score)}<span>${t.score}</span></span>
        </div>
      </article>`;
}

export function renderReport(report, { archive = [], current = null } = {}) {
  const periodFrom = jstLabel(report.since);
  const periodTo = jstLabel(report.until);
  const keyPoints = report.keyPoints?.length
    ? report.keyPoints
    : report.topTags.slice(0, 4).map((t) => ({ label: `#${t.tag}`, text: `今週 ${t.count} 件が該当` }));

  return `<!DOCTYPE html>
<html lang="ja" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI週次トレンド ${esc(report.runDate)}</title>
<meta name="description" content="${esc(report.headline)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%93%B0%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Yomogi&family=Kalam:wght@400;700&display=swap">
<style>${css}</style>
<script>
  // 初期テーマ（チラつき防止のため CSS 適用前に決定）
  (function () {
    try {
      var saved = localStorage.getItem('gr-theme');
      if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
      else document.documentElement.dataset.theme = 'auto';
    } catch (e) { document.documentElement.dataset.theme = 'auto'; }
  })();
</script>
</head>
<body>
${svgDefs}
<div class="wrap">
  <div class="theme-bar">
    <button type="button" class="theme-toggle" id="themeToggle" aria-live="polite">
      <span class="tt-icon" id="ttIcon">🌗</span><span id="ttLabel">自動</span>
    </button>
  </div>

  <header class="masthead">
    <h1><span class="mark">AI業界トレンド</span><br>週次グラレコ</h1>
    ${squiggle(280)}
    <p class="period">${esc(periodFrom)} 〜 ${esc(periodTo)} ／ ${report.collectedCount} 件を収集し ${report.topics.length} 件を採録</p>
  </header>

  <section class="hero" aria-labelledby="heroHead">
    <div class="hero-bubble">
      <span class="hero-label">今週の要点</span>
      <p class="hero-head" id="heroHead">${esc(report.headline)}</p>
      ${report.summaryJa ? `<p class="hero-sum">${esc(report.summaryJa)}</p>` : ''}
    </div>
    ${arrowDown()}
    <div class="keypoints">
      ${keyPoints
        .map((k) => {
          const label = typeof k === 'string' ? '' : k.label ?? '';
          const text = typeof k === 'string' ? k : k.text ?? '';
          return `<div class="note">${label ? `<b>${esc(label)}</b>` : ''}${esc(text)}</div>`;
        })
        .join('\n      ')}
    </div>
    <div class="tagrow">
      ${report.topTags.map((t) => `<span class="tagbubble">#${esc(t.tag)}<small>${t.count}</small></span>`).join('\n      ')}
    </div>
  </section>

  <div class="section-head"><h2>今週のトピック</h2><div class="rule"></div></div>
  <div class="cards">
${report.topics.map(renderCard).join('\n')}
  </div>

  <div class="section-head"><h2>収集メモ</h2><div class="rule"></div></div>
  <div class="sources">
    ${report.sourceStats
      .map(
        (s) => `<div class="source${s.error ? ' err' : ''}"><b>${esc(s.label)}</b><span>${s.kept} 件採用 / ${s.fetched} 件取得${s.error ? ` ・取得失敗: ${esc(s.error)}` : ''}</span></div>`
      )
      .join('\n    ')}
  </div>

  ${
    archive.length > 1
      ? `<div class="section-head"><h2>バックナンバー</h2><div class="rule"></div></div>
  <nav class="archive">
    ${archive
      .map((d) => `<a href="./${esc(d)}.html"${d === current ? ' aria-current="page"' : ''}>${esc(d)}</a>`)
      .join('\n    ')}
  </nav>`
      : ''
  }

  <footer>
    生成: ${esc(report.generatedAt)} ／ サブエージェント採点 ${report.curatedCount} 件・自動採点 ${report.topics.length - report.curatedCount} 件<br>
    <a href="https://github.com/kskrm/claude-agent-sdk-demo">kskrm/claude-agent-sdk-demo</a> ・ Claude Code Routine による自動生成
  </footer>
</div>

<script>
  (function () {
    var order = ['auto', 'light', 'dark'];
    var meta = { auto: ['🌗', '自動'], light: ['☀️', 'ライト'], dark: ['🌙', 'ダーク'] };
    var btn = document.getElementById('themeToggle');
    var icon = document.getElementById('ttIcon');
    var label = document.getElementById('ttLabel');
    function paint() {
      var cur = document.documentElement.dataset.theme || 'auto';
      icon.textContent = meta[cur][0];
      label.textContent = meta[cur][1];
      btn.setAttribute('aria-label', 'テーマ切替（現在: ' + meta[cur][1] + '）');
    }
    btn.addEventListener('click', function () {
      var cur = document.documentElement.dataset.theme || 'auto';
      var next = order[(order.indexOf(cur) + 1) % order.length];
      document.documentElement.dataset.theme = next;
      try { next === 'auto' ? localStorage.removeItem('gr-theme') : localStorage.setItem('gr-theme', next); } catch (e) {}
      paint();
    });
    paint();
  })();
</script>
</body>
</html>
`;
}
