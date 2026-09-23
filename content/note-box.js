/**
 * Hộp ghi chú — thứ biến extension từ "tra cứu" thành "ghi chép".
 *
 * Mở bằng phím N khi đang hover một người trên chart. Mọi thứ máy biết đã
 * điền sẵn (ví, username, token, nội dung post, x mấy, còn giữ hay đã xả);
 * người chỉ gõ đúng phần nhận xét.
 *
 * ⌘Enter lưu · Esc đóng.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  const POSITIONS = [
    { value: "đầu sóng", label: "Vào sớm" },
    { value: "giữa sóng", label: "Giữa sóng" },
    { value: "đu đỉnh", label: "Đu đỉnh" },
  ];
  const TIERS = ["S", "A", "B", "C", "D"];

  function createNoteBox(api) {
    const host = document.createElement("div");
    host.id = "kol-tracker-note";
    host.style.cssText = "position:fixed;z-index:2147483100;display:none;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = KT.PANEL_CSS;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "kt-root";
    shadow.appendChild(wrap);

    let ctx = null;
    let open = false;
    let saving = false;
    let position = "";
    let tier = "";

    function close() {
      open = false;
      ctx = null;
      host.style.display = "none";
      wrap.innerHTML = "";
    }

    function place() {
      const w = 380;
      const h = wrap.firstElementChild ? wrap.firstElementChild.offsetHeight : 380;
      const anchor = ctx && ctx.rect;
      let left = anchor ? anchor.right + 12 : (window.innerWidth - w) / 2;
      let top = anchor ? anchor.top : (window.innerHeight - h) / 2;
      if (left + w > window.innerWidth - 8) left = anchor ? anchor.left - w - 12 : window.innerWidth - w - 8;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
      if (top < 8) top = 8;
      host.style.left = left + "px";
      host.style.top = top + "px";
    }

    function render() {
      const person = ctx.person;
      const caller = ctx.caller;
      const tokenLine = [ctx.token, ctx.chain].filter(Boolean).join(" · ");

      wrap.innerHTML = `
        <div class="kt-sheet">
          <div class="kt-head" style="cursor:default">
            <span class="kt-title">Ghi chú</span>
            <span class="kt-spacer"></span>
            <button class="kt-icon" data-act="close" title="Đóng (Esc)">×</button>
          </div>
          <div class="kt-body">
            <div class="kt-detail-head">
              <span class="kt-av kt-lg" style="border-color:${KT.tierColor(person.tier)}">${
                KT.safeUrl(person.avatar)
                  ? `<img src="${KT.esc(KT.safeUrl(person.avatar))}" alt="" data-ini="${KT.esc(
                      KT.initials(person.username)
                    )}">`
                  : KT.esc(KT.initials(person.username || person.wallet))
              }</span>
              <div class="kt-grow">
                <div class="kt-handle">${KT.esc(person.username || KT.shortWallet(person.wallet))}</div>
                <div class="kt-aliases">${KT.esc(KT.shortWallet(person.wallet) || "chưa có ví")}${
                  person.ghost ? " · người mới" : ` · đã có ${person.noteCount} ghi chú`
                }</div>
                ${ctx.renamedFrom ? `<div class="kt-aliases" style="color:#F0883E">đã đổi tên từ @${KT.esc(ctx.renamedFrom)}</div>` : ""}
              </div>
            </div>

            ${caller ? KT.render.callerSnapshot(caller) : ""}
            ${tokenLine ? `<div class="kt-hint">Token: ${KT.esc(tokenLine)}</div>` : ""}

            <div class="kt-field">
              <label for="kt-note-text">Nhận xét của mày</label>
              <textarea class="kt-ta" id="kt-note-text" data-el="note"
                placeholder="Ví dụ: call sớm, có luận điểm rõ, nhưng hay xả nhanh…"></textarea>
            </div>

            ${
              // Ghi chú từ trang X là ghi chú về NGƯỜI, không gắn với cú call
              // nào — không có token thì "call ở đoạn nào của sóng" là câu hỏi
              // không có câu trả lời, hỏi nó chỉ tổ làm người ta phân vân.
              ctx.token
                ? `<div class="kt-field">
              <label>Call ở đoạn nào của sóng</label>
              <div class="kt-chips" data-el="positions">
                ${POSITIONS.map(
                  (p) =>
                    `<button class="kt-chip" data-pos="${KT.esc(p.value)}" aria-pressed="false">${KT.esc(
                      p.label
                    )}</button>`
                ).join("")}
              </div>
            </div>`
                : ""
            }

            <div class="kt-field">
              <label>Xếp hạng ${person.tier ? `(đang là ${KT.esc(person.tier)})` : ""}</label>
              <div class="kt-chips" data-el="tiers">
                ${TIERS.map(
                  (t) =>
                    `<button class="kt-chip" data-tier="${t}" aria-pressed="${
                      KT.tierLetter(person.tier) === t ? "true" : "false"
                    }" style="${KT.tierLetter(person.tier) === t ? "color:" + KT.tierColor(t) : ""}">${t}</button>`
                ).join("")}
              </div>
            </div>

            <div class="kt-btns">
              <button class="kt-btn kt-primary" data-act="save">Lưu vào Sheet (⌘↵)</button>
              <button class="kt-btn" data-act="close">Huỷ</button>
            </div>
            <div class="kt-hint" data-el="status"></div>
          </div>
        </div>`;

      KT.render.hydrateAvatars(wrap);
      tier = KT.tierLetter(person.tier);
      position = "";
    }

    function setStatus(msg, isError) {
      const el = wrap.querySelector('[data-el="status"]');
      if (el) el.innerHTML = isError ? `<span class="kt-err">${KT.esc(msg)}</span>` : KT.esc(msg);
    }

    async function save() {
      if (saving || !ctx) return;
      const noteEl = wrap.querySelector('[data-el="note"]');
      const note = noteEl ? noteEl.value.trim() : "";
      if (!note && !tier) {
        setStatus("Gõ vài chữ đã, hoặc ít nhất chọn một hạng.", true);
        if (noteEl) noteEl.focus();
        return;
      }

      saving = true;
      wrap.firstElementChild.classList.add("kt-saving");
      setStatus("Đang lưu…");

      const res = await api.saveNote(buildPayload(note));

      saving = false;
      wrap.firstElementChild.classList.remove("kt-saving");

      if (!res || !res.ok) {
        setStatus((res && res.error) || "Không lưu được.", true);
        // Hết giờ ≠ hỏng: rất có thể đã ghi xong. Khoá nút Lưu lại để không
        // bấm thêm phát nữa thành hai dòng trùng; muốn lưu thật thì đóng hộp
        // rồi mở lại, lúc đó đã nhìn Sheet rồi.
        if (res && res.timedOut) {
          const save = wrap.querySelector('[data-act="save"]');
          if (save) {
            save.disabled = true;
            save.textContent = "Đã gửi — kiểm tra Sheet";
          }
        }
        return;
      }
      api.onSaved(res, ctx);
      close();
    }

    /**
     * Khoá của một người trong Sheet là VÍ (Code.gs từ chối dòng thiếu ví).
     *
     * Nhưng người nhặt được từ API khác của GMGN có khi chỉ có tay cầm Twitter,
     * không kèm ví — và "không lưu được" thì cả cái hộp này thành vô nghĩa.
     * Lấy chính tay cầm làm khoá, viết rõ tiền tố `x:` để không ai nhìn nhầm
     * là địa chỉ ví thật.
     *
     * ⚠ Cái giá: nếu sau này gặp lại đúng người đó KÈM ví thật thì Sheet có
     * HAI dòng. Thà hai dòng gộp tay được còn hơn mất hẳn lần ghi chú.
     */
    function keyOf(person, caller) {
      const wallet = person.wallet || caller.wallet || "";
      if (wallet) return wallet;
      const handle = KT.handleKey(caller.username || person.username || "");
      // ID SỐ trước đã: username đổi lúc nào cũng được, đổi xong là dòng cũ
      // trong Sheet mồ côi — im lặng, không triệu chứng. ID thì không đổi.
      const xId = caller.xId || (api.xIdFor && api.xIdFor(handle)) || "";
      if (xId) return "x:" + xId;
      return handle ? "x:" + handle : "";
    }

    /**
     * Link về trang X của người đó.
     *
     * Có id thì dùng dạng `x.com/i/user/<id>` — X tự chuyển hướng sang tên
     * HIỆN TẠI, nên đổi tên bao nhiêu lần link vẫn sống. Không có id thì đành
     * dùng tên, biết là sẽ chết nếu họ đổi.
     */
    function twitterUrlOf(person, caller) {
      const has = caller.twitterUrl || person.twitterUrl || "";
      if (has) return has;
      const handle = KT.handleKey(caller.username || person.username || "");
      if (!handle) return "";
      const xId = caller.xId || (api.xIdFor && api.xIdFor(handle)) || "";
      return xId ? "https://x.com/i/user/" + xId : "https://x.com/" + (caller.username || person.username);
    }

    /** Gói đúng tên cột của Sheet — xem apps-script/Code.gs. */
    function buildPayload(note) {
      const person = ctx.person;
      const caller = ctx.caller || {};
      const me = api.getState().cfg.addedBy || "";
      const key = keyOf(person, caller);

      const personPatch = {
        wallet: key,
        username: caller.username || person.username || "",
        display_name: caller.displayName || person.displayName || "",
        twitter_url: twitterUrlOf(person, caller),
        // Chỉ URL http(s) mới đáng lưu: ảnh nhúng data: là một cục base64
        // vài KB nằm trong một ô Sheet, vô dụng mà còn phình file.
        avatar_url: KT.safeUrl(caller.avatar) || KT.safeUrl(person.avatar) || "",
        followers: caller.followers == null ? "" : caller.followers,
        is_kol: caller.isKol ? "true" : "",
        added_by: me,
      };
      // Chỉ gửi tier khi người dùng thật sự chọn — Code.gs không ghi đè cột
      // của người trừ khi lần lưu này gửi lên, nên đừng gửi rỗng cho vui.
      if (tier && tier !== KT.tierLetter(person.tier)) personPatch.tier = tier;

      return {
        action: "note",
        person: personPatch,
        detail: {
          wallet: key,
          username: caller.username || person.username || "",
          chain: ctx.chain || "",
          token: ctx.token || "",
          token_address: ctx.tokenAddress || "",
          post_id: caller.postId || "",
          post_text: caller.postText || "",
          // Ghi kiểu người đọc được, không phải ISO của API — cột này nằm cạnh
          // noted_at trong Sheet, hai kiểu ngày khác nhau trông như lỗi.
          posted_at: KT.fmtDateTime(caller.postedTs || caller.postedAt),
          multiplier_at_note: caller.multiple == null ? "" : caller.multiple,
          holding_state: caller.holdingLabel || "",
          pnl_usd_at_note: caller.pnlUsd == null ? "" : caller.pnlUsd,
          note: note,
          chart_position: position,
          source_url: location.href.split("#")[0],
          added_by: me,
        },
      };
    }

    wrap.addEventListener("click", (ev) => {
      const chip = ev.target.closest("[data-pos], [data-tier]");
      if (chip) {
        const group = chip.parentElement;
        const isTier = chip.hasAttribute("data-tier");
        const value = isTier ? chip.dataset.tier : chip.dataset.pos;
        const already = chip.getAttribute("aria-pressed") === "true";
        group.querySelectorAll(".kt-chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        if (!already) chip.setAttribute("aria-pressed", "true");
        if (isTier) tier = already ? "" : value;
        else position = already ? "" : value;
        return;
      }
      const act = ev.target.closest("[data-act]");
      if (!act) return;
      if (act.dataset.act === "close") return close();
      if (act.dataset.act === "save") return save();
    });

    wrap.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        return close();
      }
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        ev.stopPropagation();
        return save();
      }
      ev.stopPropagation(); // đừng để phím tắt của GMGN cướp chữ đang gõ
    });

    return {
      host,
      mount() {
        document.documentElement.appendChild(host);
      },
      isOpen: () => open,
      close,
      open(nextCtx) {
        ctx = nextCtx;
        open = true;
        host.style.display = "block";
        render();
        place();
        const ta = wrap.querySelector('[data-el="note"]');
        if (ta) ta.focus();
      },
    };
  }

  KT.createNoteBox = createNoteBox;
})(typeof globalThis !== "undefined" ? globalThis : self);
