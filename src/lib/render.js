/**
 * Dựng HTML cho panel (content script) VÀ popup — một bản dựng duy nhất,
 * hai vỏ khác nhau.
 *
 * ⚠ Mọi giá trị đi vào HTML đều phải qua esc(): nội dung là chữ người khác
 * gõ (ghi chú của hai đứa, và post của người lạ trên GMGN), và nó được chèn
 * vào trang gmgn.ai.
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

  /** Chỉ cho http(s) vào src/href — avatar_url là chữ gõ tay trong Sheet. */
  function safeUrl(raw) {
    const s = String(raw == null ? "" : raw).trim();
    return /^https?:\/\//i.test(s) ? s : "";
  }

  function initials(name) {
    const parts = KT.stripAccents(name).replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/);
    if (!parts[0]) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function shortWallet(wallet) {
    const w = String(wallet || "");
    return w.length > 12 ? w.slice(0, 6) + "…" + w.slice(-4) : w;
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

  function trimZeros(s) {
    return s.indexOf(".") < 0 ? s : s.replace(/0+$/, "").replace(/\.$/, "");
  }

  /**
   * "x mấy" là con số để liếc, không phải để đối chiếu sổ sách. Một chữ số sau
   * dấu phẩy đã trả lời xong câu hỏi — x1.3 hay x1.3456 thì cũng là cùng một
   * kết luận, mà cái đuôi dài thì đẩy phần còn lại của dòng ra khỏi panel.
   *
   * Dưới x1 mới giữ hai chữ số: ở đó x0.05 và x0.1 là hai mức lỗ khác hẳn nhau,
   * làm tròn về một chữ số là bóp cả dải đó thành vài giá trị.
   */
  function fmtMultiple(m) {
    if (m == null || m === "") return "";
    const n = Number(m);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    return "x" + trimZeros(n.toFixed(abs >= 10 ? 0 : abs < 1 ? 2 : 1));
  }

  /**
   * Chỉ `no_buy` màu đỏ. `sold_all` là kết cục bình thường của một bài post cũ,
   * tô đỏ thì cả danh sách đỏ lòm và mắt hết phân biệt được gì (xem
   * HOLDING_RED_FLAGS trong gmgn.js). `holding` màu xanh vì còn tiền trong đó
   * là tín hiệu tốt duy nhất đo được.
   */
  const HOLDING_COLOR = {
    no_buy: "#F85149",
    sold_all: "#8B949E",
    sold_part: "#8B949E",
    holding: "#3FB950",
    unknown: "#6E7A88",
  };

  function avatarHtml(person, big) {
    const color = KT.tierColor(person.tier);
    const url = safeUrl(person.avatar);
    const ini = esc(initials(person.username || person.displayName || person.wallet));
    const inner = url ? `<img src="${esc(url)}" alt="" data-ini="${ini}">` : ini;
    return `<span class="kt-av${big ? " kt-lg" : ""}" style="border-color:${color}">${inner}</span>`;
  }

  function tierBadgeHtml(person) {
    const color = KT.tierColor(person.tier);
    const label = person.tier || "chưa xếp hạng";
    return `<span class="kt-tier" style="color:${color}" title="${esc(label)}">${esc(
      person.tierLetter || "?"
    )}</span>`;
  }

  function holdingHtml(state, label) {
    if (!state || state === "unknown") return "";
    const color = HOLDING_COLOR[state] || HOLDING_COLOR.unknown;
    return `<span class="kt-pos" style="color:${color};background:${color}22">${esc(
      label || KT.gmgn.HOLDING_LABELS[state] || state
    )}</span>`;
  }

  /** Dòng một người trong danh sách kết quả tìm kiếm. */
  function personRow(person, note) {
    const sub =
      note ||
      (person.noteCount ? `${person.noteCount} ghi chú` : person.ghost ? "chưa có hồ sơ" : "chưa ghi chú nào");
    const flag = person.redFlags ? ' <span style="color:#F85149" title="có cờ đỏ">⚑</span>' : "";
    return `<div class="kt-row" data-key="${esc(person.wallet || person.usernameKey)}" role="option" tabindex="-1">
      ${avatarHtml(person)}
      <span class="kt-grow kt-trunc">
        <span class="kt-name">${esc(person.username || shortWallet(person.wallet))}</span>${flag}
        <span class="kt-sub kt-trunc" style="display:block">${esc(sub)}</span>
      </span>
      ${tierBadgeHtml(person)}
    </div>`;
  }

  function resultsHtml(hits) {
    return hits.map((h) => personRow(h.person, h.reason || null)).join("");
  }

  /**
   * Một người đang hiện trên chart. `caller` là message đã chuẩn hoá từ API,
   * `person` là hồ sơ trong Sheet (có thể null = người lạ).
   */
  /** 8060.36 → "$8.1K". Số dài ngoằng trong một hàng hẹp thì không ai đọc. */
  function fmtUsd(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const abs = Math.abs(n);
    const dau = n < 0 ? "-$" : "$";
    if (abs >= 1e9) return dau + trimZeros((abs / 1e9).toFixed(1)) + "B";
    if (abs >= 1e6) return dau + trimZeros((abs / 1e6).toFixed(1)) + "M";
    if (abs >= 1e3) return dau + trimZeros((abs / 1e3).toFixed(1)) + "K";
    return dau + trimZeros(abs.toFixed(abs < 10 ? 2 : 0));
  }

  function callerRow(caller, person) {
    const known = !!person;
    const bits = [];
    if (caller.multiple != null) bits.push(fmtMultiple(caller.multiple));
    if (caller.postCount > 1) bits.push("hô " + caller.postCount + " lần");
    if (caller.followers != null) bits.push(caller.followers + " follower");
    if (caller.postedTs) bits.push(timeAgo(caller.postedTs));
    // Tiền là số GMGN đưa thẳng, không phải mình diễn giải — và nó PHÂN LOẠI
    // được, khác hẳn cái nhãn "còn giữ" đúng với cả 200 người.
    if (caller.tradeUsd != null) bits.push("vào " + fmtUsd(caller.tradeUsd));
    if (caller.pnlUsd != null && caller.tuChart) bits.push("lãi " + fmtUsd(caller.pnlUsd));
    const postedFull = KT.fmtDateTime(caller.postedTs || caller.postedAt);

    const flag = person && person.redFlags ? ' <span style="color:#F85149" title="có cờ đỏ">⚑</span>' : "";
    const tier = known
      ? tierBadgeHtml(person)
      : '<span class="kt-tier" style="color:#6E7A88" title="chưa có trong Sheet">mới</span>';

    return `<div class="kt-row" data-caller="${esc(caller.postId || caller.wallet)}" role="option" tabindex="-1">
      ${avatarHtml({ tier: known ? person.tier : "", avatar: caller.avatar, username: caller.username })}
      <span class="kt-grow kt-trunc">
        <span class="kt-name">${esc(caller.username || shortWallet(caller.wallet))}</span>${flag}
        <span class="kt-sub kt-trunc" style="display:block">${esc(caller.postText || "—")}</span>
        <span class="kt-sub" style="display:block" title="${esc(
          postedFull ? "post " + postedFull : ""
        )}">${holdingHtml(caller.holding, caller.holdingLabel)} ${esc(bits.join(" · "))}</span>
      </span>
      ${tier}
    </div>`;
  }

  /** Bảng ghi chú của một người. */
  function notesHtml(notes, limit) {
    if (!notes.length) return `<div class="kt-hint">Chưa ghi chú gì về người này.</div>`;
    const rows = notes
      .slice(0, limit || 8)
      .map((n) => {
        // Ngày ĐẦY ĐỦ, không phải "1 tháng trước": đây là cột mốc của một ghi
        // chú, thứ để đối chiếu với cây nến. "Bao lâu rồi" đẩy vào title.
        const when = KT.fmtDateTime(n.notedTs || n.notedAt);
        const ago = n.notedTs ? timeAgo(n.notedTs) : "";
        const meta = [n.token, fmtMultiple(n.multiple), n.positionRaw, n.result]
          .filter(Boolean)
          .join(" · ");
        return `<div class="kt-note">
          <div class="kt-note-head">
            <span class="kt-tok">${esc(n.token || "—")}</span>
            ${holdingHtml(n.holding)}
            <span class="kt-spacer"></span>
            <span class="kt-sub" title="${esc(ago)}">${esc(when)}${
              n.addedBy ? " · " + esc(n.addedBy) : ""
            }</span>
          </div>
          <div class="kt-note-body">${esc(n.note || "—")}</div>
          ${n.postText ? `<div class="kt-note-post">“${esc(n.postText)}”</div>` : ""}
          ${meta && meta !== n.token ? `<div class="kt-sub">${esc(meta)}</div>` : ""}
        </div>`;
      })
      .join("");
    const more =
      notes.length > (limit || 8)
        ? `<div class="kt-hint">… và ${notes.length - (limit || 8)} ghi chú cũ hơn.</div>`
        : "";
    return rows + more;
  }

  /** Thẻ chi tiết một người. */
  function personDetail(person, opts) {
    const o = opts || {};
    const meta = [];
    if (person.wallet) meta.push(shortWallet(person.wallet));
    if (person.followers != null) meta.push(person.followers + " follower");
    if (person.firstSeen) meta.push("thấy lần đầu " + KT.fmtDateTime(person.firstSeen));
    if (person.lastNoted) meta.push("ghi chú gần nhất " + KT.fmtDateTime(person.lastNoted));

    return `<div class="kt-detail">
      <div class="kt-detail-head">
        ${avatarHtml(person, true)}
        <div class="kt-grow">
          <div class="kt-handle">${esc(person.username || shortWallet(person.wallet))} ${tierBadgeHtml(person)}</div>
          ${person.displayName ? `<div class="kt-aliases">${esc(person.displayName)}</div>` : ""}
          ${o.renamedFrom ? `<div class="kt-aliases" style="color:#F0883E">đã đổi tên từ @${esc(o.renamedFrom)}</div>` : ""}
          ${
            person.fresh
              ? `<div class="kt-aliases" style="color:#3FB950">Người mới — chưa có trong Sheet</div>`
              : person.ghost
              ? `<div class="kt-aliases" style="color:#F0883E">Chưa có dòng Overview — chỉ thấy trong Detail</div>`
              : ""
          }
        </div>
      </div>
      ${person.summary ? `<div class="kt-desc">${esc(person.summary)}</div>` : ""}
      ${person.redFlags ? `<div class="kt-flags"><b>⚑ Cờ đỏ:</b> ${esc(person.redFlags)}</div>` : ""}
      ${o.caller ? callerSnapshot(o.caller) : ""}
      <div data-slot="ledger"></div>
      <div class="kt-btns">
        <button class="kt-btn kt-primary" data-act="note" data-key="${esc(person.wallet || person.usernameKey)}">Ghi chú (N)</button>
        ${person.twitterUrl ? `<button class="kt-btn" data-act="open-x" data-value="${esc(safeUrl(person.twitterUrl))}">Mở X</button>` : ""}
        <button class="kt-btn" data-act="copy" data-value="${esc(person.wallet || person.username)}">Copy ví</button>
        <button class="kt-btn" data-act="back">← Danh sách</button>
      </div>
      <div class="kt-sec-title">Ghi chú (${person.noteCount || 0})</div>
      ${notesHtml(person.notes || [], o.noteLimit || 8)}
      ${meta.length ? `<div class="kt-hint">${esc(meta.join(" · "))}</div>` : ""}
    </div>`;
  }

  /**
   * Một dòng số liệu của sổ tự ghi (src/lib/ledger.js). Rỗng khi sổ chưa thấy
   * cú call nào của người này — KHÔNG in "0 kèo": chưa thấy khác với không có.
   */
  function ledgerHtml(parts) {
    if (!parts || !parts.length) return "";
    return `<div class="kt-ledger" title="${esc(
      "Extension tự ghi mọi cú call nó nhìn thấy trên GMGN và X. " +
        "'Ghi trước' = thấy khi kèo CHƯA chạy — chỉ những cú đó mới đáng dùng để chấm điểm. " +
        "Đây mới là số liệu, CHƯA phải kết luận."
    )}"><b>Sổ tự ghi:</b> ${esc(parts.join(" · "))}</div>`;
  }

  /** Ảnh chụp tình trạng hiện tại của người này với token đang mở. */
  function callerSnapshot(caller) {
    const bits = [];
    if (caller.multiple != null) bits.push("hiện " + fmtMultiple(caller.multiple));
    if (caller.pnlUsd != null) bits.push("PnL $" + Math.round(caller.pnlUsd));
    if (caller.postedTs) bits.push("post " + KT.fmtDateTime(caller.postedTs));
    return `<div class="kt-snap">
      ${holdingHtml(caller.holding, caller.holdingLabel)}
      <span class="kt-sub">${esc(bits.join(" · "))}</span>
      ${caller.postText ? `<div class="kt-note-post">“${esc(caller.postText)}”</div>` : ""}
    </div>`;
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
  KT.shortWallet = shortWallet;
  KT.timeAgo = timeAgo;
  KT.fmtMultiple = fmtMultiple;
  KT.fmtUsd = fmtUsd;
  KT.render = {
    personRow,
    resultsHtml,
    callerRow,
    personDetail,
    ledgerHtml,
    notesHtml,
    callerSnapshot,
    hydrateAvatars,
    HOLDING_COLOR,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { esc, safeUrl, initials, shortWallet, timeAgo, fmtMultiple, ledgerHtml };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
