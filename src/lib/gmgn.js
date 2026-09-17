/**
 * Đọc dữ liệu THÔ của GMGN.
 *
 * Nguồn: `GET /api/v1/token/{chain}/{token}/community/messages` — chính cái
 * API dựng ra mấy avatar trên cây nến. Một message trả về đủ thứ mà trước đây
 * phải research bằng tay:
 *
 *   username / display_name / user_twitter_url / profile_image_url
 *   wallet_address        ← khoá ỔN ĐỊNH của một người
 *   content / created_at  ← nó nói gì, lúc nào
 *   multiplier            ← GMGN tự tính x mấy kể từ lúc post
 *   bought/sold/balance   ← nó có thật sự mua không, hay hô xong xả sạch
 *
 * ⚠ TUYỆT ĐỐI KHÔNG dùng `encrypted_user_id` làm khoá: đo trên trang thật
 * (17/09/2026) thấy CÙNG một message trả về BA giá trị khác nhau trong ba lần
 * gọi — nó mã hoá lại mỗi lần. Lấy nó làm khoá thì mỗi lần mở chart là đẻ ra
 * một người mới trong Sheet, âm thầm, không lỗi.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  /** Chuỗi số của API ("166.514153911168574356") → number. Không đọc được → null. */
  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  const HOLDING_LABELS = {
    no_buy: "hô mà không mua",
    sold_all: "đã xả sạch",
    sold_part: "đã xả một phần",
    holding: "còn giữ",
    unknown: "",
  };

  /**
   * CHỈ "hô mà không mua" là cờ đỏ.
   *
   * ⚠ Bản đầu tính cả "đã xả sạch" — sai, và chỉ lộ ra khi chạy trên dữ liệu
   * thật: một token bình thường cho 46/50 người dính cờ đỏ. Vì gần như ai post
   * từ một tháng trước thì giờ cũng đã bán xong; đó là kết cục bình thường,
   * không phải dấu hiệu xấu. Cờ đỏ mà 92% dính thì không phân loại được gì.
   *
   * Spec viết là "xả NGAY sau khi gọi" — mấu chốt nằm ở chữ NGAY, mà API chỉ
   * cho biết BÂY GIỜ còn giữ hay không, không cho biết bán lúc nào. Suy ra
   * "bán nhanh" từ "hiện không còn giữ" là suy bừa.
   *
   * Còn `no_buy` thì bẩn bất kể thời gian: mồm hô, tiền không bỏ.
   */
  const HOLDING_RED_FLAGS = ["no_buy"];

  /**
   * Nó có ăn theo chính lời nó hô không?
   *
   * `balance` gần 0 so với số đã mua thì coi là sạch — giữ lại vài đồng bụi
   * sau khi bán là chuyện thường, mà đòi đúng 0 thì mọi ca như thế bị xếp
   * nhầm sang "còn giữ", tức là bỏ sót đúng cái cờ đỏ cần bắt.
   */
  function holdingState(msg) {
    const bought = num(msg.bought_amount);
    const sold = num(msg.sold_amount);
    const balance = num(msg.balance);
    const transferOut = num(msg.transfer_out_amount) || 0;

    if (bought === null && sold === null && balance === null) return "unknown";

    const b = bought || 0;
    const s = sold || 0;
    const bal = balance || 0;

    if (b === 0 && s === 0 && bal === 0 && transferOut === 0) return "no_buy";

    const dust = Math.max(b * 0.001, 0);
    if (bal <= dust && s + transferOut > 0) return "sold_all";
    if (s > 0 && bal > dust) return "sold_part";
    if (s === 0 && bal > dust) return "holding";
    return "unknown";
  }

  /**
   * Một message thô → object gọn mà phần còn lại của extension dùng.
   * Field nào thiếu thì để rỗng/null, KHÔNG bịa giá trị mặc định: "không biết"
   * và "bằng 0" là hai chuyện khác nhau khi đánh giá một người.
   */
  function normalizeMessage(msg) {
    if (!msg || typeof msg !== "object") return null;

    const username = String(msg.username || "").trim();
    const wallet = String(msg.wallet_address || "").trim().toLowerCase();
    if (!wallet && !username) return null;

    const state = holdingState(msg);

    return {
      wallet,
      username,
      displayName: String(msg.display_name || "").trim(),
      avatar: String(msg.profile_image_url || "").trim(),
      twitterUrl: String(msg.user_twitter_url || "").trim(),

      postId: String(msg.id || msg.ulid || "").trim(),
      postText: String(msg.display_content || msg.content || "").trim(),
      postedAt: String(msg.created_at || "").trim(),
      postedTs: msg.created_at ? KT.parseDateLoose(msg.created_at) : null,

      multiple: num(msg.multiplier),
      followers: num(msg.follower_count),
      likes: num(msg.like_count),
      replies: num(msg.reply_count),
      isKol: msg.is_kol === true,
      verified: msg.is_blue_verified === true,

      holding: state,
      holdingLabel: HOLDING_LABELS[state] || "",
      isHoldingRedFlag: HOLDING_RED_FLAGS.indexOf(state) !== -1,
      bought: num(msg.bought_amount),
      sold: num(msg.sold_amount),
      balance: num(msg.balance),
      pnlUsd: num(msg.current_pnl_usd),
      holdingUsd: num(msg.current_holding_usd),

      source: String(msg.source || "").trim(),
    };
  }

  /**
   * Response của endpoint community/messages → mảng đã chuẩn hoá.
   * Chịu được cả khi GMGN đổi hình dạng bọc ngoài: tìm mảng `messages` ở vài
   * chỗ hay gặp rồi mới bỏ cuộc.
   */
  function parseMessages(payload) {
    if (!payload) return [];
    const data = payload.data || payload;
    const list = data.messages || data.list || (Array.isArray(data) ? data : null);
    if (!Array.isArray(list)) return [];

    const out = [];
    const seen = Object.create(null);
    for (const raw of list) {
      const item = normalizeMessage(raw);
      if (!item) continue;
      // Cùng một bài post có thể về nhiều lần (phân trang chồng nhau)
      const key = item.postId || item.wallet + "|" + item.postedAt;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(item);
    }
    out.sort((a, b) => {
      if (a.postedTs == null && b.postedTs == null) return 0;
      if (a.postedTs == null) return 1;
      if (b.postedTs == null) return -1;
      return a.postedTs - b.postedTs; // ai post SỚM nhất đứng đầu
    });
    return out;
  }

  /** Chain + địa chỉ token nằm ngay trong URL của endpoint. */
  function parseEndpoint(url) {
    const m = String(url || "").match(/\/api\/v1\/token\/([^/]+)\/([^/]+)\/community\/messages/);
    return m ? { chain: m[1], tokenAddress: m[2] } : null;
  }

  KT.gmgn = {
    num,
    holdingState,
    normalizeMessage,
    parseMessages,
    parseEndpoint,
    HOLDING_LABELS,
    HOLDING_RED_FLAGS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.gmgn;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
