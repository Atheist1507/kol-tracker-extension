# KOL Tracker

Chrome extension để research "tướng tá" (KOL/caller crypto) **ngay trên trang GMGN**.

Mở một chart, panel liệt kê luôn **mọi người đã post về token đó**, ai mình đã có hồ sơ, ai có cờ đỏ.
Hover một người → thẻ tóm tắt. Bấm **N** → hộp ghi chú mở ra với mọi thứ đã điền sẵn, gõ nhận xét rồi
`⌘Enter` là ghi thẳng vào Google Sheet.

Dữ liệu nằm ở **một Google Sheet 2 tab**, nối qua một Apps Script sống trong chính file đó. Không có
server, không có database. Hai người quyền ngang nhau — Sheet tự lo version history và sửa đồng thời.

**Thứ extension tự điền, mày không phải gõ:** ví, username, tên hiển thị, avatar, link X, nội dung
post, thời điểm post, x mấy kể từ lúc post, và — quan trọng nhất — người đó **có thật sự mua không,
hay hô xong xả sạch**. Tất cả lấy thẳng từ API của GMGN.

Mày chỉ gõ phần máy không biết: nhận xét, và xếp hạng.

---

## 1. Cài đặt

```bash
git clone git@github.com:Atheist1507/kol-tracker-extension.git
```

Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục vừa clone.

Chạy ở hai nơi: **GMGN** (panel + hover chart + phím `N`) và **X/Twitter**
(nút Ghi chú trên trang hồ sơ + dải hạng/ghi chú dưới phần bio).

Không có bước build, không có `npm install`.

### Lấy bản mới

```bash
git pull
```

rồi bấm **⟳** ở thẻ extension trong `chrome://extensions`, rồi **F5 lại trang GMGN**.

⚠ Thiếu bước F5 là hỏng theo kiểu khó đoán: bấm ⟳ **cắt** bản cũ trong mọi tab
đang mở khỏi extension ngay lập tức — tab đó không trả lời ai nữa, trông y hệt
"extension hỏng". Phải F5 tab đó mới nạp bản mới.

⚠ **Hai nút ⟳ khác nhau.** Nút ⟳ trong popup của extension chỉ **tải lại dữ
liệu từ Sheet** (bấm khi vừa sửa hạng/ghi chú trên Sheet). Nút ⟳ ở
`chrome://extensions` mới là **nạp lại code**.

### Dùng chung với người khác

Hai người dùng **chung một Sheet**: người thứ hai cài y như trên, rồi trong
Cài đặt dán **đúng URL Web App và SECRET** của người thứ nhất — **không**
deploy Apps Script riêng. Mỗi người chỉ khác ô **Tên của bạn** (cột
`added_by`), để Sheet biết ghi chú nào của ai.

Trang Cài đặt có nút **Copy lời mời cài đặt** soạn sẵn các bước trên.

⚠ `SECRET` là **mật khẩu ghi** vào Sheet — gửi bằng tin nhắn riêng, đừng dán
vào nhóm chat. Nút copy lời mời cố ý **không** kèm secret vì lời mời thì hay
bị dán vào chat và nằm lại đó vĩnh viễn.

## 2. Dựng Google Sheet

Extension nói chuyện với Sheet qua **Apps Script Web App** — một đoạn script sống trong chính file
Sheet đó, không cần Google Cloud, không cần OAuth. Nó vừa cho extension **đọc**, vừa cho **ghi**
(gõ ghi chú xong bấm lưu là vào thẳng Sheet).

**Các bước deploy: xem [`apps-script/README.md`](apps-script/README.md).** Chạy hàm `setup()` một
lần là script tự dựng 2 tab đúng cột, khỏi gõ tay tiêu đề.

Phần đó làm được **trước khi** cài extension, và tự kiểm được bằng cách dán
`<URL_WEB_APP>?action=ping&secret=<SECRET>` vào thanh địa chỉ — thấy JSON `"ok":true` là xong.

| Tab | Một dòng là gì | Khoá |
|---|---|---|
| `Overview` | một người | `wallet` — ví thì không đổi tên được, username thì có |
| `Detail` | một lần ghi chú | `wallet` nối sang Overview |

Cột mày **gõ tay** chỉ có `note` (bên Detail) và `tier` / `summary` / `red_flags` (bên Overview).
Tất cả phần còn lại — username, tên hiển thị, avatar, link X, nội dung post, giờ post, x mấy, còn
giữ hay đã xả — extension lấy thẳng từ API của GMGN và tự điền.

<details>
<summary>Đường cũ: CSV publish-to-web (chỉ đọc, không cần Apps Script)</summary>



Tạo một Sheet với **2 tab**, dòng đầu mỗi tab là tên cột (copy nguyên dòng dưới, hoặc import file trong
`sheet-templates/`):

**Tab `KOLs`**

```
handle,aliases,avatar_url,tier,description,source_found,red_flags,added_by,updated_at
```

| Cột | Ý nghĩa |
|---|---|
| `handle` | Tên/handle chính — **khoá nối với tab Calls**. Ghi `@foo`, `foo` hay dán cả link `x.com/foo` đều được. |
| `aliases` | Các tên khác hay dùng, ngăn bằng dấu phẩy. Tra bằng alias cũng ra đúng người. |
| `avatar_url` | Ảnh đại diện. Quan trọng nhất cho phần overlay: khớp ảnh này với avatar trên chart. |
| `tier` | `S`/`A`/`B`/`C`/`D`/`F`. Viết `S+`, `Hạng A`, `Tier B` cũng hiểu. |
| `description` | Đặc trưng ngắn: "hay call presale kỹ thuật". |
| `source_found` | Phát hiện ra người này từ đâu. |
| `red_flags` | Cờ đỏ: xả ngay sau call, lịch sử rug, dấu hiệu được trả tiền pump… Có giá trị là thẻ hiện khung đỏ. |
| `added_by`, `updated_at` | Ai thêm, cập nhật lúc nào. |

**Tab `Calls`**

```
handle,token,called_at,price_at_call,chart_position,result,added_by
```

| Cột | Ý nghĩa |
|---|---|
| `handle` | Nối với tab `KOLs`. Handle chưa có hồ sơ vẫn tra được, chỉ bị đánh dấu "chưa có hồ sơ". |
| `token` | Token được call. `$PEPE` hay `pepe` đều gộp làm một. |
| `called_at` | `2026-01-02` hoặc `02/01/2026` (ngày trước tháng, kiểu Việt). |
| `price_at_call` | Giá/mcap lúc call. |
| `chart_position` | Call ở đoạn nào của sóng: `đầu sóng` / `giữa sóng` / `đu đỉnh`. |
| `result` | Kết quả: `x5`, `5x`, `+300%`, `-70%`, hoặc chữ (`đúng`, `sai`, `rug`). |

> **Log cả case sai**, không chỉ case thắng — nếu không win rate là con số tự lừa mình.
> Dưới 5 case thì extension vẫn hiện win rate nhưng kèm cảnh báo "chưa đủ mẫu".

Tên cột tiếng Việt cũng nhận (`Hạng` = `tier`, `Cờ đỏ` = `red_flags`, `Kết quả` = `result`…).
Cột nào extension không hiểu thì **không bị vứt đi** — vẫn hiện ở cuối thẻ chi tiết.

### Publish CSV

Với **từng tab**: `File → Share → Publish to web` → chọn tab đó → định dạng
**Comma-separated values (.csv)** → **Publish** → copy link.

Mở Options của extension (icon → *Options*), dán 2 link vào, bấm **Thử link** để xem nó đọc được bao
nhiêu dòng và nhận ra những cột nào.

> Dán nhầm link `/edit` cũng không sao — extension tự đổi sang link export CSV, nhưng lúc đó Sheet
> phải đang bật chia sẻ *"Anyone with the link"*.

</details>

> ⚠ Link publish-to-web thì **ai có link cũng đọc được** (không cần đăng nhập, nhưng Google không đưa
> nó lên kết quả tìm kiếm). Dữ liệu KOL không nhạy cảm nên chấp nhận được. Cần chặt hơn thì đổi sang
> Google Sheets API v4 + API key read-only — chỉ phải thay hàm fetch trong `background/service-worker.js`,
> phần còn lại giữ nguyên.

## 3. Dùng

| Thao tác | Kết quả |
|---|---|
| Mở một chart trên GMGN | Panel tự liệt kê mọi người đã post về token đó, kèm x hiện tại và trạng thái nắm giữ |
| **Hover** một avatar | Thẻ tóm tắt: hạng, ghi chú cũ, cờ đỏ, "đã xả sạch"/"còn giữ" |
| **N** | Mở hộp ghi chú cho người đang hover. `⌘Enter` lưu · `Esc` huỷ |
| **Alt+K** | Bật/tắt panel. Đang bôi đen một cái tên thì tra luôn cái đó |
| Gõ vào ô tìm kiếm | Tìm theo username, **ví**, hoặc chữ trong ghi chú |
| ↑ ↓ + Enter | Chọn kết quả bằng bàn phím |
| Kéo thanh tiêu đề | Đổi chỗ panel, vị trí được nhớ lại |
| Bấm icon extension | Popup — tra cứu ở MỌI trang (Twitter, Telegram Web…) |

Phím **N** cố tình không kèm Alt (gõ cho nhanh), nên nó tự né mọi ô nhập của GMGN — đang gõ trong ô
tìm kiếm của họ thì chữ "n" vẫn là chữ "n".

Dữ liệu tự làm tươi khi mở GMGN (nếu bản cache cũ hơn 10 phút) và theo chu kỳ 30 phút — chỉnh được
trong Options. Nút ⟳ luôn tải lại ngay lập tức.

### Cờ đỏ tự tính

GMGN trả về số liệu mua/bán của chính người đó với chính token đó. Từ đó suy ra:

| Điều kiện | Nhãn | Cờ đỏ? |
|---|---|---|
| `bought = 0` | **hô mà không mua** | ✕ đỏ |
| bán hết, còn ~0 | đã xả sạch | |
| bán rồi nhưng còn giữ | đã xả một phần | |
| chưa bán | còn giữ | (xanh — còn tiền trong đó) |

⚠ **Chỉ `hô mà không mua` là cờ đỏ.** Bản đầu tính cả "đã xả sạch" và chỉ lộ ra khi chạy trên dữ
liệu thật: một token bình thường cho **46/50 người** dính cờ đỏ, vì gần như ai post từ một tháng
trước thì giờ cũng đã bán xong — kết cục bình thường, không phải dấu hiệu xấu. Cờ đỏ mà 92% dính
thì không phân loại được gì.

Spec viết *"xả **ngay** sau khi gọi"*, mấu chốt ở chữ **ngay** — mà API chỉ cho biết **bây giờ** còn
giữ hay không, không cho biết bán lúc nào. Suy ra "bán nhanh" từ "hiện không còn giữ" là suy bừa.
`no_buy` thì bẩn bất kể thời gian: mồm hô, tiền không bỏ.

Còn vài đồng bụi sau khi bán vẫn tính là **xả sạch** — đòi đúng `balance = 0` là xếp nhầm sang "còn
giữ". Thiếu hẳn mấy cột số thì là *"không biết"*, **không** quy về 0.

## 4. Overlay trên chart (Mức 2)

Mục tiêu cuối của spec: avatar nào có trong database thì **tự có viền màu theo tier ngay trên chart**,
hover là hiện note. Có chạy được hay không phụ thuộc GMGN vẽ marker bằng gì, nên extension làm sẵn
**cả hai đường** và đường nào bắt được thì đường đó chạy:

1. **Avatar là `<img>` thật** → so URL ảnh với `profile_image_url` mà chính API GMGN đưa ra, vẽ vòng
   màu tier quanh nó (kèm chữ cái tier ở góc). Viền đứt nét = người này có cờ đỏ.
   Vì danh tính đến từ API chứ không phải đoán, phép so này chính xác tuyệt đối.
2. **Chart vẽ bằng canvas** (nhiều khả năng, kiểu TradingView) → không có element để bám. Đường vòng:
   rình cái tooltip mà GMGN tự hiện khi hover vào avatar, đọc handle trong đó, dán thẻ tóm tắt cạnh bên.

Tooltip của GMGN in **tên hiển thị**, một nhãn, **`@handle`** và nội dung post — mỗi thứ một element.
Extension đọc theo **từng text node**, không đọc `node.textContent`: `textContent` nối hết chữ lại
không có dấu cách (`"nolifeloserThesis2d@nolifeloserAhaa Only up…"`) và regex `@handle` sẽ nuốt luôn
chữ bên cạnh. Có test khoá lại ca này trong `tests/tooltip-text.test.js`.

Tên hiển thị thường **khác** handle. Muốn hover ra thẻ cả khi tooltip chưa kịp hiện dòng `@`, thì bỏ
tên hiển thị vào cột `aliases`.

**Bắt người lạ**: tooltip nào có `@handle` chưa có trong Sheet thì extension nhớ lại (kèm URL avatar
lấy ngay trong tooltip đó). Mở panel với ô tìm kiếm trống → mục **"Vừa thấy trên chart · chưa có trong
DB"**. Bấm một dòng là copy sẵn **một dòng ngăn bằng Tab**, dán vào ô cột A của tab `KOLs` là tự rải
đúng cột (handle, avatar_url, source_found, updated_at). Đó là nửa còn lại của vòng làm việc: thấy
người lạ trên chart → có hồ sơ, khỏi gõ tay lại cái tên vừa nhìn thấy.

**Xác định trang GMGN thuộc ca nào**: mở chart, hover vào vùng avatar, bấm icon extension → **Chẩn đoán**.
Nó đếm canvas/ảnh trên trang, in ra vài URL ảnh mẫu, **hình dạng tooltip gặp gần nhất** (`lastTooltip`:
tag, class, từng mẩu chữ, URL ảnh trong đó, khớp được ai không), và copy toàn bộ vào clipboard. Hoặc
mở DevTools Console trên trang và gõ `__KT.diagnose()`.

Mọi thứ extension vẽ đều nằm trong shadow root riêng, `position: fixed`, `pointer-events: none` —
**không sửa một node nào trong DOM của GMGN**. Chèn node vào giữa cây của một SPA là cách nhanh nhất
để hoặc bị React ghi đè, hoặc làm vỡ trang của người ta.

Tắt riêng từng phần (viền / thẻ hover) trong Options.

## 5. Cấu trúc code

```
manifest.json              MV3. content_scripts chạy trên gmgn.ai + gmgn.cc, TRONG MỌI FRAME
                           (all_frames + match_origin_as_fallback: GMGN có iframe blob:, chart có
                           thể nằm trong đó). Panel chỉ mount ở frame trên cùng, overlay thì frame
                           nào cũng chạy
background/service-worker.js  CHỖ DUY NHẤT fetch CSV (content script gọi docs.google.com là dính CORS),
                              cache vào chrome.storage.local, chạy alarm làm tươi định kỳ
content/main-world.js      Chạy CÙNG thế giới JS với GMGN (world: MAIN): bọc fetch/XHR để nghe
                           response của API community/messages, postMessage sang thế giới cách ly.
                           CHỈ ĐỌC, không sửa gì của trang
content/content.js         Điều phối: ghép người-trên-chart (API) với hồ sơ (Sheet), phím tắt, tin nhắn
content/note-box.js        Hộp ghi chú — phím N, điền sẵn tất cả, ⌘Enter ghi vào Sheet
content/panel.js           Mức 1 — panel nổi (shadow DOM, kéo thả, tìm kiếm, thẻ chi tiết)
content/overlay.js         Mức 2 — viền tier quanh avatar + thẻ hover + hàm chẩn đoán canvas/DOM
popup/                     Bản rút gọn của panel, dùng được ở mọi trang
options/                   Cấu hình: 2 link CSV, ngưỡng win rate, bật/tắt overlay
apps-script/Code.gs        Sống TRONG file Sheet: doGet trả JSON cho extension đọc, doPost nhận
                           một lần ghi chú → thêm dòng Detail + tạo/cập nhật dòng Overview
src/lib/                   Logic THUẦN, không đụng DOM hay chrome.* (trừ config.js):
  normalize.js               bỏ dấu, quy handle/token/URL avatar về khoá so khớp
  csv.js                     parser CSV (RFC 4180) + map tên cột Việt/Anh → khoá chuẩn
  tier.js                    S/A/B/C → chữ cái + màu
  stats.js                   đọc "x5"/"đu đỉnh"/"+300%" → win rate, timing, mốc thời gian
  model.js                   dựng db người/ghi chú trong bộ nhớ (khoá là VÍ) + tìm kiếm + dò đổi tên
  tooltip-text.js            mẩu chữ trong tooltip → ứng viên handle (chủ thẻ vs tên bị nhắc tới)
  gmgn.js                    đọc API community/messages của GMGN: danh tính, nội dung post, x mấy,
                             và "mua thật hay hô xong xả sạch"
  sheet-url.js               link Sheet kiểu gì cũng ra được link CSV
  render.js                  dựng HTML dùng CHUNG cho panel và popup
  styles.js                  CSS dạng chuỗi (shadow DOM phải nhét style bằng JS)
  config.js                  giá trị mặc định, khoá storage, danh sách content script
tests/                     node --test, không dependency
scripts/gen-icons.mjs      sinh icon PNG (tự encode PNG bằng zlib, không thêm thư viện)
scripts/check.mjs          kiểm manifest ↔ file thật ↔ danh sách content script ↔ cú pháp
```

**Vì sao không dùng ES module ở đâu cả**: `content_scripts` của Chrome không nạp được module. Mọi file
trong `src/lib/` là script thường gắn vào `globalThis.KT`, và cùng lúc export kiểu CommonJS ở cuối file
để `node --test` chạy được. Đổi sang module là phải thêm bundler, tức là thêm bước build.

## 6. Phát triển

```bash
npm test         # 94 test logic thuần, không cần cài gì
npm run check    # manifest trỏ đúng file? danh sách content script có lệch không? cú pháp ổn chưa?
npm run icons    # sinh lại icons/icon-*.png
```

Cả hai lệnh trên chạy trong CI (`.github/workflows/ci.yml`) ở mọi PR và mọi push vào `main`.

**Sửa giao diện thì mở `dev/preview.html`** (`npx http-server -p 8099 .` rồi vào
`http://127.0.0.1:8099/dev/preview.html`): một trang thường với `chrome.*` giả và dữ liệu giả, nhưng
panel + overlay là code THẬT trong `content/`. Soi CSS và bố cục ở đó, khỏi phải dựng Sheet rồi reload
extension sau mỗi lần sửa một dòng. Thư mục `dev/` không nằm trong `manifest.json`.

Thêm cột mới vào Sheet → khai ở `COLUMN_ALIASES` trong `src/lib/csv.js` (không khai thì vẫn hiện, chỉ
là nằm trong `extra`). Thêm file content script mới → sửa **cả** `manifest.json` **và** `KT.CONTENT_FILES`
trong `src/lib/config.js`; quên một chỗ thì `npm run check` báo đỏ.

## 7. Chưa làm

- Chưa publish lên Chrome Web Store (spec nói không cần — share qua repo + "Load unpacked").
- Overlay Mức 2 mới có khung sẵn cho cả hai ca. Đường tooltip đã dựng theo đúng cấu trúc quan sát được
  trên GMGN (17/09/2026) và có test, nhưng **chưa chạy trên trang thật lần nào** — phải chạy
  **Chẩn đoán** rồi mới biết còn phải siết chỗ nào (xem mục 4).
