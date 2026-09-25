/**
 * CSS của panel dưới dạng CHUỖI, không phải file .css.
 *
 * Panel sống trong shadow DOM (để CSS của GMGN không với tới được, và ngược
 * lại), mà shadow DOM thì phải nhét <style> vào bằng JS. Popup dùng lại đúng
 * chuỗi này nên hai chỗ không bao giờ lệch nhau.
 *
 * Panel LUÔN tối ở mọi theme: nó nằm đè lên giao diện trading vốn luôn tối.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});


  /**
   * CSS cho phần mọc thêm trên X. Nằm trong shadow root nên không đụng gì tới
   * trang, nhưng cũng nghĩa là KHÔNG thừa hưởng gì từ X — kể cả font.
   *
   * ⚠ Màu nền/chữ tự khai, đừng dựa vào theme của X: X có ba theme (sáng, tối
   * mờ, tối đặc) và người dùng đổi lúc nào cũng được. Dùng nền trong suốt +
   * viền màu hạng thì đọc được trên cả ba.
   */
  const X_CSS = `
.kt-x { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; }
.kt-x-btn {
  font: inherit; font-weight: 600; cursor: pointer;
  padding: 6px 14px; border-radius: 999px;
  background: transparent; color: #3FB950; border: 1px solid #3FB950;
  white-space: nowrap;
}
.kt-x-btn:hover { background: rgba(63,185,80,.12); }
.kt-x-btn.co { color: #E3B341; border-color: #E3B341; }
.kt-x-btn.co:hover { background: rgba(227,179,65,.12); }
.kt-x-strip {
  border-left: 3px solid #6E7A88; padding: 6px 0 6px 10px;
  color: #8B98A5; line-height: 1.5;
}
.kt-x-head { font-size: 12px; }
.kt-x-flag { color: #F85149; }
.kt-x-sum { margin-top: 3px; }
.kt-x-note { margin-top: 4px; color: #D7DEE6; }
.kt-x-meta { margin-top: 2px; font-size: 11px; color: #6E7A88; }
.kt-x-ledger { margin-top: 4px; font-size: 11px; color: #8B98A5; }
.kt-x-ledger b { color: #6E7A88; font-weight: 600; }

/* --- trong dòng thời gian --- */
.kt-x-pill {
  font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
  padding: 1px 8px; border-radius: 999px; line-height: 1.5;
  background: transparent; border: 1px solid currentColor; color: #6E7A88;
  white-space: nowrap;
}
.kt-x-pill.co:hover, .kt-x-pill:hover { filter: brightness(1.25); }
/* Nút "nói về chuyện này trước chưa" — chỉ mọc trên tweet có CA. Cố ý MỜ và
   không màu: nó là công cụ lúc nghi ngờ, không phải một tín hiệu. */
.kt-x-search {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; margin-left: 4px; padding: 0; cursor: pointer;
  border-radius: 999px; border: 1px solid #3A424D; background: transparent; color: #6E7A88;
}
.kt-x-search:hover { color: #D7DEE6; border-color: #6E7A88; }
.kt-x-card {
  position: fixed; z-index: 2147483000; width: 260px; padding: 9px 11px;
  background: #0F1319; border: 1px solid #262C36; border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.6); color: #E6EDF3; line-height: 1.45;
}
`;

  KT.X_CSS = X_CSS;

  KT.PANEL_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.kt-root {
  --kt-bg: #0F1319;
  --kt-bg-2: #161B22;
  --kt-border: #262C36;
  --kt-fg: #E6EDF3;
  --kt-fg-dim: #9BA6B2;
  --kt-fg-subtle: #6E7A88;
  --kt-accent: #58A6FF;
  --kt-danger: #F85149;
  --kt-win: #3FB950;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--kt-fg);
}

.kt-panel {
  width: 340px;
  max-height: min(78vh, 680px);
  display: flex;
  flex-direction: column;
  background: var(--kt-bg);
  border: 1px solid var(--kt-border);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0,0,0,.55);
  overflow: hidden;
}
.kt-panel.kt-collapsed .kt-body, .kt-panel.kt-collapsed .kt-foot { display: none; }

.kt-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: var(--kt-bg-2);
  border-bottom: 1px solid var(--kt-border);
  cursor: grab;
  user-select: none;
}
.kt-head.kt-dragging { cursor: grabbing; }
.kt-title { font-size: 12px; font-weight: 600; letter-spacing: .02em; }
.kt-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--kt-fg-subtle); flex: none; }
.kt-dot.ok { background: var(--kt-win); }
.kt-dot.err { background: var(--kt-danger); }
.kt-dot.load { background: var(--kt-accent); animation: kt-pulse 1s ease-in-out infinite; }
@keyframes kt-pulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
.kt-spacer { flex: 1; }

.kt-icon {
  appearance: none; background: transparent; border: 0; cursor: pointer;
  color: var(--kt-fg-dim); padding: 3px 5px; border-radius: 6px;
  font-size: 13px; line-height: 1; font-family: inherit;
}
.kt-icon:hover { background: rgba(255,255,255,.08); color: var(--kt-fg); }

.kt-body { padding: 10px; overflow-y: auto; flex: 1; }
.kt-body::-webkit-scrollbar { width: 8px; }
.kt-body::-webkit-scrollbar-thumb { background: #2A313B; border-radius: 4px; }

.kt-input {
  width: 100%; padding: 7px 10px;
  background: var(--kt-bg-2); color: var(--kt-fg);
  border: 1px solid var(--kt-border); border-radius: 8px;
  font: inherit; outline: none;
}
.kt-input:focus { border-color: var(--kt-accent); }
.kt-input::placeholder { color: var(--kt-fg-subtle); }

.kt-hint { color: var(--kt-fg-subtle); font-size: 11px; margin: 8px 2px 0; }
.kt-sec-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  color: var(--kt-fg-subtle); margin: 12px 2px 6px;
}

.kt-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent;
}
.kt-row:hover, .kt-row.kt-active { background: var(--kt-bg-2); border-color: var(--kt-border); }
.kt-row .kt-name { font-weight: 500; }
.kt-row .kt-sub { font-size: 11px; color: var(--kt-fg-subtle); }
.kt-grow { flex: 1; min-width: 0; }
.kt-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.kt-av {
  width: 30px; height: 30px; border-radius: 50%; flex: none;
  background: var(--kt-bg-2); object-fit: cover;
  border: 2px solid var(--kt-fg-subtle);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; color: var(--kt-fg-dim);
  overflow: hidden;
}
.kt-av.kt-lg { width: 48px; height: 48px; font-size: 16px; }
.kt-av img { width: 100%; height: 100%; object-fit: cover; display: block; }

.kt-tier {
  flex: none; font-size: 10px; font-weight: 700; letter-spacing: .04em;
  padding: 2px 6px; border-radius: 5px; border: 1px solid currentColor;
}

.kt-detail-head { display: flex; gap: 10px; align-items: flex-start; }
.kt-handle { font-size: 15px; font-weight: 600; word-break: break-all; }
.kt-aliases { font-size: 11px; color: var(--kt-fg-subtle); margin-top: 1px; }
.kt-desc { margin-top: 8px; color: var(--kt-fg-dim); white-space: pre-wrap; }

.kt-flags {
  margin-top: 8px; padding: 7px 9px; border-radius: 8px;
  background: rgba(248,81,73,.12); border: 1px solid rgba(248,81,73,.35);
  color: #FFB4AE; font-size: 12px; white-space: pre-wrap;
}
.kt-flags b { color: var(--kt-danger); }

.kt-stats { display: flex; gap: 6px; margin-top: 10px; }
.kt-stat {
  flex: 1; background: var(--kt-bg-2); border: 1px solid var(--kt-border);
  border-radius: 8px; padding: 6px 4px; text-align: center; min-width: 0;
}
.kt-stat-v { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.kt-stat-l { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--kt-fg-subtle); margin-top: 1px; }

.kt-bar { display: flex; height: 5px; border-radius: 3px; overflow: hidden; margin-top: 8px; background: var(--kt-bg-2); }
.kt-bar i { display: block; height: 100%; }

.kt-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11.5px; }
.kt-table th {
  text-align: left; font-weight: 500; color: var(--kt-fg-subtle);
  font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
  padding: 3px 4px; border-bottom: 1px solid var(--kt-border);
}
.kt-table td { padding: 4px; border-bottom: 1px solid rgba(38,44,54,.55); vertical-align: top; }
.kt-table tr:last-child td { border-bottom: 0; }
.kt-tok { font-weight: 600; }
.kt-res-win { color: var(--kt-win); }
.kt-res-loss { color: var(--kt-danger); }
.kt-res-neutral { color: var(--kt-fg-dim); }
.kt-res-unknown { color: var(--kt-fg-subtle); }
.kt-pos { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: var(--kt-bg-2); color: var(--kt-fg-dim); white-space: nowrap; }
.kt-pos-late { background: rgba(240,136,62,.15); color: #F0883E; }
.kt-pos-early { background: rgba(63,185,80,.15); color: var(--kt-win); }

.kt-btns { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.kt-btn {
  appearance: none; font: inherit; font-size: 11px; cursor: pointer;
  padding: 5px 10px; border-radius: 7px;
  background: var(--kt-bg-2); color: var(--kt-fg-dim);
  border: 1px solid var(--kt-border);
}
.kt-btn:hover { color: var(--kt-fg); border-color: #3A434F; }
.kt-btn.kt-primary { background: rgba(88,166,255,.14); border-color: rgba(88,166,255,.4); color: #9CCBFF; }
.kt-btn:active { transform: scale(.97); }

.kt-empty { text-align: center; color: var(--kt-fg-subtle); padding: 18px 6px; font-size: 12px; }
.kt-empty b { color: var(--kt-fg-dim); }

.kt-foot {
  padding: 6px 10px; border-top: 1px solid var(--kt-border);
  background: var(--kt-bg-2); font-size: 10.5px; color: var(--kt-fg-subtle);
  display: flex; gap: 8px; align-items: center;
}
.kt-err { color: #FFB4AE; }

/* --- ghi chú --- */
.kt-note {
  padding: 7px 8px; margin-bottom: 6px;
  background: var(--kt-bg-2); border: 1px solid var(--kt-border); border-radius: 8px;
}
.kt-note-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.kt-note-body { white-space: pre-wrap; }
.kt-note-post {
  margin-top: 4px; padding-left: 7px;
  border-left: 2px solid var(--kt-border);
  color: var(--kt-fg-subtle); font-style: italic; white-space: pre-wrap;
}
.kt-snap {
  display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  margin-top: 9px; padding: 7px 9px;
  background: var(--kt-bg-2); border: 1px solid var(--kt-border); border-radius: 8px;
}
.kt-snap .kt-note-post { flex: 1 0 100%; margin-top: 2px; }
.kt-ledger { margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: var(--kt-fg-subtle); }
.kt-ledger b { font-weight: 600; }

/* --- hộp ghi chú --- */
.kt-sheet {
  width: 380px; max-height: min(80vh, 620px);
  display: flex; flex-direction: column;
  background: var(--kt-bg); border: 1px solid var(--kt-border);
  border-radius: 12px; box-shadow: 0 20px 56px rgba(0,0,0,.6);
  overflow: hidden;
}
.kt-sheet .kt-body { padding: 12px; }
.kt-field { margin-top: 10px; }
.kt-field > label {
  display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--kt-fg-subtle); margin-bottom: 4px;
}
.kt-ta {
  width: 100%; min-height: 84px; resize: vertical;
  padding: 8px 10px; background: var(--kt-bg-2); color: var(--kt-fg);
  border: 1px solid var(--kt-border); border-radius: 8px;
  font: inherit; line-height: 1.5; outline: none;
}
.kt-ta:focus { border-color: var(--kt-accent); }
.kt-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.kt-chip {
  appearance: none; font: inherit; font-size: 11px; cursor: pointer;
  padding: 4px 10px; border-radius: 999px;
  background: var(--kt-bg-2); color: var(--kt-fg-dim);
  border: 1px solid var(--kt-border);
}
.kt-chip[aria-pressed="true"] { background: rgba(88,166,255,.16); border-color: rgba(88,166,255,.45); color: #9CCBFF; }
.kt-chip:active { transform: scale(.97); }
.kt-saving { opacity: .55; pointer-events: none; }
.kt-link { color: var(--kt-accent); cursor: pointer; text-decoration: none; }
.kt-link:hover { text-decoration: underline; }
`;

  /** CSS của lớp overlay trên chart (ring + thẻ hover) — layer riêng, không chặn chuột. */
  KT.OVERLAY_CSS = `
:host { all: initial; }
.kt-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
.kt-ring {
  position: fixed; border-radius: 50%; pointer-events: none;
  border: 2px solid var(--c, #8B949E);
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 8px -1px var(--c, #8B949E);
}
.kt-ring::after {
  content: attr(data-tier);
  position: absolute; right: -5px; bottom: -6px;
  font: 700 8px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0B0E13; background: var(--c, #8B949E);
  padding: 2px 3px; border-radius: 3px;
}
.kt-ring.kt-flag { border-style: dashed; }

.kt-card {
  position: fixed; pointer-events: none;
  width: 250px; padding: 9px 10px;
  background: #0F1319; border: 1px solid #262C36; border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.6);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px; line-height: 1.4; color: #E6EDF3;
}
.kt-card .kt-card-head { display: flex; align-items: center; gap: 7px; }
.kt-card .kt-card-name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-card .kt-card-desc { margin-top: 5px; color: #9BA6B2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.kt-card .kt-card-stat { margin-top: 5px; color: #6E7A88; font-size: 11px; font-variant-numeric: tabular-nums; }
.kt-card .kt-card-flag { margin-top: 5px; color: #FFB4AE; font-size: 11px; }
/* Ghi chú của CHÍNH MÌNH — thứ đáng đọc nhất trên thẻ, nên nó phải khác hẳn
   mấy dòng số liệu của GMGN. Vạch trái để mắt tách ra ngay. */
.kt-card .kt-card-note {
  margin-top: 6px; padding-left: 7px; border-left: 2px solid #3FB950;
  color: #E6EDF3; font-size: 12px;
  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.kt-card .kt-card-note-meta { margin-top: 3px; color: #6E7A88; font-size: 10px; }
`;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PANEL_CSS: KT.PANEL_CSS, OVERLAY_CSS: KT.OVERLAY_CSS, X_CSS: KT.X_CSS };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
