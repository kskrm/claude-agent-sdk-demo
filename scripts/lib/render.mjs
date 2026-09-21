// グラレコ（グラフィックレコーディング）風 HTML のレンダラ。
// 外部ライブラリ・外部JSに依存せず、インライン SVG + CSS だけで描画する。
//
//   renderExplainPage() … 主要トピックの深掘り解説（メインページ）
//   renderListPage()    … 今週集めたトピックの一覧（サブページ）
import { jstLabel } from './util.mjs';

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 深掘り1本ごとに色を変えて、読み手が章の切れ目を見失わないようにする
const ACCENTS = ['a1', 'a2', 'a3', 'a4', 'a5'];

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

const squiggle = (w = 280) => `
<svg class="gr-squiggle" viewBox="0 0 ${w} 12" preserveAspectRatio="none" aria-hidden="true">
  <path d="M2,8 C ${w * 0.15},2 ${w * 0.3},11 ${w * 0.45},6 S ${w * 0.75},2 ${w - 2},7"
        fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" filter="url(#rough)"/>
</svg>`;

const arrowDown = () => `
<svg class="gr-arrow" viewBox="0 0 40 64" aria-hidden="true">
  <path d="M20,4 C14,20 26,34 19,58" fill="none" stroke="currentColor" stroke-width="3"
        stroke-linecap="round" marker-end="url(#arrowhead)" filter="url(#rough-soft)"/>
</svg>`;

const arrowRight = () => `
<svg class="gr-arrow-r" viewBox="0 0 64 40" aria-hidden="true">
  <path d="M4,20 C20,14 34,26 58,19" fill="none" stroke="currentColor" stroke-width="3"
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
  --a1:#e2603c; --a2:#2f7d8c; --a3:#7c5ba6; --a4:#3f8f5a; --a5:#c07a1e;
  --note-yellow:#ffe9a8; --note-pink:#ffd3dd; --note-blue:#cfe6f7;
  --note-green:#d6f0cd; --note-orange:#ffd9b0; --note-purple:#e2d8f7;
  --note-ink:#2b2420; --card:#fffdf6; --card-2:#fbf5e6;
  --shadow:rgba(80,62,40,.22); --tape:rgba(150,140,120,.32);
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --paper:#1b1a22; --paper-2:#222230; --grid:rgba(190,205,255,.09);
  --ink:#f2ece2; --ink-soft:#c3bab0; --ink-faint:#8d8478;
  --accent:#ff8a63; --accent-2:#63c8d8; --accent-3:#f0c64a;
  --a1:#ff8a63; --a2:#63c8d8; --a3:#b498e8; --a4:#6fcf8e; --a5:#f0b455;
  --note-yellow:#6a5a1e; --note-pink:#6d2f42; --note-blue:#1f4a66;
  --note-green:#2c5330; --note-orange:#6d4420; --note-purple:#433562;
  --note-ink:#f6f1e7; --card:#262533; --card-2:#2e2d3d;
  --shadow:rgba(0,0,0,.5); --tape:rgba(200,200,210,.22);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --paper:#1b1a22; --paper-2:#222230; --grid:rgba(190,205,255,.09);
    --ink:#f2ece2; --ink-soft:#c3bab0; --ink-faint:#8d8478;
    --accent:#ff8a63; --accent-2:#63c8d8; --accent-3:#f0c64a;
    --a1:#ff8a63; --a2:#63c8d8; --a3:#b498e8; --a4:#6fcf8e; --a5:#f0b455;
    --note-yellow:#6a5a1e; --note-pink:#6d2f42; --note-blue:#1f4a66;
    --note-green:#2c5330; --note-orange:#6d4420; --note-purple:#433562;
    --note-ink:#f6f1e7; --card:#262533; --card-2:#2e2d3d;
    --shadow:rgba(0,0,0,.5); --tape:rgba(200,200,210,.22);
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
  line-height:1.85;
  -webkit-text-size-adjust:100%;
  overflow-x:hidden;
}
.gr-defs{position:absolute;width:0;height:0}
.wrap{max-width:1040px;margin:0 auto;padding:20px 16px 64px}
a{color:inherit}

/* ── 上部バー ── */
.topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pill{
  display:inline-flex;align-items:center;gap:7px;cursor:pointer;text-decoration:none;
  font:inherit;font-size:13px;color:var(--ink);background:var(--card);
  border:2.2px solid var(--ink);padding:6px 13px;
  border-radius:225px 14px 210px 16px/16px 200px 14px 225px;
  box-shadow:2px 2px 0 var(--shadow);
  transition:transform .15s ease, box-shadow .15s ease;
}
.pill:hover{transform:translate(-1px,-1px);box-shadow:3px 3px 0 var(--shadow)}
.pill:active{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--shadow)}
.pill:focus-visible{outline:3px solid var(--accent);outline-offset:3px}

/* ── ヘッダー ── */
.masthead{position:relative;text-align:center;padding:24px 8px 10px}
.masthead h1{font-size:clamp(25px,6.6vw,44px);line-height:1.28;margin:0 0 6px;letter-spacing:.02em;text-wrap:balance}
.masthead .mark{background:linear-gradient(transparent 62%, var(--accent-3) 62%, var(--accent-3) 92%, transparent 92%);padding:0 .15em}
.masthead .period{color:var(--ink-soft);font-size:14px;margin:0}
.gr-squiggle{display:block;width:min(280px,72%);height:12px;margin:2px auto 0;color:var(--accent)}

/* ── 中央「今週の要点」 ── */
.hero{position:relative;margin:26px auto 8px;max-width:760px}
.hero-bubble{
  position:relative;background:var(--card);border:3px solid var(--ink);
  border-radius:245px 18px 235px 20px/20px 230px 18px 245px;
  padding:22px 22px 24px;box-shadow:5px 6px 0 var(--shadow);transform:rotate(-.5deg);
}
.hero-label{
  display:inline-block;font-size:13px;letter-spacing:.14em;color:var(--paper);
  background:var(--accent);padding:3px 14px;border-radius:200px 12px 200px 12px/12px 200px 12px 200px;
  transform:rotate(-2deg);margin-bottom:10px;
}
.hero-head{font-size:clamp(19px,4.6vw,29px);line-height:1.5;margin:0 0 10px;font-weight:700;text-wrap:balance}
.hero-sum{margin:0;color:var(--ink-soft);font-size:clamp(13px,3.4vw,15px)}
.gr-arrow{display:block;width:34px;height:54px;margin:2px auto;color:var(--accent-2)}
.gr-arrow-r{width:54px;height:34px;color:var(--accent-2);flex:none}

/* ── 付箋 ── */
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:14px;margin:16px 0 8px}
.note{
  position:relative;padding:14px 14px 16px;color:var(--note-ink);
  border-radius:4px 14px 6px 12px;box-shadow:3px 4px 0 var(--shadow);
  font-size:14px;line-height:1.7;
}
.note::after{content:"";position:absolute;top:-7px;left:50%;width:46px;height:15px;
  transform:translateX(-50%) rotate(-3deg);background:var(--tape);border-radius:2px}
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
.section-head{display:flex;align-items:center;gap:10px;margin:40px 0 14px}
.section-head h2{font-size:clamp(18px,4.6vw,24px);margin:0;white-space:nowrap}
.section-head .rule{flex:1;height:3px;border-radius:2px;opacity:.5;
  background:repeating-linear-gradient(90deg,var(--ink) 0 14px,transparent 14px 22px)}

/* ═══════════════ 深掘り解説 ═══════════════ */
.dive{
  --ac:var(--a1);
  position:relative;margin:30px 0 0;padding:22px 20px 24px;
  background:var(--card);border:3px solid var(--ink);
  border-radius:235px 18px 225px 20px/20px 220px 18px 240px;
  box-shadow:5px 6px 0 var(--shadow);
}
.dive.a1{--ac:var(--a1)} .dive.a2{--ac:var(--a2)} .dive.a3{--ac:var(--a3)}
.dive.a4{--ac:var(--a4)} .dive.a5{--ac:var(--a5)}
.dive:nth-of-type(odd){transform:rotate(-.25deg)}
.dive:nth-of-type(even){transform:rotate(.2deg)}

.dive-top{display:flex;gap:13px;align-items:flex-start;margin-bottom:12px}
.dive-no{
  flex:none;width:42px;height:42px;display:grid;place-items:center;
  font-size:19px;font-weight:700;color:var(--paper);background:var(--ac);
  border-radius:200px 13px 190px 15px/15px 185px 13px 200px;transform:rotate(-4deg);
}
.dive-head{margin:0;font-size:clamp(19px,4.8vw,28px);line-height:1.45;font-weight:700;text-wrap:balance}
.dive-meta{margin:3px 0 0;font-size:12px;color:var(--ink-faint)}

.dive-hook{
  margin:0 0 18px;font-size:clamp(14.5px,3.7vw,16.5px);line-height:1.9;
  padding:14px 16px;background:var(--card-2);
  border:2.4px solid var(--ac);
  border-radius:200px 16px 195px 18px/18px 190px 16px 210px;
}

.dd-sub{display:flex;align-items:center;gap:9px;margin:26px 0 12px}
.dd-sub h4{margin:0;font-size:16px;white-space:nowrap;color:var(--ac)}
.dd-sub .r{flex:1;height:2.5px;border-radius:2px;background:currentColor;color:var(--ac);opacity:.35}

.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;margin-top:4px}
.panel{
  padding:15px 16px;border-radius:6px 16px 8px 14px;font-size:14px;line-height:1.85;
  box-shadow:3px 4px 0 var(--shadow);color:var(--note-ink);
}
.panel.bg{background:var(--note-blue);transform:rotate(-.8deg)}
.panel.an{background:var(--note-yellow);transform:rotate(.7deg)}
.panel b{display:block;font-size:15px;margin-bottom:4px}

/* 要素技術カード */
.concepts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px}
.concept{
  background:var(--card-2);border:2.4px solid var(--ink);
  border-radius:16px 200px 14px 195px/195px 14px 205px 16px;
  padding:14px 15px;box-shadow:3px 4px 0 var(--shadow);
}
.concept .term{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin-bottom:4px}
.concept .term b{font-size:16px;color:var(--ac)}
.concept .plain{font-size:13px;color:var(--ink-soft)}
.concept p{margin:6px 0 0;font-size:13.5px;line-height:1.8;color:var(--ink)}

/* ── 図版（3種） ── */
.fig{
  border:2.6px dashed var(--ink-soft);border-radius:16px;background:var(--card-2);
  padding:16px 14px 12px;box-shadow:3px 4px 0 var(--shadow);
}
.fig-title{margin:0 0 12px;font-size:15px;text-align:center;color:var(--ac);font-weight:700}
.fig-cap{margin:12px 0 0;font-size:12.5px;color:var(--ink-faint);text-align:center;line-height:1.7}

/* flow: 左に番号レール、右にステップ */
.flow{display:grid;gap:0}
.flow-step{display:flex;gap:12px;align-items:flex-start;position:relative;padding-bottom:14px}
.flow-step:last-child{padding-bottom:0}
.flow-step:not(:last-child)::before{
  content:"";position:absolute;left:16px;top:34px;bottom:2px;width:3px;
  background:repeating-linear-gradient(180deg,var(--ac) 0 6px,transparent 6px 11px);opacity:.6;
}
.flow-no{
  flex:none;width:34px;height:34px;display:grid;place-items:center;z-index:1;
  font-size:15px;font-weight:700;color:var(--paper);background:var(--ac);
  border-radius:190px 12px 185px 13px/13px 180px 12px 195px;
}
.flow-body{padding-top:3px}
.flow-body b{display:block;font-size:15px;line-height:1.5}
.flow-body span{font-size:13px;color:var(--ink-soft);line-height:1.7}

/* compare: 2カラム＋中央の矢印 */
.cmp{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}
.cmp-col{flex:1 1 220px;min-width:0}
.cmp-col h5{
  margin:0 0 10px;font-size:14px;text-align:center;padding:4px 10px;
  border-radius:190px 12px 185px 13px/13px 180px 12px 195px;
}
.cmp-col.was h5{background:var(--ink-faint);color:var(--paper)}
.cmp-col.now h5{background:var(--ac);color:var(--paper)}
.cmp-item{
  background:var(--card);border:2.2px solid var(--ink);margin-bottom:9px;
  border-radius:180px 12px 175px 14px/14px 170px 12px 190px;padding:9px 12px;
}
.cmp-col.was .cmp-item{opacity:.72;border-style:dashed}
.cmp-item b{display:block;font-size:14px}
.cmp-item span{font-size:12.5px;color:var(--ink-soft);line-height:1.65}
.cmp-mid{display:grid;place-items:center;flex:0 0 auto}
.cmp-mid .gr-arrow{display:none}
@media (max-width:560px){
  .cmp{flex-direction:column;align-items:stretch}
  .cmp-mid .gr-arrow-r{display:none}
  .cmp-mid .gr-arrow{display:block}
}

/* layers: 積み重ね */
.layers{display:grid;gap:7px}
.layer{
  border:2.4px solid var(--ink);background:var(--card);
  border-radius:190px 14px 185px 15px/15px 180px 14px 200px;
  padding:11px 14px;box-shadow:2px 3px 0 var(--shadow);
}
.layer b{display:block;font-size:15px}
.layer span{font-size:12.5px;color:var(--ink-soft);line-height:1.7}
.layer:nth-child(1){background:color-mix(in srgb, var(--ac) 16%, var(--card));margin-inline:0}
.layer:nth-child(2){margin-inline:3%}
.layer:nth-child(3){margin-inline:6%}
.layer:nth-child(4){margin-inline:9%}
.layer:nth-child(5){margin-inline:12%}
.layers-note{margin:8px 0 0;font-size:12px;color:var(--ink-faint);text-align:center}

/* impact */
.impacts{display:grid;gap:11px}
.impact{display:flex;gap:11px;align-items:flex-start;flex-wrap:wrap}
.impact-who{
  flex:none;font-size:13px;padding:3px 12px;color:var(--paper);background:var(--ac);
  border-radius:190px 12px 185px 13px/13px 180px 12px 195px;white-space:nowrap;
}
.impact-what{flex:1 1 220px;font-size:14px;line-height:1.85;min-width:0}

/* 用語メモ */
.jargon{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:10px}
.jargon div{
  background:var(--note-green);color:var(--note-ink);padding:9px 12px;font-size:13px;line-height:1.7;
  border-radius:4px 12px 6px 10px;box-shadow:2px 3px 0 var(--shadow);
}
.jargon div:nth-child(3n+2){background:var(--note-purple);transform:rotate(-.6deg)}
.jargon div:nth-child(3n+3){background:var(--note-orange);transform:rotate(.5deg)}
.jargon b{display:block;font-size:14px}

.nextstep{
  margin:22px 0 0;padding:13px 16px;font-size:14px;line-height:1.85;
  border:2.6px solid var(--ac);border-radius:10px;background:var(--card-2);
}
.nextstep b{color:var(--ac)}
.dive-src{margin:16px 0 0;font-size:12.5px;color:var(--ink-faint);word-break:break-word}
.dive-src a{color:var(--ac)}

/* ═══════════════ 一覧ページのカード ═══════════════ */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:18px}
.card{
  position:relative;background:var(--card);border:2.6px solid var(--ink);
  border-radius:230px 16px 220px 18px/18px 215px 16px 235px;
  padding:16px 16px 14px;box-shadow:4px 5px 0 var(--shadow);
  display:flex;flex-direction:column;gap:9px;
  transition:transform .15s ease, box-shadow .15s ease;
}
.card:nth-child(3n+1){transform:rotate(-.45deg)}
.card:nth-child(3n+2){transform:rotate(.35deg)}
.card:nth-child(3n+3){transform:rotate(-.2deg)}
.card:hover{transform:rotate(0deg) translateY(-3px);box-shadow:6px 8px 0 var(--shadow)}
.card.featured{border-color:var(--accent);box-shadow:4px 5px 0 var(--shadow),0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.card-top{display:flex;align-items:flex-start;gap:10px}
.gr-rank{width:44px;height:44px;flex:none;color:var(--accent)}
.card-title{margin:0;font-size:16px;line-height:1.5;font-weight:700}
.card-title a{text-decoration:none;background:linear-gradient(transparent 88%, var(--accent-2) 88%)}
.card-title a:hover{background:linear-gradient(transparent 20%, color-mix(in srgb, var(--accent-3) 55%, transparent) 20%)}
.card-orig{font-size:11.5px;color:var(--ink-faint);margin:0;word-break:break-word}
.card-sum{margin:0;font-size:13.5px;color:var(--ink);line-height:1.7}
.card-why{margin:0;font-size:12.5px;color:var(--ink-soft);border-left:3px dashed var(--accent-2);padding-left:9px}
.card-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding-top:4px}
.chip{font-size:11.5px;padding:2px 9px;border:1.8px solid var(--ink-soft);color:var(--ink-soft);
  border-radius:180px 10px 180px 10px/10px 180px 10px 180px}
.chip.src{border-color:var(--accent-2);color:var(--accent-2)}
.chip.hn{border-color:var(--accent);color:var(--accent)}
.chip.deep{border-color:var(--accent);color:var(--paper);background:var(--accent);text-decoration:none}
.gr-meter{width:104px;height:15px;color:var(--ink-soft)}
.gr-meter-fill{fill:var(--accent)}
.meter-wrap{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-faint);margin-left:auto}

/* ── 情報源サマリ ── */
.sources{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:10px}
.source{border:2.2px dashed var(--ink-soft);border-radius:12px;padding:9px 12px;font-size:13px;background:var(--card)}
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

/* ── ページ間の導線 ── */
.crossnav{
  margin:44px 0 0;padding:20px;text-align:center;background:var(--card);
  border:3px solid var(--ink);box-shadow:5px 6px 0 var(--shadow);
  border-radius:230px 18px 225px 20px/20px 215px 18px 235px;
}
.crossnav p{margin:0 0 12px;font-size:15px}
.crossnav .pill{font-size:14.5px;padding:8px 18px}

footer{margin-top:44px;text-align:center;color:var(--ink-faint);font-size:12px;line-height:1.9}
footer a{color:var(--accent-2)}

@media (prefers-reduced-motion: reduce){*{transition:none!important}}
@media (max-width:430px){
  .wrap{padding:14px 12px 48px}
  .hero-bubble{padding:18px 15px 20px;border-radius:180px 14px 175px 16px/16px 170px 14px 185px}
  .dive{padding:18px 14px 20px;border-radius:180px 16px 175px 18px/18px 170px 16px 190px}
  .card{padding:14px 13px 12px}
  .gr-rank{width:38px;height:38px}
  .meter-wrap{margin-left:0}
  .layer:nth-child(n){margin-inline:0}
}
`;

// ─────────────────────────────────────────────
// 図版（3種）
// ─────────────────────────────────────────────
function renderDiagram(d) {
  if (!d) return '';
  let body = '';

  if (d.type === 'flow') {
    body = `<div class="flow">
${d.nodes
  .map(
    (n, i) => `        <div class="flow-step">
          <div class="flow-no">${i + 1}</div>
          <div class="flow-body"><b>${esc(n.label)}</b>${n.note ? `<span>${esc(n.note)}</span>` : ''}</div>
        </div>`
  )
  .join('\n')}
      </div>`;
  } else if (d.type === 'compare') {
    const col = (side, data) => `<div class="cmp-col ${side}">
          <h5>${esc(data.title)}</h5>
${data.nodes
  .map((n) => `          <div class="cmp-item"><b>${esc(n.label)}</b>${n.note ? `<span>${esc(n.note)}</span>` : ''}</div>`)
  .join('\n')}
        </div>`;
    body = `<div class="cmp">
        ${col('was', d.before)}
        <div class="cmp-mid">${arrowRight()}${arrowDown()}</div>
        ${col('now', d.after)}
      </div>`;
  } else if (d.type === 'layers') {
    // データは下から上の順。表示は上が最上位になるよう反転する。
    const stacked = [...d.nodes].reverse();
    body = `<div class="layers">
${stacked
  .map((n) => `        <div class="layer"><b>${esc(n.label)}</b>${n.note ? `<span>${esc(n.note)}</span>` : ''}</div>`)
  .join('\n')}
      </div>
      <p class="layers-note">↑ 上にあるものほど、下のものの上に成り立っています</p>`;
  } else {
    return '';
  }

  return `      <div class="fig">
        ${d.title ? `<p class="fig-title">${esc(d.title)}</p>` : ''}
        ${body}
        ${d.caption ? `<p class="fig-cap">${esc(d.caption)}</p>` : ''}
      </div>`;
}

// ─────────────────────────────────────────────
// 深掘り1本
// ─────────────────────────────────────────────
function renderDive(d, i) {
  const accent = ACCENTS[i % ACCENTS.length];
  return `
    <article class="dive ${accent}" id="dive-${esc(d.id)}">
      <div class="dive-top">
        <div class="dive-no">${i + 1}</div>
        <div>
          <h3 class="dive-head">${esc(d.headline)}</h3>
          <p class="dive-meta">${esc(d.sourceLabel)}・${esc(jstLabel(d.publishedAt))}・原題: ${esc(d.originalTitle)}</p>
        </div>
      </div>

      <p class="dive-hook">${esc(d.hook)}</p>

      ${
        d.background.body || d.analogy.body
          ? `<div class="two">
        ${d.background.body ? `<div class="panel bg"><b>${esc(d.background.title)}</b>${esc(d.background.body)}</div>` : ''}
        ${d.analogy.body ? `<div class="panel an"><b>${esc(d.analogy.title)}</b>${esc(d.analogy.body)}</div>` : ''}
      </div>`
          : ''
      }

      ${
        d.diagram
          ? `<div class="dd-sub"><h4>図で見る</h4><div class="r"></div></div>
${renderDiagram(d.diagram)}`
          : ''
      }

      ${
        d.concepts.length
          ? `<div class="dd-sub"><h4>使われている技術</h4><div class="r"></div></div>
      <div class="concepts">
${d.concepts
  .map(
    (c) => `        <div class="concept">
          <div class="term"><b>${esc(c.term)}</b><span class="plain">${esc(c.plain)}</span></div>
          ${c.detail ? `<p>${esc(c.detail)}</p>` : ''}
        </div>`
  )
  .join('\n')}
      </div>`
          : ''
      }

      ${
        d.impact.length
          ? `<div class="dd-sub"><h4>何が変わる？</h4><div class="r"></div></div>
      <div class="impacts">
${d.impact
  .map(
    (im) => `        <div class="impact"><span class="impact-who">${esc(im.who)}</span><span class="impact-what">${esc(im.what)}</span></div>`
  )
  .join('\n')}
      </div>`
          : ''
      }

      ${
        d.jargon.length
          ? `<div class="dd-sub"><h4>用語メモ</h4><div class="r"></div></div>
      <div class="jargon">
${d.jargon.map((j) => `        <div><b>${esc(j.term)}</b>${esc(j.plain)}</div>`).join('\n')}
      </div>`
          : ''
      }

      ${d.nextStep ? `<p class="nextstep"><b>次の一歩 →</b> ${esc(d.nextStep)}</p>` : ''}

      <p class="dive-src">出典: <a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.originalTitle)}</a>（${esc(d.sourceLabel)}）</p>
    </article>`;
}

// ─────────────────────────────────────────────
// 一覧ページのカード
// ─────────────────────────────────────────────
function renderCard(t, featuredSet, explainHref) {
  const title = t.titleJa || t.title;
  const showOriginal = t.titleJa && t.titleJa !== t.title;
  const isFeatured = featuredSet.has(t.id);
  return `
      <article class="card${isFeatured ? ' featured' : ''}">
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
          ${isFeatured ? `<a class="chip deep" href="${esc(explainHref)}#dive-${esc(t.id)}">くわしい解説 →</a>` : ''}
          <span class="chip src">${esc(t.sourceLabel)}</span>
          <span class="chip">${esc(jstLabel(t.publishedAt))}</span>
          ${t.tags.map((tag) => `<span class="chip">#${esc(tag)}</span>`).join('')}
          ${typeof t.points === 'number' ? `<a class="chip hn" href="${esc(t.discussionUrl)}" target="_blank" rel="noopener noreferrer">▲${t.points}</a>` : ''}
          <span class="meter-wrap">${scoreMeter(t.score)}<span>${t.score}</span></span>
        </div>
      </article>`;
}

// ─────────────────────────────────────────────
// ページ共通の骨組み
// ─────────────────────────────────────────────
function page({ title, description, crumbLabel, crumbHref, body }) {
  return `<!DOCTYPE html>
<html lang="ja" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%93%B0%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Yomogi&family=Kalam:wght@400;700&display=swap">
<style>${css}</style>
<script>
  // 初期テーマ（チラつき防止のため描画前に決定）
  (function () {
    try {
      var saved = localStorage.getItem('gr-theme');
      document.documentElement.dataset.theme = (saved === 'light' || saved === 'dark') ? saved : 'auto';
    } catch (e) { document.documentElement.dataset.theme = 'auto'; }
  })();
</script>
</head>
<body>
${svgDefs}
<div class="wrap">
  <div class="topbar">
    <a class="pill" href="${esc(crumbHref)}">${esc(crumbLabel)}</a>
    <button type="button" class="pill" id="themeToggle">
      <span id="ttIcon">🌗</span><span id="ttLabel">自動</span>
    </button>
  </div>
${body}
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

function masthead(report, subtitle) {
  return `
  <header class="masthead">
    <h1><span class="mark">AI業界トレンド</span><br>週次グラレコ</h1>
    ${squiggle(280)}
    <p class="period">${esc(jstLabel(report.since))} 〜 ${esc(jstLabel(report.until))} ／ ${esc(subtitle)}</p>
  </header>`;
}

function archiveNav(archive, current, suffix) {
  if (archive.length <= 1) return '';
  return `
  <div class="section-head"><h2>バックナンバー</h2><div class="rule"></div></div>
  <nav class="archive">
    ${archive
      .map((d) => `<a href="./${esc(d)}${suffix}.html"${d === current ? ' aria-current="page"' : ''}>${esc(d)}</a>`)
      .join('\n    ')}
  </nav>`;
}

// ─────────────────────────────────────────────
// 解説ページ（メイン）
// ─────────────────────────────────────────────
export function renderExplainPage(report, { archive = [], current = null } = {}) {
  const dives = report.deepDives ?? [];
  const listHref = `./${current}-list.html`;
  const keyPoints = report.keyPoints?.length
    ? report.keyPoints
    : report.topTags.slice(0, 4).map((t) => ({ label: `#${t.tag}`, text: `今週 ${t.count} 件が該当` }));

  const body = `
${masthead(report, `${report.collectedCount} 件から ${dives.length} 本をくわしく解説`)}

  <section class="hero" aria-labelledby="heroHead">
    <div class="hero-bubble">
      <span class="hero-label">今週の要点</span>
      <p class="hero-head" id="heroHead">${esc(report.headline)}</p>
      ${report.summaryJa ? `<p class="hero-sum">${esc(report.summaryJa)}</p>` : ''}
    </div>
    ${arrowDown()}
    <div class="notes">
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

  <div class="section-head"><h2>今週のニュースを読み解く</h2><div class="rule"></div></div>
  ${
    dives.length
      ? dives.map(renderDive).join('\n')
      : `<p style="font-size:14px;color:var(--ink-soft)">今週は深掘り解説を生成できませんでした。トピック一覧をご覧ください。</p>`
  }

  <div class="crossnav">
    <p>今週集めた <b>${report.topics.length} 件</b>すべての見出しと要約はこちら</p>
    <a class="pill" href="${esc(listHref)}">トピック一覧を見る →</a>
  </div>

${archiveNav(archive, current, '')}

  <footer>
    生成: ${esc(report.generatedAt)}<br>
    <a href="https://github.com/kskrm/claude-agent-sdk-demo">kskrm/claude-agent-sdk-demo</a> ・ Claude Code Routine による自動生成
  </footer>`;

  return page({
    title: `AI週次トレンド解説 ${report.runDate}`,
    description: report.headline,
    crumbLabel: '一覧を見る →',
    crumbHref: listHref,
    body,
  });
}

// ─────────────────────────────────────────────
// 一覧ページ（サブ）
// ─────────────────────────────────────────────
export function renderListPage(report, { archive = [], current = null } = {}) {
  const explainHref = `./${current}.html`;
  const featuredSet = new Set((report.deepDives ?? []).map((d) => d.id));

  const body = `
${masthead(report, `${report.collectedCount} 件を収集し ${report.topics.length} 件を採録`)}

  <div class="crossnav" style="margin-top:22px">
    <p>主要な <b>${featuredSet.size} 件</b>は、要素技術からかみ砕いて解説しています</p>
    <a class="pill" href="${esc(explainHref)}">← くわしい解説を読む</a>
  </div>

  <div class="section-head"><h2>今週のトピック</h2><div class="rule"></div></div>
  <div class="cards">
${report.topics.map((t) => renderCard(t, featuredSet, explainHref)).join('\n')}
  </div>

  <div class="section-head"><h2>収集メモ</h2><div class="rule"></div></div>
  <div class="sources">
    ${report.sourceStats
      .map(
        (s) =>
          `<div class="source${s.error ? ' err' : ''}"><b>${esc(s.label)}</b><span>${s.kept} 件採用 / ${s.fetched} 件取得${s.error ? ` ・取得失敗: ${esc(s.error)}` : ''}</span></div>`
      )
      .join('\n    ')}
  </div>

${archiveNav(archive, current, '-list')}

  <footer>
    生成: ${esc(report.generatedAt)} ／ サブエージェント採点 ${report.curatedCount} 件・自動採点 ${report.topics.length - report.curatedCount} 件<br>
    <a href="https://github.com/kskrm/claude-agent-sdk-demo">kskrm/claude-agent-sdk-demo</a> ・ Claude Code Routine による自動生成
  </footer>`;

  return page({
    title: `AI週次トレンド 一覧 ${report.runDate}`,
    description: `${report.runDate} 週のAI業界トピック ${report.topics.length} 件`,
    crumbLabel: '← 解説を読む',
    crumbHref: explainHref,
    body,
  });
}
