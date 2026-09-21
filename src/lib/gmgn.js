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
    return groupCallers(out);
  }

  /**
   * Gộp nhiều BÀI POST của cùng một người thành MỘT dòng.
   *
   * API trả về từng bài, và một thằng hô đi hô lại năm lần thì nằm năm dòng.
   * Không gộp thì panel ghi "50 người đã post" trong khi thật ra là 50 bài của
   * ít người hơn nhiều — và con số "N đã có hồ sơ" cũng đếm trùng theo.
   *
   * Giữ bài SỚM NHẤT làm đại diện: đó mới là cú call. Mấy bài sau là hô thêm
   * khi giá đã chạy, lấy nó làm mốc thì ai cũng thành người vào sớm.
   * `postCount` giữ lại số lần hô — hô nhiều tự nó là một tín hiệu.
   */
  function groupCallers(list) {
    const byKey = Object.create(null);
    const order = [];
    for (const c of list) {
      const key = c.wallet || KT.handleKey(c.username);
      if (!key) {
        order.push(Object.assign({}, c, { postCount: 1 }));
        continue;
      }
      const prev = byKey[key];
      if (!prev) {
        byKey[key] = Object.assign({}, c, { postCount: 1 });
        order.push(byKey[key]);
        continue;
      }
      prev.postCount++;
      // Danh sách đã xếp theo thời gian, nên bài sau là bài MỚI hơn. Tình
      // trạng giữ hàng là chuyện của cả tài khoản chứ không của riêng một
      // bài — lấy bản mới nhất, nếu không thì "đã xả sạch" từ hôm nay bị một
      // bài từ tháng trước ghi đè ngược lại.
      if (c.holding && c.holding !== "unknown") {
        prev.holding = c.holding;
        prev.holdingLabel = c.holdingLabel;
        prev.isHoldingRedFlag = c.isHoldingRedFlag;
      }
      if (c.pnlUsd != null) prev.pnlUsd = c.pnlUsd;
      if (c.followers != null) prev.followers = c.followers;
      if (!prev.avatar && c.avatar) prev.avatar = c.avatar;
      if (!prev.twitterUrl && c.twitterUrl) prev.twitterUrl = c.twitterUrl;
      prev.lastPostedTs = c.postedTs;
    }
    return order;
  }


  /**
   * URL API → đường dẫn gọn để NHẬN MẶT một endpoint.
   *
   * Bỏ query, bỏ chain và địa chỉ token, vì cùng một endpoint gọi cho hai
   * token là hai URL khác nhau — không gom lại thì bảng chẩn đoán đầy những
   * dòng trông như nhau mà chẳng dòng nào lặp lại.
   */
  function apiPath(url) {
    let path = String(url || "");
    try {
      path = new URL(path, "https://gmgn.ai").pathname;
    } catch (e) {
      path = path.split("?")[0];
    }
    return path
      .replace(/\/(sol|eth|base|bsc|tron|blast|arb|op)(?=\/|$)/gi, "/{chain}")
      .replace(/\/0x[0-9a-f]{40}(?=\/|$)/gi, "/{dc}")
      .replace(/\/[1-9A-HJ-NP-Za-km-z]{32,44}(?=\/|$)/g, "/{dc}");
  }

  /* Khoá hay gặp trong JSON của GMGN cho từng phần của một con người. */
  const HANDLE_KEYS = ["username", "screen_name", "twitter_username", "twitter_screen_name", "user_name", "handle"];
  const NAME_KEYS = ["display_name", "twitter_name", "nickname", "name"];
  const AVATAR_KEYS = ["profile_image_url", "avatar_url", "twitter_avatar", "avatar", "icon"];
  const WALLET_KEYS = ["wallet_address", "maker", "address", "wallet"];
  /**
   * ID SỐ của tài khoản X — khoá DUY NHẤT không đổi được.
   *
   * Username thì đổi lúc nào cũng được, mà đổi xong là mọi dòng đã ghi trong
   * Sheet mồ côi, im lặng, không có triệu chứng gì. Thấy được id thì lấy id
   * làm khoá.
   */
  const XID_KEYS = ["twitter_id", "twitter_user_id", "x_id", "user_id", "id_str", "rest_id", "uid"];
  const XID_RE = /^[0-9]{5,25}$/;

  function pickId(obj) {
    for (const k of XID_KEYS) {
      const v = obj[k];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (XID_RE.test(s)) return s;
    }
    return "";
  }

  function pick(obj, keys) {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  /** "@shea1121" / "Shea1121" → có phải một tay cầm Twitter không? */
  function looksLikeHandle(s) {
    return /^@?[A-Za-z0-9_]{1,20}$/.test(s);
  }

  /**
   * Lùng NGƯỜI trong một JSON bất kỳ của GMGN.
   *
   * Vì sao cần: `community/messages` (bảng X Tracker dưới chart) KHÔNG phải
   * nguồn của mấy avatar mọc trên cây nến — người dùng đã khẳng định hai đám
   * đó khác nhau. Mà mốc trên chart thì vẽ bằng canvas, không để lại DOM nào
   * để hover. Nên đường duy nhất còn lại là nghe TẤT CẢ API của trang rồi tự
   * nhận ra chỗ nào đang nói về người.
   *
   * Cố ý KHÔNG đoán trước hình dạng: đi khắp cây JSON, thấy object nào có một
   * tay cầm Twitter đọc được thì nhặt. Thà nhặt dư rồi lọc còn hơn bỏ sót
   * đúng cái endpoint mình chưa biết tên.
   *
   * Chặn nhầm token: token cũng có `name`/`address`/`logo`, nhưng không có
   * tay cầm — nên khoá bắt buộc là HANDLE_KEYS, và giá trị phải đúng dạng.
   */
  function scanPeople(payload, limit) {
    const max = limit || 300;
    const out = [];
    const seen = Object.create(null);
    let budget = 20000;

    function visit(node, depth) {
      if (budget <= 0 || out.length >= max || depth > 8 || !node || typeof node !== "object") return;
      budget--;
      if (Array.isArray(node)) {
        for (const item of node) visit(item, depth + 1);
        return;
      }
      const handle = pick(node, HANDLE_KEYS).replace(/^@/, "");
      if (handle && looksLikeHandle(handle)) {
        const key = KT.handleKey(handle);
        if (key && !seen[key]) {
          seen[key] = true;
          out.push({
            username: handle,
            displayName: pick(node, NAME_KEYS),
            avatar: pick(node, AVATAR_KEYS),
            wallet: KT.walletKey(pick(node, WALLET_KEYS)) || "",
            xId: pickId(node),
          });
        }
      }
      for (const k in node) {
        const v = node[k];
        if (v && typeof v === "object") visit(v, depth + 1);
      }
    }

    visit(payload && payload.data !== undefined ? payload.data : payload, 0);
    return out;
  }

  /**
   * Hình dạng gọn của một JSON lạ: tên cột ở vài tầng đầu.
   *
   * Dùng khi `scanPeople` về tay không. "Không nhặt ra ai" có hai nghĩa rất
   * khác nhau — trong đó không có người, hay có người mà tên cột lạ nên mình
   * không nhận ra — và không nhìn hình dạng thì hai cái đó y hệt nhau.
   * Chỉ lấy TÊN cột, không lấy giá trị: giá trị là nội dung post của người ta.
   */
  function shapeOf(payload, depth) {
    const d = depth || 0;
    if (d > 3 || !payload || typeof payload !== "object") return null;
    if (Array.isArray(payload)) {
      return payload.length ? ["[" + payload.length + "]", shapeOf(payload[0], d + 1)] : ["[0]"];
    }
    const keys = Object.keys(payload).slice(0, 25);
    if (d >= 2) return keys;
    const out = {};
    for (const k of keys) {
      const v = payload[k];
      out[k] = v && typeof v === "object" ? shapeOf(v, d + 1) : typeof v;
    }
    return out;
  }

  /**
   * `/pf/api/v1/fomo/thesis/token` — NGUỒN THẬT của mấy mốc trên chart.
   *
   * Mười bốn vòng đi tìm, và nó nằm ngay đây từ đầu; `scanPeople` không nhặt
   * ra vì tên cột là `author_handle` chứ không phải `username` — đúng cái bẫy
   * "đoán tên cột rồi lấy kết quả rỗng làm bằng chứng".
   *
   * Nó cho đủ thứ mà đường hover không bao giờ có:
   *   author_id        ← KHOÁ KHÔNG ĐỔI ĐƯỢC, thứ đi tìm suốt mấy vòng
   *   fomo_created_at  ← mốc call CHÍNH XÁC, không phải "6h" làm tròn
   *   thesis           ← nguyên văn luận điểm
   *   holdings_usd / author_trade_usd / realized_pnl_usd / unrealized_pnl_usd
   *
   * ⚠ Đây là feed NHIỀU TOKEN: mỗi dòng mang `token_address` riêng. Không lọc
   * theo token đang mở là panel liệt kê người của token khác.
   */
  /**
   * Mốc thời gian của feed thesis có thể là chuỗi ISO, mà cũng có thể là số
   * epoch. `parseDateLoose` không đọc được số epoch (nó dựng cho chuỗi ngày
   * người đọc), nên đưa thẳng vào là ra null — mốc call biến mất mà không có
   * lỗi nào.
   */
  function tsFrom(value) {
    if (value === null || value === undefined || value === "") return null;
    const s = String(value).trim();
    if (/^\d{9,16}$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      // Dưới 1e12 là GIÂY (1e12 mili ≈ năm 2001, không ai gửi mốc cũ hơn thế)
      return n < 1e12 ? n * 1000 : n;
    }
    return KT.parseDateLoose(s);
  }

  /**
   * Giá trị THÔ của mấy cột quyết định, để soi khi parse ra rỗng.
   * Đoán kiểu dữ liệu rồi thấy kết quả rỗng là đúng cái bẫy đã dính hai lần.
   */
  function thesisSample(payload) {
    const data = (payload && payload.data) || payload;
    const items = (data && data.items) || (Array.isArray(data) ? data : null);
    const first = Array.isArray(items) ? items[0] : null;
    if (!first || typeof first !== "object") return null;
    const show = (k) => k + "=" + JSON.stringify(first[k]) + " (" + typeof first[k] + ")";
    return [show("author_id"), show("fomo_created_at"), show("id"), show("closed_at")];
  }

  function parseThesis(payload) {
    const data = (payload && payload.data) || payload;
    const items = (data && data.items) || (Array.isArray(data) ? data : null);
    if (!Array.isArray(items)) return [];

    const out = [];
    const seen = Object.create(null);
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const handle = String(raw.author_handle || "").trim().replace(/^@/, "");
      const xId = String(raw.author_id == null ? "" : raw.author_id).trim();
      if (!handle && !xId) continue;

      const key = (xId || KT.handleKey(handle)) + "|" + String(raw.id || "");
      if (seen[key]) continue;
      seen[key] = true;

      const holdings = num(raw.holdings_usd);
      const traded = num(raw.author_trade_usd);
      const realized = num(raw.realized_pnl_usd);
      const unrealized = num(raw.unrealized_pnl_usd);

      out.push({
        // `xId` CHỈ nhận dãy số — đó mới là id tài khoản X. `authorId` giữ
        // nguyên văn dù nó là dạng gì: chưa biết GMGN đánh số kiểu nào thì
        // đừng vứt, mà cũng đừng vội gọi nó là id của X.
        xId: /^[0-9]{5,25}$/.test(xId) ? xId : "",
        authorId: xId,
        username: handle,
        displayName: String(raw.author_name || "").trim(),
        avatar: String(raw.author_avatar_url || "").trim(),
        // Có id thì dùng dạng link theo id: nó đổi tên link vẫn sống.
        twitterUrl: xId ? "https://x.com/i/user/" + xId : handle ? "https://x.com/" + handle : "",
        wallet: "", // feed này không kèm ví

        postId: String(raw.id == null ? "" : raw.id),
        postText: String(raw.thesis || "").trim(),
        postedAt: String(raw.fomo_created_at == null ? "" : raw.fomo_created_at).trim(),
        postedTs: tsFrom(raw.fomo_created_at),
        likes: num(raw.like_count),

        tokenAddress: KT.walletKey(raw.token_address) || "",
        chain: String(raw.chain || "").trim(),
        tokenSymbol: String(raw.token_symbol || "").trim(),

        holdingUsd: holdings,
        tradeUsd: traded,
        pnlUsd: realized == null && unrealized == null ? null : (realized || 0) + (unrealized || 0),
        isDev: raw.author_is_dev === true,

        // ⚠ CHỈ kết luận khi có đủ SỐ. Thiếu dữ liệu mà đoán là gắn cờ đỏ oan
        // cho người ta — "không biết" và "không mua" là hai chuyện khác nhau.
        holding: holdingFromUsd(holdings, traded),
        holdingLabel: HOLDING_LABELS[holdingFromUsd(holdings, traded)] || "",
        isHoldingRedFlag: HOLDING_RED_FLAGS.indexOf(holdingFromUsd(holdings, traded)) !== -1,
        source: "thesis",
        tuChart: true,
      });
    }
    return out;
  }

  function holdingFromUsd(holdings, traded) {
    if (holdings == null && traded == null) return "unknown";
    if ((traded || 0) <= 0 && (holdings || 0) <= 0) return "no_buy";
    if ((holdings || 0) > 0) return "holding";
    return "sold_all";
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
    groupCallers,
    parseEndpoint,
    apiPath,
    parseThesis,
    thesisSample,
    tsFrom,
    scanPeople,
    shapeOf,
    xIdFrom: pickId,
    HOLDING_LABELS,
    HOLDING_RED_FLAGS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = KT.gmgn;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
