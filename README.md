# KOL Tracker

Chrome extension tra cứu "tướng tá" (KOL/caller crypto) **ngay trên trang GMGN**: gõ hoặc bôi đen một
handle là ra tier, mô tả, cờ đỏ và track record — không phải chuyển tab sang Notion/Sheet để tra.

Dữ liệu nằm ở **một Google Sheet 2 tab**, extension chỉ ĐỌC (qua CSV publish-to-web). Không có server,
không có database, không có lớp sync nào để hỏng im lặng. Hai người cùng nhập liệu thẳng trên Sheet,
quyền ngang nhau — Sheet tự lo version history và sửa đồng thời.

---

## 1. Cài đặt

```bash
git clone git@github.com:Atheist1507/kol-tracker-extension.git
```

Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục vừa clone.

Không có bước build, không có `npm install`. Sửa code xong bấm ⟳ ở thẻ extension là xong.

## 2. Dựng Google Sheet

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

> ⚠ Link publish-to-web thì **ai có link cũng đọc được** (không cần đăng nhập, nhưng Google không đưa
> nó lên kết quả tìm kiếm). Dữ liệu KOL không nhạy cảm nên chấp nhận được. Cần chặt hơn thì đổi sang
> Google Sheets API v4 + API key read-only — chỉ phải thay hàm fetch trong `background/service-worker.js`,
> phần còn lại giữ nguyên.

## 3. Dùng

| Thao tác | Kết quả |
|---|---|
| **Alt+K** trên trang GMGN | Bật/tắt panel. Đang bôi đen một cái tên thì tra luôn cái đó. |
| Gõ vào ô tìm kiếm | Tìm theo handle, alias, chữ trong mô tả, **hoặc theo token** ("ai đã call con này"). |
| ↑ ↓ + Enter | Chọn kết quả bằng bàn phím. |
| Kéo thanh tiêu đề | Đổi chỗ panel, vị trí được nhớ lại. |
| Bấm icon extension | Popup — cùng chức năng tra cứu, dùng được ở MỌI trang (Twitter, Telegram Web…). |
| Nút **Panel** trong popup | Chèn panel vào tab hiện tại kể cả tab đó không phải GMGN. |

Dữ liệu tự làm tươi khi mở GMGN (nếu bản cache cũ hơn 10 phút) và theo chu kỳ 30 phút — chỉnh được
trong Options. Nút ⟳ luôn tải lại ngay lập tức.

### Win rate tính thế nào

- Ô `result` **có số** (`x5`, `+300%`) → số quyết định: `≥ x2` thắng, `< x1` thua, ở giữa là huề.
- **Không có số** → đọc từ khoá (`đúng`/`sai`/`rug`/`thắng`/`lãi`…).
- Không đọc được → *chưa rõ*, **không tính vào mẫu số** của win rate.
- Ngưỡng `x2` và ngưỡng "bao nhiêu case mới đáng tin" chỉnh trong Options.

## 4. Overlay trên chart (Mức 2)

Mục tiêu cuối của spec: avatar nào có trong database thì **tự có viền màu theo tier ngay trên chart**,
hover là hiện note. Có chạy được hay không phụ thuộc GMGN vẽ marker bằng gì, nên extension làm sẵn
**cả hai đường** và đường nào bắt được thì đường đó chạy:

1. **Avatar là `<img>` thật** → so khớp `avatar_url` với ảnh trên trang, vẽ vòng màu tier quanh nó
   (kèm chữ cái tier ở góc). Viền đứt nét = người này có cờ đỏ.
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
manifest.json              MV3. content_scripts chạy trên gmgn.ai + gmgn.cc
background/service-worker.js  CHỖ DUY NHẤT fetch CSV (content script gọi docs.google.com là dính CORS),
                              cache vào chrome.storage.local, chạy alarm làm tươi định kỳ
content/content.js         Điều phối: nạp storage → dựng db → gắn panel + overlay, phím tắt, tin nhắn
content/panel.js           Mức 1 — panel nổi (shadow DOM, kéo thả, tìm kiếm, thẻ chi tiết)
content/overlay.js         Mức 2 — viền tier quanh avatar + thẻ hover + hàm chẩn đoán canvas/DOM
popup/                     Bản rút gọn của panel, dùng được ở mọi trang
options/                   Cấu hình: 2 link CSV, ngưỡng win rate, bật/tắt overlay
src/lib/                   Logic THUẦN, không đụng DOM hay chrome.* (trừ config.js):
  normalize.js               bỏ dấu, quy handle/token/URL avatar về khoá so khớp
  csv.js                     parser CSV (RFC 4180) + map tên cột Việt/Anh → khoá chuẩn
  tier.js                    S/A/B/C → chữ cái + màu
  stats.js                   đọc "x5"/"đu đỉnh"/"+300%" → win rate, timing, mốc thời gian
  model.js                   dựng db trong bộ nhớ + tìm kiếm có xếp hạng
  tooltip-text.js            mẩu chữ trong tooltip → ứng viên handle (chủ thẻ vs tên bị nhắc tới)
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
npm test         # 68 test logic thuần, không cần cài gì
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
