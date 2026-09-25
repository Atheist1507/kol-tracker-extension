/**
 * Dựng "database người" trong bộ nhớ từ 2 tab Overview/Detail, và tra cứu.
 *
 * Khoá là **`wallet`** chứ không phải username: username đổi được, ví thì
 * không. Người chỉ có username (nhập tay, hoặc Sheet cũ) vẫn tra được — tra
 * theo ví trước, trượt mới tới username.
 */
(function (root) {
  "use strict";
  const KT = (root.KT = root.KT || {});

  function text(value) {
    return value == null ? "" : String(value).trim();
  }

  function walletKey(value) {
    return text(value).toLowerCase();
  }

  function num(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(String(value).replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function truthy(value) {
    const s = text(value).toLowerCase();
    return s === "true" || s === "1" || s === "x" || s === "có" || s === "yes";
  }

  function makePerson(row) {
    const username = KT.displayHandle(row.username);
    return {
      wallet: walletKey(row.wallet),
      username,
      usernameKey: KT.handleKey(username),
      displayName: text(row.display_name),
      twitterUrl: text(row.twitter_url),
      avatar: text(row.avatar_url),
      tier: text(row.tier),
      tierLetter: KT.tierLetter(row.tier),
      summary: text(row.summary),
      redFlags: text(row.red_flags),
      followers: num(row.followers),
      isKol: truthy(row.is_kol),
      firstSeen: text(row.first_seen),
      lastNoted: text(row.last_noted),
      addedBy: text(row.added_by),
      extra: row.extra || {},
      notes: [],
      row: row._row || null,
    };
  }

  function makeNote(row) {
    const notedAt = text(row.noted_at);
    const postedAt = text(row.posted_at);
    return {
      wallet: walletKey(row.wallet),
      username: KT.displayHandle(row.username),
      notedAt,
      notedTs: notedAt ? KT.parseDateLoose(notedAt) : null,
      chain: text(row.chain),
      token: text(row.token),
      tokenAddress: walletKey(row.token_address),
      postId: text(row.post_id),
      postText: text(row.post_text),
      postedAt,
      postedTs: postedAt ? KT.parseDateLoose(postedAt) : null,
      multiple: num(row.multiplier_at_note),
      holding: text(row.holding_state),
      pnlUsd: num(row.pnl_usd_at_note),
      note: text(row.note),
      position: KT.parsePosition(row.chart_position),
      positionRaw: text(row.chart_position),
      result: text(row.result),
      sourceUrl: text(row.source_url),
      addedBy: text(row.added_by),
      extra: row.extra || {},
      row: row._row || null,
    };
  }

  /**
   * Hồ sơ này có đang chứa ghi chú của HAI tài khoản X khác nhau không?
   *
   * Trước v0.15.1 khoá so khớp xoá dấu `_`, nên `foo_bar` và `foobar` rơi vào
   * CÙNG một dòng Sheet (khoá `x:foobar`). Không tách tự động được — không
   * biết ghi chú nào của ai ngoài cột username của từng dòng — nên chỉ BÁO.
   *
   * Hai tên khác hẳn nhau trong một hồ sơ là chuyện bình thường (người đó đổi
   * tên). Chỉ báo khi hai tên CHỈ khác nhau ở dấu `_` — đúng dấu vết của lỗi cũ.
   * Trả về các tên đó, rỗng = không sao.
   */
  function mergedNames(person) {
    const byLoose = Object.create(null);
    const names = [person.username].concat(person.notes.map((n) => n.username));
    for (const name of names) {
      const strict = KT.handleKey(name);
      if (!strict) continue;
      const loose = KT.looseHandleKey(name);
      const set = (byLoose[loose] = byLoose[loose] || {});
      if (!set[strict]) set[strict] = KT.displayHandle(name);
    }
    const out = [];
    for (const loose in byLoose) {
      const shown = Object.values(byLoose[loose]);
      if (shown.length > 1) out.push.apply(out, shown);
    }
    return out;
  }

  /**
   * overviewRows + detailRows → db tra cứu được.
   * Note của một ví CHƯA có dòng Overview vẫn giữ, dưới dạng hồ sơ tạm
   * (`ghost`) — mất dấu một người vì lỡ xoá dòng Overview thì đúng lúc cần
   * nhất lại không tra ra.
   */
  function buildDb(overviewRows, detailRows) {
    const people = [];
    const byWallet = Object.create(null);
    const byUsername = Object.create(null);
    const byToken = Object.create(null);
    // Bài call đã ghi → người đã ghi. Đây là CÂY CẦU nhận ra người đổi tên:
    // tên đổi được, ví đổi được, nhưng một bài call đã xảy ra thì không.
    const byPostId = Object.create(null);

    function index(person) {
      if (person.wallet && !byWallet[person.wallet]) byWallet[person.wallet] = person;
      if (person.usernameKey && !byUsername[person.usernameKey]) byUsername[person.usernameKey] = person;
    }

    for (const row of overviewRows || []) {
      const person = makePerson(row);
      if (!person.wallet && !person.usernameKey) continue;
      person.ghost = false;
      people.push(person);
      index(person);
    }

    let noteCount = 0;
    for (const row of detailRows || []) {
      const note = makeNote(row);
      if (!note.wallet && !note.username) continue;
      noteCount++;

      let person = (note.wallet && byWallet[note.wallet]) || byUsername[KT.handleKey(note.username)];
      if (!person) {
        person = makePerson({ wallet: note.wallet, username: note.username });
        person.ghost = true;
        people.push(person);
        index(person);
      }
      person.notes.push(note);

      if (note.postId && !byPostId[note.postId]) byPostId[note.postId] = { person, note };

      if (note.tokenAddress) {
        (byToken[note.tokenAddress] = byToken[note.tokenAddress] || []).push(note);
      }
    }

    for (const person of people) {
      // Note mới nhất lên đầu; chưa ghi ngày thì xuống cuối (đừng đoán hộ)
      person.notes.sort((a, b) => {
        if (a.notedTs == null && b.notedTs == null) return 0;
        if (a.notedTs == null) return 1;
        if (b.notedTs == null) return -1;
        return b.notedTs - a.notedTs;
      });
      person.noteCount = person.notes.length;
      person.mergedNames = mergedNames(person);
      person.searchText = KT.stripAccents(
        [person.username, person.displayName, person.summary, person.redFlags].join(" ")
      ).toLowerCase();
    }

    people.sort(
      (a, b) =>
        KT.tierRank(a.tier) - KT.tierRank(b.tier) ||
        b.noteCount - a.noteCount ||
        a.username.localeCompare(b.username)
    );

    return {
      people,
      byWallet,
      byUsername,
      byToken,
      byPostId,
      counts: {
        people: people.filter((p) => !p.ghost).length,
        notes: noteCount,
        merged: people.filter((p) => p.mergedNames.length).length,
      },
    };
  }

  /**
   * Tra một người. `ref` là { wallet, username } — thường lấy thẳng từ một
   * message của GMGN. Ví trước, username sau.
   */
  function findPerson(db, ref) {
    if (!db || !ref) return null;
    const wallet = walletKey(ref.wallet);
    if (wallet && db.byWallet[wallet]) return db.byWallet[wallet];
    const key = KT.handleKey(ref.username);
    if (key && db.byUsername[key]) return db.byUsername[key];
    // Đổi tên rồi thì tra bằng tên không ra. Bài call đã ghi thì vẫn ra —
    // và phải ra, nếu không mỗi lần nó đổi tên là Sheet đẻ thêm một hồ sơ
    // trắng, còn lịch sử cũ nằm lại ở cái tên không ai tra nữa.
    const post = ref.postId && db.byPostId && db.byPostId[ref.postId];
    return (post && post.person) || null;
  }

  /**
   * Người này có đổi username không? Tra ra bằng VÍ mà tên trong Sheet khác
   * tên đang hiện trên GMGN → đúng cái ca username đổi một phát là hồ sơ mồ
   * côi, nếu khoá bằng tên.
   */
  function renamedFrom(person, ref) {
    if (!person || !ref) return "";
    const now = KT.handleKey(ref.username);
    if (!now || !person.usernameKey || person.usernameKey === now) return "";
    if (!person.wallet || person.wallet !== walletKey(ref.wallet)) return "";
    return person.username;
  }

  /**
   * Ai trong đám đang hiện trên chart đã ĐỔI TÊN so với lúc mình ghi chú?
   *
   * Cách nhận: cùng một `post_id` — cùng đúng một bài call đã xảy ra — mà tên
   * tác giả bây giờ khác tên đã lưu. Bài call là việc ĐÃ RỒI, nó không sửa
   * được bằng cách đổi tên hay đổi ví, nên đây là cây cầu bền nhất mình có.
   *
   * ⚠ Cố ý KHÔNG neo vào `author_id`: nó là UUID v5, tức là BĂM ra từ một
   * chuỗi gốc mà mình không biết là gì. Băm từ handle thì nó đổi theo tên,
   * lúc đó neo vào nó là mất dấu đúng lúc cần nhất. Dùng post_id thì đúng
   * trong cả hai trường hợp.
   */
  function findRenames(db, list) {
    if (!db || !db.byPostId || !list) return [];
    const out = [];
    const seen = Object.create(null);
    for (const item of list) {
      const hit = item && item.postId && db.byPostId[item.postId];
      if (!hit) continue;
      const cu = KT.handleKey(hit.note.username || hit.person.username);
      const moi = KT.handleKey(item.username);
      if (!cu || !moi || cu === moi || seen[cu + ">" + moi]) continue;
      seen[cu + ">" + moi] = true;
      out.push({
        postId: item.postId,
        tenCu: hit.note.username || hit.person.username,
        tenMoi: item.username,
        person: hit.person,
        notedAt: hit.note.notedAt,
      });
    }
    return out;
  }

  /**
   * Bản anh em của `renamedFrom` cho người KHÔNG có ví.
   *
   * `renamedFrom` đòi ví trùng mới dám kết luận — đúng cho người trong bảng
   * X Tracker, nhưng người trên chart không có ví nên nó không bao giờ nói gì.
   * Ở đây bằng chứng là bài call đã ghi.
   */
  function renamedFromPost(db, person, ref) {
    if (!db || !db.byPostId || !person || !ref || !ref.postId) return "";
    const hit = db.byPostId[ref.postId];
    if (!hit || hit.person !== person) return "";
    const moi = KT.handleKey(ref.username);
    const cu = hit.note.username || person.username;
    if (!moi || !cu || KT.handleKey(cu) === moi) return "";
    return cu;
  }

  /** Tìm mờ trong danh sách người (panel + popup dùng chung). */
  function search(db, query, limit) {
    if (!db || !db.people.length) return [];
    const raw = text(query);
    if (!raw) return [];

    // Ô tìm kiếm thì DỄ DÃI (bỏ cả `_`): gõ "cryptoape" vẫn ra @crypto_ape.
    // Khớp CHÍNH XÁC xếp trên khớp dễ dãi.
    const key = KT.handleKey(raw);
    const loose = KT.looseHandleKey(raw);
    const plain = KT.stripAccents(raw).toLowerCase();
    const wallet = walletKey(raw);
    const out = [];

    for (const person of db.people) {
      let score = 0;
      let reason = "";

      if (wallet.length > 8 && person.wallet.includes(wallet)) {
        score = 130;
        reason = "ví";
      } else if (key && person.usernameKey === key) {
        score = 120;
      } else if (loose && KT.looseHandleKey(person.username) === loose) {
        score = 110;
      } else if (loose && KT.looseHandleKey(person.username).startsWith(loose)) {
        score = 90;
      } else if (loose && KT.looseHandleKey(person.username).includes(loose)) {
        score = 70;
      } else if (plain.length >= 2 && person.searchText.includes(plain)) {
        score = 40;
        reason = "khớp ghi chú";
      }

      if (score > 0) out.push({ person, score, reason });
    }

    out.sort(
      (a, b) =>
        b.score - a.score ||
        KT.tierRank(a.person.tier) - KT.tierRank(b.person.tier) ||
        b.person.noteCount - a.person.noteCount ||
        a.person.username.localeCompare(b.person.username)
    );
    return out.slice(0, limit || 8);
  }

  /**
   * Người đang hiện trên chart mà CHƯA có trong Sheet → dựng hồ sơ tạm để
   * panel vẫn mở ra được và bấm ghi chú được ngay. `ghost` = chưa có dòng nào
   * trong Sheet, đừng nhầm với người đã lưu.
   */
  function personFromCaller(caller) {
    const person = makePerson({
      wallet: caller.wallet,
      username: caller.username,
      display_name: caller.displayName,
      twitter_url: caller.twitterUrl,
      avatar_url: caller.avatar,
      followers: caller.followers == null ? "" : String(caller.followers),
      is_kol: caller.isKol ? "true" : "",
    });
    person.ghost = true;
    person.fresh = true; // hoàn toàn chưa có trong Sheet, khác với "thiếu dòng Overview"
    person.noteCount = 0;
    return person;
  }

  KT.personFromCaller = personFromCaller;
  KT.buildDb = buildDb;
  KT.findPerson = findPerson;
  KT.findRenames = findRenames;
  KT.renamedFromPost = renamedFromPost;
  KT.renamedFrom = renamedFrom;
  KT.search = search;
  KT.walletKey = walletKey;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildDb, findPerson, findRenames, renamedFrom, renamedFromPost, search, walletKey, personFromCaller };
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
