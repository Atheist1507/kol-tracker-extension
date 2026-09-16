/**
 * Dựng HTML cho panel (content script) VÀ popup — một bản dựng duy nhất,
 * hai vỏ khác nhau. Tách ra đây vì đã có lần định "chỉ copy tạm sang popup".
 *
 * ⚠ Mọi giá trị đi vào HTML đều phải qua esc(): nội dung là chữ người khác
 * gõ vào Google Sheet, và nó được chèn vào trang gmgn.ai.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Chỉ cho http(s) vào thuộc tính src/href — ô avatar_url là chữ gõ tay. */
  function safeUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!/^https?:\/\//i.test(s)) return "";
    return s;
  }

  function initials(handle) {
    const parts = KT.stripAccents(handle).replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
    if (!parts[0]) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function avatarHtml(kol, big) {
    const color = KT.tierColor(kol.tier);
    const url = safeUrl(kol.avatar);
    const cls = "kt-av" + (big ? " kt-lg" : "");
    const ini = esc(initials(kol.handle));
    const inner = url ? `<img src="${esc(url)}" alt="" data-ini="${ini}">` : ini;
    return `<span class="${cls}" style="border-color:${color}">${inner}</span>`;
  }

  function tierBadgeHtml(kol) {
    const letter = kol.tierLetter || "?";
    const color = KT.tierColor(kol.tier);
    const label = kol.tier ? kol.tier : "chưa xếp hạng";
    return `<span class="kt-tier" style="color:${color}" title="${esc(label)}">${esc(letter)}</span>`;
  }

  function timeAgo(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 0) return "sắp tới";
    const min = Math.floor(diff / 60000);
    if (min < 1) return "vừa xong";
    if (min < 60) return min + " phút trước";
    const h = Math.floor(min / 60);
    if (h < 24) return h + " giờ trước";
    const d = Math.floor(h / 24);
    if (d < 30) return d + " ngày trước";
    const mo = Math.floor(d / 30);
    if (mo < 12) return mo + " tháng trước";
    return Math.floor(mo / 12) + " năm trước";
  }

  function fmtMultiple(m) {
    if (m == null) return "";
    return "x" + (Number.isInteger(m) ? m : m.toFixed(m < 10 ? 2 : 1).replace(/\.?0+$/, ""));
  }

  /** Dòng kết quả trong danh sách tìm kiếm. */
  function rowHtml(kol, note) {
    const calls = kol.calls.length;
    const sub = note || (calls ? `${calls} call` : kol.ghost ? "chưa có hồ sơ" : "chưa có call nào");
    const flag = kol.redFlags ? ' <span style="color:#F85149" title="có cờ đỏ">⚑</span>' : "";
    return `<div class="kt-row" data-key="${esc(kol.key)}" role="option" tabindex="-1">
      ${avatarHtml(kol)}
      <span class="kt-grow kt-trunc">
        <span class="kt-name">${esc(kol.handle)}</span>${flag}
        <span class="kt-sub kt-trunc" style="display:block">${esc(sub)}</span>
      </span>
      ${tierBadgeHtml(kol)}
    </div>`;
  }

  function resultsHtml(hits) {
    if (!hits.length) return "";
    return hits.map((h) => rowHtml(h.kol, h.reason === "handle" ? null : h.reason)).join("");
  }

  function statsHtml(kol) {
    const s = kol.stats || KT.calcStats([]);
    const winRate =
      s.winRate == null ? "—" : Math.round(s.winRate * 100) + "%";
    const best = s.bestMultiple == null ? "—" : fmtMultiple(s.bestMultiple);

    const total = Math.max(1, s.win + s.loss + s.neutral + s.unknown);
    const seg = (n, color) =>
      n ? `<i style="width:${(n / total) * 100}%;background:${color}"></i>` : "";

    const warn = !s.enoughSample && s.total > 0
      ? `<div class="kt-hint">Mới ${s.total} case — cần ≥ ${s.minSample || KT.MIN_SAMPLE} case win rate mới đáng tin.</div>`
      : "";

    return `<div class="kt-stats">
        <div class="kt-stat"><div class="kt-stat-v">${s.total}</div><div class="kt-stat-l">Call</div></div>
        <div class="kt-stat"><div class="kt-stat-v" style="color:${s.winRate != null && s.winRate >= 0.5 ? "#3FB950" : "#E6EDF3"}">${winRate}</div><div class="kt-stat-l">Win rate</div></div>
        <div class="kt-stat"><div class="kt-stat-v">${esc(best)}</div><div class="kt-stat-l">Cao nhất</div></div>
      </div>
      <div class="kt-bar" title="${s.win} thắng · ${s.loss} thua · ${s.neutral} huề · ${s.unknown} chưa rõ">
        ${seg(s.win, "#3FB950")}${seg(s.neutral, "#8B949E")}${seg(s.loss, "#F85149")}${seg(s.unknown, "#2A313B")}
      </div>${warn}`;
  }

  function positionHtml(s) {
    const p = s.position || {};
    const parts = [];
    if (p.early) parts.push(`${p.early} vào sớm`);
    if (p.mid) parts.push(`${p.mid} giữa sóng`);
    if (p.late) parts.push(`${p.late} đu đỉnh`);
    if (!parts.length) return "";
    return `<div class="kt-hint">Timing: ${esc(parts.join(" · "))}</div>`;
  }

  function callsTableHtml(calls, limit) {
    if (!calls.length) return `<div class="kt-hint">Chưa log call nào cho người này.</div>`;
    const rows = calls
      .slice(0, limit || 10)
      .map((c) => {
        const r = KT.parseResult(c.result);
        const when = c.calledAtTs ? timeAgo(c.calledAtTs) : c.calledAt || "";
        const pos = c.position
          ? `<span class="kt-pos kt-pos-${c.position}">${esc(KT.POSITION_LABELS[c.position])}</span>`
          : "";
        return `<tr>
          <td class="kt-tok">${esc(c.token || "—")}</td>
          <td class="kt-res-${r.outcome}">${esc(c.result || "—")}</td>
          <td>${pos}</td>
          <td style="color:#6E7A88;white-space:nowrap">${esc(when)}</td>
        </tr>`;
      })
      .join("");
    const more =
      calls.length > (limit || 10)
        ? `<div class="kt-hint">… và ${calls.length - (limit || 10)} call cũ hơn.</div>`
        : "";
    return `<table class="kt-table">
      <thead><tr><th>Token</th><th>Kết quả</th><th>Timing</th><th>Khi nào</th></tr></thead>
      <tbody>${rows}</tbody></table>${more}`;
  }

  /** Thẻ chi tiết một KOL. */
  function detailHtml(kol, opts) {
    const o = opts || {};
    const meta = [];
    if (kol.source) meta.push("Nguồn: " + kol.source);
    if (kol.addedBy) meta.push("Thêm bởi " + kol.addedBy);
    if (kol.updatedAt) meta.push("Cập nhật " + kol.updatedAt);

    const extras = Object.keys(kol.extra || {})
      .map((k) => `<div class="kt-hint"><b style="color:#9BA6B2">${esc(k)}:</b> ${esc(kol.extra[k])}</div>`)
      .join("");

    return `<div class="kt-detail">
      <div class="kt-detail-head">
        ${avatarHtml(kol, true)}
        <div class="kt-grow">
          <div class="kt-handle">${esc(kol.handle)} ${tierBadgeHtml(kol)}</div>
          ${kol.aliases.length ? `<div class="kt-aliases">còn gọi: ${esc(kol.aliases.join(", "))}</div>` : ""}
          ${kol.ghost ? `<div class="kt-aliases" style="color:#F0883E">Chưa có hồ sơ ở tab KOLs — chỉ thấy trong Calls</div>` : ""}
        </div>
      </div>
      ${kol.description ? `<div class="kt-desc">${esc(kol.description)}</div>` : ""}
      ${kol.redFlags ? `<div class="kt-flags"><b>⚑ Cờ đỏ:</b> ${esc(kol.redFlags)}</div>` : ""}
      ${statsHtml(kol)}
      ${positionHtml(kol.stats || {})}
      ${extras}
      <div class="kt-sec-title">Lịch sử call</div>
      ${callsTableHtml(kol.calls, o.callLimit || 10)}
      ${meta.length ? `<div class="kt-hint">${esc(meta.join(" · "))}</div>` : ""}
      <div class="kt-btns">
        <button class="kt-btn" data-act="copy" data-value="${esc(kol.handle)}">Copy handle</button>
        ${o.sheetUrl ? `<button class="kt-btn" data-act="open-sheet">Mở Sheet</button>` : ""}
        <button class="kt-btn" data-act="back">← Danh sách</button>
      </div>
    </div>`;
  }

  /** "Ai đã call token này" — xếp theo AI CALL SỚM NHẤT. */
  function tokenHtml(token, hits) {
    if (!hits.length) return "";
    const rows = hits
      .map(({ kol, call }, i) => {
        const when = call.calledAtTs ? timeAgo(call.calledAtTs) : call.calledAt || "";
        const note = [i === 0 ? "call sớm nhất" : "", when, call.result || ""]
          .filter(Boolean)
          .join(" · ");
        return rowHtml(kol, note);
      })
      .join("");
    return `<div class="kt-sec-title">$${esc(token)} — ${hits.length} người đã call</div>${rows}`;
  }

  /**
   * Gắn fallback cho ảnh SAU khi chèn HTML — không dùng onerror inline được
   * vì CSP của trang chủ nhà có quyền chặn inline handler.
   */
  function hydrateAvatars(scope) {
    scope.querySelectorAll("img[data-ini]").forEach((img) => {
      if (img.dataset.ktBound) return;
      img.dataset.ktBound = "1";
      img.addEventListener("error", () => {
        const holder = img.parentElement;
        if (holder) holder.textContent = img.dataset.ini || "?";
      });
    });
  }

  KT.esc = esc;
  KT.safeUrl = safeUrl;
  KT.initials = initials;
  KT.timeAgo = timeAgo;
  KT.fmtMultiple = fmtMultiple;
  KT.render = { rowHtml, resultsHtml, detailHtml, tokenHtml, statsHtml, callsTableHtml, hydrateAvatars };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { esc, safeUrl, initials, timeAgo, fmtMultiple };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
