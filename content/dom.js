/**
 * Helper DOM dùng chung cho mọi content script.
 *
 * Repo có một luật rõ: `src/lib/*` là logic THUẦN, không đụng DOM hay
 * `chrome.*`, để `node --test` chạy được. Luật đó tốt, nhưng nó bỏ trống một
 * chỗ: thứ vừa đụng DOM vừa dùng chung cho nhiều mặt thì để đâu? Trước đây
 * câu trả lời là "chép sang file bên cạnh" — nên đoạn dựng shadow root bị gõ
 * tay ở BỐN chỗ (panel, overlay, note-box, x).
 *
 * File này là tầng đó. Luật của nó:
 *   - chỉ hàm dùng cho HAI mặt trở lên, không phải chỗ chứa đồ linh tinh;
 *   - không giữ state, không biết gì về GMGN/X/Sheet;
 *   - nạp TRƯỚC mọi `content/<mặt>.js` trong cả hai danh sách content script.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /**
   * Một hòn đảo riêng để vẽ UI của mình, KHÔNG dính CSS của trang chủ nhà.
   *
   * ⚠ `mode: "open"` là cố ý, không phải sơ ý: đóng lại thì chính mình cũng
   * không soi được bằng devtools lẫn Playwright, mà đây là thứ hay hỏng nhất
   * khi GMGN/X đổi giao diện. Không có bí mật gì trong đó để phải giấu.
   *
   * ⚠ CSS truyền vào là CHUỖI, nhét bằng <style> — shadow root không ăn
   * <link> tới file trong extension mà không khai `web_accessible_resources`,
   * và khai thì mọi trang đều đọc được danh sách file của extension.
   *
   * @param o.id        id của thẻ bọc; bỏ trống khi mọc nhiều cái (mỗi bài
   *                    trong feed một cái — id phải duy nhất trong cả trang,
   *                    dùng id ở đó là `getElementById` chỉ thấy cái đầu tiên)
   * @param o.css       chuỗi CSS
   * @param o.hostStyle `cssText` của thẻ bọc (vị trí, z-index)
   * @param o.wrapClass class của thẻ trong cùng
   */
  function shadowHost(o) {
    const opts = o || {};
    const host = document.createElement("div");
    if (opts.id) host.id = opts.id;
    if (opts.hostStyle) host.style.cssText = opts.hostStyle;
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = opts.css || "";
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    if (opts.wrapClass) wrap.className = opts.wrapClass;
    shadow.appendChild(wrap);

    return { host, shadow, wrap };
  }

  /**
   * Extension còn sống, hay đã bị một bản cập nhật bỏ rơi?
   *
   * Bấm ⟳ ở chrome://extensions làm content script trong tab đang mở thành
   * MỒ CÔI: `chrome.runtime.id` biến mất và mọi `sendMessage` ném lỗi. Tab
   * phải F5 mới sống lại. Được gõ tay ở ba file trước khi về đây.
   *
   * ⚠ CHỈ dùng để chặn `sendMessage`. Đừng chặn một lượt ĐỌC
   * `chrome.storage` bằng nó: đọc hỏng thì `catch` lo, còn chặn sớm thì
   * trang xem thử (stub không có runtime.id thật) im lặng không có dữ liệu,
   * mà triệu chứng giống hệt "bên kia chưa ghi gì".
   */
  function alive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  KT.dom = { shadowHost, alive };
})(typeof globalThis !== "undefined" ? globalThis : self);
