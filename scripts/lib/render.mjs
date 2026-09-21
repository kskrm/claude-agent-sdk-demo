// グラレコ（グラフィックレコーディング）風 HTML のレンダラ。
// 外部ライブラリ・外部JSに依存せず、インライン SVG + CSS だけで描画する。
//
// 意匠の方針（AWS Geek 風のグラレコを参照）:
//   - 白地に「アンバー＋淡い水色」の2色主体。色数を絞って紙面を落ち着かせる
//   - 見出しは短冊リボン（両端に縦線の飾り）
//   - 流れは塗りつぶしの三角矢印
//   - アイコンは大きく、マーカーで塗ったような色面の上に置く
//   - 文字は少なく、図で分からせる
//
//   renderExplainPage() … 主要トピックの深掘り解説（メインページ）
//   renderListPage()    … 今週集めたトピックの一覧（サブページ）
import { jstLabel } from './util.mjs';
import { icon } from './icons.mjs';

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 大きな数を日本語の単位に丸めて読みやすくする（1000000 -> 100万） */
function jpNumber(n) {
  const abs = Math.abs(n);
  const trim = (v) => String(Number(v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)));
  if (abs >= 1e12) return `${trim(n / 1e12)}兆`;
  if (abs >= 1e8) return `${trim(n / 1e8)}億`;
  if (abs >= 1e4) return `${trim(n / 1e4)}万`;
  if (Number.isInteger(n)) return n.toLocaleString('ja-JP');
  // 0.042 のような小さい値を 0.04 に丸めてしまわないよう有効数字で扱う
  if (abs < 1) return String(Number(n.toPrecision(2)));
  return trim(n);
}

// 章ごとに色面を振り分けて、単調にならないようにする（基調色は変えない）
const TINTS = ['t-sky', 't-amber', 't-sky', 't-amber', 't-sky'];

// ─────────────────────────────────────────────
// SVG パーツ
// ─────────────────────────────────────────────
const svgDefs = `
<svg class="gr-defs" aria-hidden="true" focusable="false">
  <defs>
    <filter id="rough" x="-14%" y="-14%" width="128%" height="128%">
      <feTurbulence type="fractalNoise" baseFrequency="0.026" numOctaves="3" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="rough-soft" x="-14%" y="-14%" width="128%" height="128%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="4" result="n2"/>
      <feDisplacementMap in="SourceGraphic" in2="n2" scale="1.3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
</svg>`;

/** 塗りつぶしの三角矢印。dir は right / down */
const tri = (dir = 'right') =>
  `<svg class="tri ${dir}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5,2.5 L20.5,12 L5,21.5 Z" fill="currentColor" filter="url(#rough-soft)"/></svg>`;

/** 中央の集中線（今週の要点） */
const sunburst = () => {
  const rays = [];
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const r1 = 62 + (i % 3) * 4;
    const r2 = r1 + (i % 2 ? 17 : 11);
    rays.push(
      `<line x1="${(100 + Math.cos(a) * r1).toFixed(1)}" y1="${(100 + Math.sin(a) * r1).toFixed(1)}" x2="${(100 + Math.cos(a) * r2).toFixed(1)}" y2="${(100 + Math.sin(a) * r2).toFixed(1)}"/>`
    );
  }
  return `<svg class="sun-rays" viewBox="0 0 200 200" aria-hidden="true"><g stroke="currentColor" stroke-width="3.8" stroke-linecap="round" filter="url(#rough)">${rays.join('')}</g></svg>`;
};

/** 繰り返しを示す戻り矢印 */
const loopArrow = () => `
<svg class="loop" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
  <path d="M292,6 C292,32 250,34 150,34 C50,34 10,32 10,10" fill="none" stroke="currentColor"
        stroke-width="3" stroke-linecap="round" stroke-dasharray="9 7" filter="url(#rough-soft)"/>
  <path d="M3,14 L10,2 L17,14 Z" fill="currentColor" filter="url(#rough-soft)"/>
</svg>`;

const scoreMeter = (score) => {
  const w = 120;
  const filled = Math.max(4, Math.round((score / 100) * (w - 8)));
  return `
<svg class="gr-meter" viewBox="0 0 ${w} 16" role="img" aria-label="重要度 ${score} / 100">
  <rect x="2" y="3" width="${w - 4}" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.8" opacity=".5" filter="url(#rough-soft)"/>
  <rect x="4" y="5" width="${filled}" height="6" rx="3" class="gr-meter-fill" filter="url(#rough-soft)"/>
</svg>`;
};

/** 短冊リボンの見出し */
const ribbon = (text, cls = '') => `<span class="ribbon ${cls}">${esc(text)}</span>`;

// ─────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────
const css = `
:root{
  color-scheme: light;
  --paper:#ffffff; --paper-2:#fbfaf7; --rule:#d9dee3;
  --ink:#232323; --ink-soft:#5d5d5d; --ink-faint:#8f8f8f;
  --amber:#f2a71b; --amber-deep:#cf8409; --amber-pale:#fdeecb; --amber-wash:#fdf6e7;
  --sky:#8dc0e4; --sky-deep:#3277a8; --sky-pale:#d9ebf8; --sky-wash:#eff7fc;
  --card:#ffffff; --shadow:rgba(40,40,40,.14);
}
:root[data-theme="dark"]{
  color-scheme: dark;
  --paper:#15171c; --paper-2:#1a1d23; --rule:#3a4049;
  --ink:#f3f1eb; --ink-soft:#b8b4ac; --ink-faint:#85817a;
  --amber:#f5b841; --amber-deep:#f7c86a; --amber-pale:#463617; --amber-wash:#2a2416;
  --sky:#7fb3d9; --sky-deep:#9fcbe8; --sky-pale:#1f3547; --sky-wash:#1a2530;
  --card:#1d2027; --shadow:rgba(0,0,0,.55);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
    --paper:#15171c; --paper-2:#1a1d23; --rule:#3a4049;
    --ink:#f3f1eb; --ink-soft:#b8b4ac; --ink-faint:#85817a;
    --amber:#f5b841; --amber-deep:#f7c86a; --amber-pale:#463617; --amber-wash:#2a2416;
    --sky:#7fb3d9; --sky-deep:#9fcbe8; --sky-pale:#1f3547; --sky-wash:#1a2530;
    --card:#1d2027; --shadow:rgba(0,0,0,.55);
  }
}

*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--paper);
  color:var(--ink);
  font-family:"Yomogi","Klee One","Zen Kurenaido","Kalam","Comic Sans MS","Segoe Print",
    "Hiragino Maru Gothic ProN","BIZ UDPGothic","Yu Gothic",system-ui,sans-serif;
  line-height:1.8;
  -webkit-text-size-adjust:100%;
  overflow-x:hidden;
}
.gr-defs{position:absolute;width:0;height:0}
.wrap{max-width:1000px;margin:0 auto;padding:18px 16px 64px}
a{color:inherit}

/* ── 短冊リボン ── */
.ribbon{
  position:relative;display:inline-block;padding:3px 17px;
  background:var(--amber-pale);border:2.6px solid var(--ink);border-radius:2px;
  font-size:clamp(16px,4vw,20px);font-weight:700;line-height:1.6;
}
.ribbon::before,.ribbon::after{
  content:"";position:absolute;top:-4px;bottom:-4px;width:6px;
  border-left:2.6px solid var(--ink);border-right:2.6px solid var(--ink);
}
.ribbon::before{left:-10px}
.ribbon::after{right:-10px}
.ribbon.sm{font-size:clamp(14px,3.4vw,16px);padding:2px 14px}
.ribbon.sky{background:var(--sky-pale)}
.sec{display:flex;justify-content:center;margin:42px 0 22px}
.sec-l{display:flex;justify-content:flex-start;margin:28px 0 15px;padding-left:13px}

/* ── 三角矢印 ── */
.tri{width:22px;height:22px;flex:none;color:var(--ink-soft)}
.tri.down{transform:rotate(90deg)}

/* ── 上部バー ── */
.topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.pill{
  display:inline-flex;align-items:center;gap:7px;cursor:pointer;text-decoration:none;
  font:inherit;font-size:13px;color:var(--ink);background:var(--card);
  border:2.4px solid var(--ink);padding:5px 13px;border-radius:2px;
  box-shadow:2px 2px 0 var(--ink);
  transition:transform .12s ease, box-shadow .12s ease;
}
.pill:hover{transform:translate(-1px,-1px);box-shadow:3px 3px 0 var(--ink)}
.pill:active{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--ink)}
.pill:focus-visible{outline:3px solid var(--amber);outline-offset:3px}

/* ── ヘッダー ── */
.masthead{text-align:center;padding:26px 8px 4px}
.masthead h1{font-size:clamp(25px,6.4vw,42px);line-height:1.3;margin:0;text-wrap:balance}
.masthead .hl{background:linear-gradient(transparent 58%, var(--amber) 58%, var(--amber) 90%, transparent 90%);padding:0 .1em}
.masthead .period{color:var(--ink-soft);font-size:13.5px;margin:10px 0 0}

/* ── 中央「今週の要点」＋4象限 ── */
.hero{position:relative;margin:30px 0 8px}
.hero-grid{position:relative;display:grid;grid-template-columns:1fr 1fr}
.q{padding:22px 16px;min-height:136px;display:flex;flex-direction:column;gap:2px}
.q:nth-of-type(1){border-right:2px solid var(--rule);border-bottom:2px solid var(--rule);padding-right:104px}
.q:nth-of-type(2){border-bottom:2px solid var(--rule);padding-left:104px}
.q:nth-of-type(3){border-right:2px solid var(--rule);padding-right:104px}
.q:nth-of-type(4){padding-left:104px}
.q-icon{width:34px;height:34px;color:var(--amber-deep)}
.q b{font-size:clamp(15px,4vw,19px);line-height:1.45}
.q span{font-size:12.8px;color:var(--ink-soft);line-height:1.7}
.sun{
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;
  width:190px;height:190px;display:grid;place-items:center;text-align:center;
}
.sun-rays{position:absolute;inset:0;width:100%;height:100%;color:var(--amber)}
.sun-core{position:relative;width:128px;height:128px;border-radius:50%;background:var(--paper);display:grid;place-items:center;padding:8px}
.sun-core b{font-size:14px;letter-spacing:.08em;color:var(--amber-deep);display:block;line-height:1.4}
.sun-core span{font-size:11.5px;color:var(--ink-soft);display:block;line-height:1.5;margin-top:2px}
.hero-head{margin:24px auto 0;max-width:720px;text-align:center;font-size:clamp(18px,4.6vw,27px);line-height:1.55;font-weight:700;text-wrap:balance}
.hero-sum{margin:9px auto 0;max-width:680px;text-align:center;color:var(--ink-soft);font-size:13.5px}
.tagrow{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:20px 0 0}
.tagbubble{font-size:12.5px;padding:3px 12px;border:2.2px solid var(--sky-deep);color:var(--sky-deep);border-radius:2px}
.tagbubble small{color:var(--ink-faint);margin-left:4px}

/* ═══════════ 深掘り解説 ═══════════ */
.dive{margin:34px 0 0;padding:26px 22px 28px;background:var(--card);border:3px solid var(--ink);border-radius:3px;box-shadow:6px 6px 0 var(--shadow)}
.dive.t-sky{--tint:var(--sky-pale);--tint-wash:var(--sky-wash)}
.dive.t-amber{--tint:var(--amber-pale);--tint-wash:var(--amber-wash)}

.dive-top{display:flex;gap:13px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
.dive-no{flex:none;width:40px;height:40px;display:grid;place-items:center;font-size:19px;font-weight:700;color:var(--ink);background:var(--amber);border:2.6px solid var(--ink);border-radius:2px}
.dive-art{position:relative;display:grid;place-items:center;width:62px;height:56px;flex:none}
.dive-art::before{content:"";position:absolute;inset:2px 0;background:var(--tint);border-radius:48% 52% 56% 44%/56% 44% 58% 42%}
.dive-art svg{position:relative;width:38px;height:38px;color:var(--amber-deep)}
.dive-art svg path{stroke-width:1.9}
.dive-head{margin:0;font-size:clamp(20px,5.2vw,30px);line-height:1.4;font-weight:700;flex:1 1 220px;min-width:0;text-wrap:balance}
.dive-meta{margin:0 0 16px;font-size:11.5px;color:var(--ink-faint)}

.dive-hook{margin:0 0 20px;font-size:clamp(14.5px,3.6vw,16.5px);line-height:1.95;padding:15px 17px;background:var(--tint-wash);border-left:7px solid var(--amber)}

.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:16px}
.panel{padding:15px 17px;font-size:13.8px;line-height:1.9;border:2.4px solid var(--ink);border-radius:2px}
.panel.bg{background:var(--sky-wash)}
.panel.an{background:var(--amber-wash)}
.panel > b{display:inline-block;font-size:14px;margin-bottom:5px;padding:1px 10px;border:2px solid var(--ink);background:var(--paper)}
.panel p{margin:6px 0 0}

/* たとえ話のミニ図 */
.analogy-strip{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin-top:15px;padding-top:13px;border-top:2px dashed var(--rule)}
.analogy-strip figure{display:grid;justify-items:center;gap:3px;margin:0;font-size:12.5px;max-width:120px;text-align:center}

/* アイコンタイル（図の共通部品） */
.tile{display:grid;justify-items:center;gap:5px;margin:0;text-align:center;flex:0 1 152px;min-width:0}
.tile-art{position:relative;display:grid;place-items:center;width:86px;height:76px}
.tile-art::before{content:"";position:absolute;inset:4px 0;background:var(--tint);border-radius:47% 53% 55% 45%/57% 43% 57% 43%}
.tile-art svg{position:relative;width:46px;height:46px;color:var(--amber-deep)}
.tile-art svg path{stroke-width:1.9}
.tile b{font-size:14.5px;line-height:1.45}
.tile span{font-size:12px;color:var(--ink-soft);line-height:1.65;display:block}

/* ── 図版の枠 ── */
.fig{border:2.6px solid var(--ink);border-radius:2px;background:var(--paper-2);padding:20px 16px 14px}
.fig-title{margin:0 0 20px;text-align:center}
.fig-cap{margin:18px 0 0;font-size:12.3px;color:var(--ink-faint);text-align:center;line-height:1.7}

/* flow / cycle: 三角でつなぐ帯 */
.strip{display:flex;align-items:flex-start;justify-content:center;gap:4px;flex-wrap:wrap}
.strip .tri{margin-top:26px}
.strip .tri.down{display:none}
.cyc-back{display:grid;justify-items:center;margin-top:10px;color:var(--sky-deep)}
.loop{width:min(100%,420px);height:34px}
.cyc-back span{font-size:12.3px;margin-top:2px}

/* compare: 左右2群 */
.cmp{display:flex;align-items:stretch;justify-content:center;gap:10px;flex-wrap:wrap}
.cmp-col{flex:1 1 248px;min-width:0;display:grid;gap:10px;align-content:start;justify-items:center;padding:14px 10px 16px;border:2.4px solid var(--ink);border-radius:2px}
.cmp-col.was{background:var(--paper)}
.cmp-col.now{background:var(--amber-wash)}
.cmp-col h5{margin:0 0 6px;text-align:center}
.cmp-col.was .tile-art::before{background:var(--rule)}
.cmp-col.was .tile-art svg{color:var(--ink-soft)}
.cmp-col.was .tile b{color:var(--ink-soft)}
.cmp-mid{display:grid;place-items:center;flex:0 0 auto}
.cmp-mid .tri{width:30px;height:30px;color:var(--amber-deep)}
.cmp-mid .tri.down{display:none}
@media (max-width:620px){
  .cmp{flex-direction:column}
  .cmp-mid .tri.right{display:none}
  .cmp-mid .tri.down{display:block}
  .strip{flex-direction:column;align-items:center}
  .strip .tri{margin-top:0}
  .strip .tri.right{display:none}
  .strip .tri.down{display:block}
}

/* layers: 積み重ね */
.layers{display:grid;gap:8px}
.layer{display:flex;align-items:center;gap:12px;border:2.4px solid var(--ink);border-radius:2px;padding:11px 14px}
.layer:nth-child(odd){background:var(--sky-wash)}
.layer:nth-child(even){background:var(--amber-wash)}
.layer > svg{width:32px;height:32px;flex:none;color:var(--amber-deep)}
.layer > svg path{stroke-width:1.9}
.layer b{font-size:14.5px;display:block;line-height:1.45}
.layer em{font-style:normal;font-size:12.3px;color:var(--ink-soft);line-height:1.65;display:block}
.layers-note{margin:12px 0 0;font-size:12px;color:var(--ink-faint);text-align:center}

/* ── 数値の視覚化 ── */
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,238px),1fr));gap:14px}
.metric{border:2.6px solid var(--ink);border-radius:2px;padding:14px 15px;background:var(--paper)}
.metric-head{display:flex;align-items:center;gap:9px;margin-bottom:11px}
.metric-head > svg{width:30px;height:30px;flex:none;color:var(--amber-deep)}
.metric-head > svg path{stroke-width:1.9}
.metric-head b{font-size:14.5px;line-height:1.4}
.metric-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.metric-tag{flex:none;width:4.6em;font-size:11.5px;color:var(--ink-faint);text-align:right;white-space:nowrap}
.metric-bar{flex:1;height:19px;min-width:0;position:relative}
.metric-bar i{position:absolute;left:0;top:0;bottom:0;display:block;min-width:16px;border:2.2px solid var(--ink)}
.metric-bar.was i{background:var(--paper-2)}
.metric-bar.now i{background:var(--amber)}
.metric-val{font-size:13px;white-space:nowrap;flex:none;font-weight:700}
.metric-delta{display:inline-flex;align-items:center;gap:5px;margin-top:7px;font-size:12.5px;padding:1px 11px;color:var(--ink);background:var(--amber);border:2.2px solid var(--ink)}
.metric-delta svg{width:15px;height:15px}
.metric-big{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;margin:0}
.metric-big strong{font-size:clamp(28px,7.4vw,40px);line-height:1.1;color:var(--amber-deep);font-weight:700}
.metric-big span{font-size:14px;color:var(--ink-soft)}
.metric-note{margin:6px 0 0;font-size:12px;color:var(--ink-faint);line-height:1.6}

/* ── 使われている技術 ── */
.concepts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:15px}
.concept{display:flex;gap:13px;border:2.4px solid var(--ink);border-radius:2px;padding:14px 15px}
.concept-art{position:relative;display:grid;place-items:center;width:58px;height:56px;flex:none}
.concept-art::before{content:"";position:absolute;inset:2px 0;background:var(--tint);border-radius:48% 52% 54% 46%/55% 45% 58% 42%}
.concept-art svg{position:relative;width:34px;height:34px;color:var(--amber-deep)}
.concept-art svg path{stroke-width:1.9}
.concept-txt{min-width:0}
.concept-txt b{display:block;font-size:15.5px;line-height:1.45}
.concept-txt .plain{display:block;font-size:12.5px;color:var(--sky-deep);margin-bottom:5px}
.concept-txt p{margin:0;font-size:13.3px;line-height:1.85}

/* ── 何が変わる？ ── */
.impacts{display:grid;gap:12px}
.impact{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:11px 14px;background:var(--tint-wash);border:2.2px dashed var(--ink-soft);border-radius:2px}
.impact-who{flex:none;display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:700}
.impact-who svg{width:26px;height:26px;color:var(--amber-deep)}
.impact-who svg path{stroke-width:1.9}
.impact-what{flex:1 1 230px;font-size:13.5px;line-height:1.85;min-width:0}

/* ── 用語メモ ── */
.jargon{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,225px),1fr));gap:11px}
.jargon div{border-left:5px solid var(--sky);padding:4px 0 4px 11px;font-size:12.8px;line-height:1.7;color:var(--ink-soft)}
.jargon b{display:block;font-size:14px;color:var(--ink)}

.nextstep{margin:26px 0 0;padding:13px 16px;font-size:13.8px;line-height:1.85;border:2.6px solid var(--amber);background:var(--amber-wash)}
.nextstep b{color:var(--amber-deep)}
.dive-src{margin:14px 0 0;font-size:12px;color:var(--ink-faint);word-break:break-word}
.dive-src a{color:var(--sky-deep)}

/* ═══════════ 一覧ページ ═══════════ */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:16px}
.card{
  background:var(--card);border:2.6px solid var(--ink);border-radius:2px;
  padding:15px 15px 13px;box-shadow:4px 4px 0 var(--shadow);
  display:flex;flex-direction:column;gap:8px;
  transition:transform .12s ease, box-shadow .12s ease;
}
.card:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--shadow)}
.card.featured{border-color:var(--amber-deep);box-shadow:4px 4px 0 var(--amber)}
.card-top{display:flex;align-items:flex-start;gap:10px}
.card-no{flex:none;width:30px;height:30px;display:grid;place-items:center;font-size:14px;font-weight:700;border:2.2px solid var(--ink);background:var(--amber-pale)}
.card-title{margin:0;font-size:15.5px;line-height:1.5;font-weight:700}
.card-title a{text-decoration:none;background:linear-gradient(transparent 86%, var(--sky) 86%)}
.card-title a:hover{background:linear-gradient(transparent 20%, var(--amber-pale) 20%)}
.card-orig{font-size:11px;color:var(--ink-faint);margin:0;word-break:break-word}
.card-sum{margin:0;font-size:13.2px;line-height:1.75}
.card-why{margin:0;font-size:12.3px;color:var(--ink-soft);border-left:4px solid var(--sky);padding-left:9px}
.card-foot{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:auto;padding-top:4px}
.chip{font-size:11.2px;padding:1px 9px;border:1.8px solid var(--ink-faint);color:var(--ink-soft);border-radius:2px}
.chip.src{border-color:var(--sky-deep);color:var(--sky-deep)}
.chip.hn{border-color:var(--amber-deep);color:var(--amber-deep)}
.chip.deep{border-color:var(--ink);color:var(--ink);background:var(--amber);text-decoration:none;font-weight:700}
.gr-meter{width:100px;height:15px;color:var(--ink-faint)}
.gr-meter-fill{fill:var(--amber)}
.meter-wrap{display:flex;align-items:center;gap:6px;font-size:11.2px;color:var(--ink-faint);margin-left:auto}

.sources{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:10px}
.source{border:2px dashed var(--ink-faint);border-radius:2px;padding:9px 12px;font-size:12.8px}
.source b{display:block;font-size:13.2px}
.source span{color:var(--ink-faint);font-size:11.8px}
.source.err{border-color:var(--amber-deep);color:var(--amber-deep)}

.archive{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.archive a{font-size:12.8px;text-decoration:none;padding:4px 12px;border:2.2px solid var(--ink);box-shadow:2px 2px 0 var(--shadow);border-radius:2px}
.archive a[aria-current="page"]{background:var(--amber);font-weight:700}

.crossnav{margin:46px 0 0;padding:22px;text-align:center;border:3px solid var(--ink);border-radius:3px;background:var(--sky-wash);box-shadow:6px 6px 0 var(--shadow)}
.crossnav p{margin:0 0 14px;font-size:14.5px}
.crossnav .pill{font-size:14.5px;padding:8px 18px;background:var(--paper)}

footer{margin-top:48px;text-align:center;color:var(--ink-faint);font-size:11.8px;line-height:1.9}
footer a{color:var(--sky-deep)}

@media (prefers-reduced-motion: reduce){*{transition:none!important}}
@media (max-width:640px){
  .hero-grid{grid-template-columns:1fr}
  /* 集中線は .sun を基準に描くので、静的配置にしても position:relative を保つ */
  .sun{position:relative;left:auto;top:auto;transform:none;order:-1;margin:0 auto 14px;width:178px;height:178px}
  .q,
  .q:nth-of-type(1),.q:nth-of-type(2),.q:nth-of-type(3),.q:nth-of-type(4){
    padding:15px 2px;min-height:0;border:0;border-bottom:2px solid var(--rule);
  }
  .q:last-of-type{border-bottom:0}
}
@media (max-width:430px){
  .wrap{padding:14px 12px 48px}
  .dive{padding:20px 14px 22px}
  .tile{flex-basis:auto;width:100%}
  .tile-art{width:78px;height:70px}
  .concept{flex-direction:column;gap:8px}
}
`;

// ─────────────────────────────────────────────
// 図版
// ─────────────────────────────────────────────
function tile(n) {
  return `<figure class="tile">
            <span class="tile-art">${icon(n.icon || 'box', '')}</span>
            <figcaption><b>${esc(n.label)}</b>${n.note ? `<span>${esc(n.note)}</span>` : ''}</figcaption>
          </figure>`;
}

function renderDiagram(d) {
  if (!d) return '';
  let body = '';

  if (d.type === 'flow' || d.type === 'cycle') {
    const parts = [];
    d.nodes.forEach((n, i) => {
      if (i > 0) parts.push(`${tri('right')}${tri('down')}`);
      parts.push(tile(n));
    });
    body = `<div class="strip">${parts.join('\n          ')}</div>${
      d.type === 'cycle'
        ? `\n        <div class="cyc-back">${loopArrow()}<span>最後まで進んだら、また 1 に戻って繰り返します</span></div>`
        : ''
    }`;
  } else if (d.type === 'compare') {
    const col = (side, data) => `<div class="cmp-col ${side}">
            <h5>${ribbon(data.title, side === 'was' ? 'sm sky' : 'sm')}</h5>
            ${data.nodes.map(tile).join('\n            ')}
          </div>`;
    body = `<div class="cmp">
          ${col('was', d.before)}
          <div class="cmp-mid">${tri('right')}${tri('down')}</div>
          ${col('now', d.after)}
        </div>`;
  } else if (d.type === 'layers') {
    // データは下から上の順。表示は上が最上位になるよう反転する。
    body = `<div class="layers">
${[...d.nodes]
  .reverse()
  .map(
    (n) => `          <div class="layer">${icon(n.icon || 'stack', '')}<span><b>${esc(n.label)}</b>${
      n.note ? `<em>${esc(n.note)}</em>` : ''
    }</span></div>`
  )
  .join('\n')}
        </div>
        <p class="layers-note">↑ 上にあるものほど、下のものの上に成り立っています</p>`;
  } else {
    return '';
  }

  return `      <div class="fig">
        ${d.title ? `<p class="fig-title">${ribbon(d.title, 'sm sky')}</p>` : ''}
        ${body}
        ${d.caption ? `<p class="fig-cap">${esc(d.caption)}</p>` : ''}
      </div>`;
}

// ─────────────────────────────────────────────
// 数値の視覚化
// ─────────────────────────────────────────────
function renderMetric(m) {
  const head = `<div class="metric-head">${icon(m.icon || 'chart', '')}<b>${esc(m.label)}</b></div>`;

  if (m.kind === 'delta') {
    const max = Math.max(m.before, m.after) || 1;
    const pct = (v) => `${Math.max(7, Math.round((v / max) * 100))}%`;
    return `        <div class="metric">
          ${head}
          <div class="metric-row">
            <span class="metric-tag">これまで</span>
            <span class="metric-bar was"><i style="width:${pct(m.before)}"></i></span>
            <span class="metric-val">${esc(jpNumber(m.before))}${esc(m.unit)}</span>
          </div>
          <div class="metric-row">
            <span class="metric-tag">これから</span>
            <span class="metric-bar now"><i style="width:${pct(m.after)}"></i></span>
            <span class="metric-val">${esc(jpNumber(m.after))}${esc(m.unit)}</span>
          </div>
          <span class="metric-delta">${icon(m.delta.kind === 'reduce' ? 'down' : 'up', '')}${esc(m.delta.text)}</span>
          ${m.note ? `<p class="metric-note">${esc(m.note)}</p>` : ''}
        </div>`;
  }

  return `        <div class="metric">
          ${head}
          <p class="metric-big"><strong>${esc(jpNumber(m.value))}</strong><span>${esc(m.unit)}</span></p>
          ${m.note ? `<p class="metric-note">${esc(m.note)}</p>` : ''}
        </div>`;
}

// ─────────────────────────────────────────────
// 深掘り1本
// ─────────────────────────────────────────────
function renderDive(d, i) {
  return `
    <article class="dive ${TINTS[i % TINTS.length]}" id="dive-${esc(d.id)}">
      <div class="dive-top">
        <div class="dive-no">${i + 1}</div>
        <span class="dive-art">${icon(d.icon || 'sparkle', '')}</span>
        <h3 class="dive-head">${esc(d.headline)}</h3>
      </div>
      <p class="dive-meta">${esc(d.sourceLabel)}・${esc(jstLabel(d.publishedAt))}・原題: ${esc(d.originalTitle)}</p>

      <p class="dive-hook">${esc(d.hook)}</p>

      ${
        d.background.body || d.analogy.body
          ? `<div class="two">
        ${d.background.body ? `<div class="panel bg"><b>${esc(d.background.title)}</b><p>${esc(d.background.body)}</p></div>` : ''}
        ${
          d.analogy.body
            ? `<div class="panel an"><b>${esc(d.analogy.title)}</b><p>${esc(d.analogy.body)}</p>${
                d.analogy.fromIcon && d.analogy.toIcon
                  ? `<div class="analogy-strip">
            <figure><span class="tile-art">${icon(d.analogy.fromIcon, '')}</span><figcaption>${esc(d.analogy.fromLabel)}</figcaption></figure>
            ${tri('right')}
            <figure><span class="tile-art">${icon(d.analogy.toIcon, '')}</span><figcaption>${esc(d.analogy.toLabel)}</figcaption></figure>
          </div>`
                  : ''
              }</div>`
            : ''
        }
      </div>`
          : ''
      }

      ${
        d.metrics?.length
          ? `<div class="sec-l">${ribbon('数字で見る', 'sm')}</div>
      <div class="metrics">
${d.metrics.map(renderMetric).join('\n')}
      </div>`
          : ''
      }

      ${d.diagram ? `<div class="sec-l">${ribbon('図で見る', 'sm')}</div>\n${renderDiagram(d.diagram)}` : ''}

      ${
        d.concepts.length
          ? `<div class="sec-l">${ribbon('使われている技術', 'sm')}</div>
      <div class="concepts">
${d.concepts
  .map(
    (c) => `        <div class="concept">
          <span class="concept-art">${icon(c.icon || 'gear', '')}</span>
          <div class="concept-txt">
            <b>${esc(c.term)}</b><span class="plain">${esc(c.plain)}</span>
            ${c.detail ? `<p>${esc(c.detail)}</p>` : ''}
          </div>
        </div>`
  )
  .join('\n')}
      </div>`
          : ''
      }

      ${
        d.impact.length
          ? `<div class="sec-l">${ribbon('何が変わる？', 'sm')}</div>
      <div class="impacts">
${d.impact
  .map(
    (im) => `        <div class="impact"><span class="impact-who">${icon(im.icon || 'user', '')}${esc(im.who)}</span><span class="impact-what">${esc(im.what)}</span></div>`
  )
  .join('\n')}
      </div>`
          : ''
      }

      ${
        d.jargon.length
          ? `<div class="sec-l">${ribbon('用語メモ', 'sm')}</div>
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
          <div class="card-no">${t.rank}</div>
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
    <h1><span class="hl">AI業界トレンド</span> 週次グラレコ</h1>
    <p class="period">${esc(jstLabel(report.since))} 〜 ${esc(jstLabel(report.until))} ／ ${esc(subtitle)}</p>
  </header>`;
}

function archiveNav(archive, current, suffix) {
  if (archive.length <= 1) return '';
  return `
  <div class="sec">${ribbon('バックナンバー', 'sm')}</div>
  <nav class="archive">
    ${archive
      .map((d) => `<a href="./${esc(d)}${suffix}.html"${d === current ? ' aria-current="page"' : ''}>${esc(d)}</a>`)
      .join('\n    ')}
  </nav>`;
}

/** 中央に「今週の要点」、周囲に4象限 */
function heroBlock(report) {
  const points = (
    report.keyPoints?.length
      ? report.keyPoints
      : report.topTags.slice(0, 4).map((t) => ({ label: `#${t.tag}`, text: `今週 ${t.count} 件が該当`, icon: 'list' }))
  ).slice(0, 4);

  return `
  <section class="hero">
    <div class="hero-grid">
      ${points
        .map((k) => {
          const label = typeof k === 'string' ? '' : k.label ?? '';
          const text = typeof k === 'string' ? k : k.text ?? '';
          const ic = typeof k === 'string' ? '' : k.icon ?? '';
          return `<div class="q">${icon(ic || 'bulb', 'q-icon')}<b>${esc(label)}</b><span>${esc(text)}</span></div>`;
        })
        .join('\n      ')}
      <div class="sun">
        ${sunburst()}
        <div class="sun-core"><div><b>今週の要点</b><span>${esc(jstLabel(report.since))}〜${esc(jstLabel(report.until))}</span></div></div>
      </div>
    </div>
    <p class="hero-head">${esc(report.headline)}</p>
    ${report.summaryJa ? `<p class="hero-sum">${esc(report.summaryJa)}</p>` : ''}
    <div class="tagrow">
      ${report.topTags.map((t) => `<span class="tagbubble">#${esc(t.tag)}<small>${t.count}</small></span>`).join('\n      ')}
    </div>
  </section>`;
}

// ─────────────────────────────────────────────
// 解説ページ（メイン）
// ─────────────────────────────────────────────
export function renderExplainPage(report, { archive = [], current = null } = {}) {
  const dives = report.deepDives ?? [];
  const listHref = `./${current}-list.html`;

  const body = `
${masthead(report, `${report.collectedCount} 件から ${dives.length} 本をくわしく解説`)}
${heroBlock(report)}

  <div class="sec">${ribbon('今週のニュースを読み解く')}</div>
  ${
    dives.length
      ? dives.map(renderDive).join('\n')
      : `<p style="font-size:14px;color:var(--ink-soft);text-align:center">今週は深掘り解説を生成できませんでした。トピック一覧をご覧ください。</p>`
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

  <div class="sec">${ribbon('今週のトピック')}</div>
  <div class="cards">
${report.topics.map((t) => renderCard(t, featuredSet, explainHref)).join('\n')}
  </div>

  <div class="sec">${ribbon('収集メモ', 'sm')}</div>
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
