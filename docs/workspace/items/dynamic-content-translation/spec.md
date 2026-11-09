# Spec: dịch nội dung động EN–VI

- Phụ trách: chưa phân công; reviewer: chưa phân công (một dev khác, ngang quyền).
- Thiết kế: **draft**, cập nhật sau [review spike và finalization](../../../reviews/dynamic-content-translation-2026-10-15/README.md). Review: chưa có dev review. Kết quả review của AI không thay xác nhận của dev.
- Loại hạng mục: technical enabler gắn lát G5. **Chưa** đưa module, `env-schema`, migration hay route dịch vào product.
- **Stale — trùng số — chờ thẩm quyền (18/10/2026):** mã đề xuất "`QĐ-74`" và `QĐ-74a`–`i` trong hạng mục này là đề xuất cũ, **chưa** từng vào sổ quyết định. Sổ Docs nay dùng `QĐ-74` cho phương pháp thu thập usage (16/10/2026). Đọc mọi chỗ ghi `QĐ-74` ở đây là _đề xuất dịch EN↔VI chưa có số_; không cấp số mới, không coi là Accepted; evidence giữ nguyên. **E-2 = B, Owner 18/10/2026:** giữ `draft`, không giao implement, không cấp số mới trong repo BE; hạng mục bị chặn implement tới khi một quyết định Docs có thẩm quyền cấp số hợp lệ và giải quyết quan hệ với `QĐ-69`/`QĐ-78`. Research và evidence giữ nguyên ([remediation](../baseline-impact-and-remediation-2026-10-17/spec.md)).
- Nguồn:
  - Docs working tree, chưa pin snapshot: BRD v3.39 (6.4, 7.7.2 dòng 5, 7.7.5), US `US-05-02`, `US-05-04` (cờ ngoài bộ chuẩn ở AC-7).
  - BE ADR-0001, ADR-0002, ADR-0004, [API contract](../../../rules/api-contract.md).
  - Quyết định Owner trong prompt phiên 14/10/2026 (bảng dưới).
- Trạng thái yêu cầu:
  - **Chưa có trong BRD/US.** Đề xuất ghi `QĐ-74` cùng BRD/US/Logical ở [source-sync](source-sync.md).
  - `QĐ-71` đã dùng cho việc khác; mã đề xuất cũ đã bỏ.
- [Research](research.md) · [Plan](plan.md) · [Test plan](test-plan.md) · [Spike](spike/README.md).

## Vấn đề và phạm vi

Người đọc một hồ sơ có thể không đọc tốt ngôn ngữ người viết đã dùng. Họ cần một **bản dịch tham khảo** sang ngôn ngữ mình yêu cầu; bản gốc vẫn là căn cứ.

**Trong scope:**

- Dịch theo yêu cầu, từng trường, giữa `vi` và `en`, cho các trường trong allowlist.
- Dịch chạy cục bộ; không lưu bản dịch vào DB.
- Người viết khai báo mã ngôn ngữ gốc; hệ thống chỉ lưu mã đó.

**Ngoài scope:**

- Dịch tự động khi đọc.
- Dịch tên riêng, mã, số tiền, ngày, danh mục, Audit Trail, thông báo/email, lỗi/message, đầu ra AI.
- Lưu hay chỉnh tay bản dịch; ngôn ngữ khác `vi`/`en`; provider ngoài.

**Nhu cầu hiện tại:** chưa endpoint nào. G5 là lát đầu có trường do người viết và người khác đọc ([research](research.md#nhu-cầu-trong-code-và-nguồn)). Không mở Catalog/G3 hay code Request G5 để demo.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                                  | Kết luận                                                                                                | Nguồn / người                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| BRD/US không có yêu cầu dịch                                         | Thêm yêu cầu. Ghi sổ + BRD/US trước khi giao code (`QĐ-74` đề xuất)                                     | Owner, prompt phiên thiết kế 14/10/2026; chưa phải GVHD                             |
| Gửi Google/DeepL là chuyển dữ liệu cá nhân ra nước ngoài (BRD 7.7.5) | Dịch **cục bộ**; không lưu bản dịch vào DB                                                              | Như trên                                                                            |
| Tự động hay theo yêu cầu                                             | **Theo yêu cầu, từng trường**; đích theo `Accept-Language`                                              | Như trên                                                                            |
| Ngân sách                                                            | Trần cứng tài nguyên (độ dài, số tiến trình, hàng đợi, thời gian, tần suất); không phí theo ký tự       | Như trên                                                                            |
| Chất lượng sai tên/thuật ngữ                                         | **Bản dịch tham khảo + bảo vệ thuật ngữ**; chỉ bật sau cổng chất lượng                                  | Như trên                                                                            |
| Ngôn ngữ gốc                                                         | **Lưu mã ngôn ngữ gốc**; cách xác định đã làm rõ ở T-4 (người viết khai báo)                            | Như trên; chi tiết T-4 là đề xuất thiết kế                                          |
| Thiếu `Accept-Language` / không có ngôn ngữ hỗ trợ                   | **Mặc định `vi`**, không 406                                                                            | Owner, lượt kiểm lại review 14/10/2026                                              |
| Không dịch được                                                      | **Trả bản gốc**; nguồn null/rỗng/khoảng trắng giữ đúng giá trị, không gọi model                         | Như trên                                                                            |
| Dịch máy có phải "tính năng AI" theo BRD 6.4 / `QĐ-69a`?             | **Không**: tiện ích hiển thị, không sinh nội dung, không ra quyết định; không tính vào hai tính năng AI | Owner, prompt phiên khép spec 14/10/2026                                            |
| `q=0` từ chối tường minh                                             | `vi;q=0` mà `en` còn chấp nhận ⟹ `en`; từ chối cả hai ⟹ `vi` (RFC 9110 §12.4.1 cho phép bỏ qua header)  | Như trên                                                                            |
| Khai sai ngôn ngữ trên bản ghi không sửa được (`QĐ-53a`, `FR-11.2`)  | Người đọc chọn lại ngôn ngữ nguồn (`source=vi\|en`); không sửa bản ghi, không lưu gì                    | Như trên                                                                            |
| PARTIAL                                                              | Một segment không đạt ⟹ trả **bản gốc của cả trường**                                                   | Đề xuất thiết kế, khớp nghĩa đen quyết định "không dịch được ⟹ bản gốc"; dev review |
| Giá trị `mul` (nội dung hai ngôn ngữ)                                | **Mở** — Owner                                                                                          | Chưa có                                                                             |
| License mô hình (thẻ apache-2.0; dữ liệu huấn luyện CC-BY-NC-SA 4.0) | **Mở** — Owner/pháp lý, trước khi doanh nghiệp dùng thương mại                                          | [Research T-6](research.md#t-6--toàn-vẹn-offline-đóng-gói)                          |
| Ngưỡng chất lượng                                                    | **Mở** — Owner + dev chốt từ đề xuất T1–T8                                                              | [Research](research.md#chất-lượng)                                                  |

## Hành vi và thiết kế

### Allowlist trường

Registry đóng do module sở hữu resource khai báo. Mỗi mục gồm: tên trường, trường mã ngôn ngữ, độ dài tối đa, và quyền đọc dùng lại từ route chi tiết.

| Đợt                 | Trường (tên dự kiến, chốt ở Logical G5)                                                             | Nguồn                       | Người đọc                         |
| ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------- |
| Đầu (G5)            | Request — lý do nghiệp vụ (`businessJustification`)                                                 | `US-05-02`, `FR-3.2`        | Trưởng phòng, Người duyệt chi, IT |
| Đầu (G5)            | Request — lý do ngoài bộ chuẩn (`offStandardReason`)                                                | `US-05-02`, `US-05-04` AC-7 | Trưởng phòng                      |
| Đầu (G5)            | Bước duyệt nhu cầu — lý do quyết định (`decisionReason`)                                            | `US-05-04`                  | Người yêu cầu                     |
| Ứng viên, chờ Owner | Lý do thời hạn > 12 tháng; lý do duyệt chi (`US-06-01`); Keep/Reclaim/Exempt (EP-10); bàn giao (G6) | Theo lát                    | Theo lát                          |

### Ngôn ngữ gốc

- Mỗi trường trong allowlist có một trường mã đi kèm (ví dụ `businessJustificationLanguage`).
  - Người viết **khai báo**. Giao diện chỉ chọn sẵn theo ngôn ngữ UI và hiện bộ chọn cạnh ô nhập.
  - Ngôn ngữ UI không chứng minh ngôn ngữ nội dung.
- Ghi:
  - Nhận `vi` hoặc `en`; `mul` chỉ nhận nếu Owner duyệt.
  - Văn bản có nội dung mà thiếu mã ⟹ 422 `VALIDATION_ERROR`, `details` nêu trường thiếu.
  - Văn bản null/rỗng ⟹ mã null.
  - Server không ghi đè khai báo. FE có thể hiện gợi ý "nội dung có vẻ là tiếng Việt" trước khi gửi.
- Sửa văn bản: phải gửi lại mã cùng văn bản. Ở G5 các trường này không sửa được sau khi gửi (`US-05-02` khóa Request, `US-05-04` AC-9, `QĐ-53a`).
- Miền lưu `{vi, en, und}` (thêm `mul` nếu Owner duyệt). `und` chỉ dành cho dữ liệu seed/legacy; G5 tạo cột cùng bảng nên không có legacy. Chỉ lưu mã, **không** lưu bản dịch.
- Khai sai: người đọc gửi `source=vi|en` để dịch lại theo nguồn khác (Owner chốt). Không sửa bản ghi.
- **Không dùng heuristic để chọn nguồn.**
  - "can them 3 seat Figma cho du an" là tiếng Việt toàn ASCII, chứa từ tiếng Anh.
  - "Please add Nguyễn Văn An to the Figma team" là tiếng Anh nhưng có dấu.
  - Heuristic chỉ được dùng làm gợi ý trên FE.

### Accept-Language

Thuật toán đề xuất dựa trên RFC 9110 §12.4–12.5 và RFC 4647 §3.4. Policy `q=0` đã được Owner chốt; các giới hạn và bảng mã lý do chờ dev review.

1. Thiếu header ⟹ `vi` (`DEFAULT_NO_HEADER`).
2. Dài quá 512 ký tự ⟹ coi như thiếu (`DEFAULT_HEADER_TOO_LONG`). Rỗng hoặc chỉ khoảng trắng/dấu phẩy ⟹ `DEFAULT_EMPTY_HEADER`.
3. Tách theo `,`, bỏ phần tử rỗng. Hơn 20 phần tử ⟹ coi như thiếu (`DEFAULT_TOO_MANY_RANGES`).
4. Mỗi phần tử phải có dạng `range [OWS ";" OWS "q=" qvalue]`.
   - `range` theo RFC 4647 §2.1.
   - `qvalue` đúng grammar RFC 9110 (tối đa 3 chữ số thập phân, ≤ 1); `q` không phân biệt hoa thường.
   - Tham số khác hoặc `q` lặp ⟹ phần tử không hợp lệ và **chỉ phần tử đó** bị bỏ.
5. Lấy primary subtag viết thường: `vi`, `en`, `*` hoặc ngôn ngữ khác.
6. Trọng số của `vi` và `en`:
   - `L;q=0` trần (không có vùng) phủ quyết L.
   - Nếu không, lấy max q của các phần tử có primary L (`en-US` → `en`).
   - Nếu không, lấy q của `*`.
   - Nếu không có, L không được chấp nhận.
7. Chọn ngôn ngữ q > 0 cao nhất; hòa thì phần tử đứng trước thắng; hòa trong cùng `*` thì `vi`. Mã lý do: `MATCHED`, `MATCHED_BY_TRUNCATION`, `TIE_BY_ORDER`, `WILDCARD`.
8. Không còn ứng viên (Owner chốt):
   - `vi` không bị từ chối ⟹ `vi` (`DEFAULT_NO_SUPPORTED` / `DEFAULT_NO_VALID_ENTRY`);
   - `vi;q=0` mà `en` chưa bị từ chối ⟹ `en` (`FALLBACK_NOT_REFUSED`);
   - từ chối cả hai ⟹ `vi` (`DEFAULT_ALL_REFUSED`).
   - Không bao giờ trả 406.
9. `requestedTarget`: phần tử có q cao nhất, viết thường, ≤ 35 ký tự; chỉ dùng chẩn đoán.

Không log header thô (RFC 9110 §12.5.4 nhắc về riêng tư). FE đặt header tường minh theo ngôn ngữ i18n của app.

| Header                                     | Đích         | Mã lý do                                                                 |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------ |
| _(không có)_ / `` / `,,`                   | vi           | DEFAULT_NO_HEADER / DEFAULT_EMPTY_HEADER                                 |
| `en`, `EN`, `en ; q=0.8`                   | en           | MATCHED                                                                  |
| `en-US` / `vi-VN`                          | en / vi      | MATCHED_BY_TRUNCATION                                                    |
| `en-US,en;q=0.9,vi;q=0.8`                  | en           | MATCHED                                                                  |
| `fr-FR, fr;q=0.9`                          | vi           | DEFAULT_NO_SUPPORTED                                                     |
| `fr, en;q=0.5`                             | en           | MATCHED                                                                  |
| `en;q=0.5, vi;q=0.5` / ngược lại           | en / vi      | TIE_BY_ORDER                                                             |
| `en;q=0` / `en-US;q=0`                     | vi           | DEFAULT_NO_SUPPORTED                                                     |
| `vi;q=0`                                   | en           | FALLBACK_NOT_REFUSED                                                     |
| `vi;q=0, en;q=0` / `*;q=0`                 | vi           | DEFAULT_ALL_REFUSED                                                      |
| `*` / `*, vi;q=0` / `fr, *;q=0.1`          | vi / en / vi | WILDCARD                                                                 |
| `en, en;q=0`                               | vi           | phủ quyết → DEFAULT_NO_SUPPORTED                                         |
| `en-US;q=0, en-GB;q=0.4`                   | en           | MATCHED_BY_TRUNCATION                                                    |
| `en;q=1.5` / `en;q=0.0001` / `en_US` / rác | vi           | DEFAULT_NO_VALID_ENTRY                                                   |
| `en;q=abc, vi;q=0.3`                       | vi           | MATCHED (bỏ phần tử sai)                                                 |
| `en;q=0.8;x=1`                             | vi           | DEFAULT_NO_VALID_ENTRY (grammar chặt; phương án khác: bỏ qua tham số lạ) |
| 600 ký tự / 21 phần tử                     | vi           | DEFAULT_HEADER_TOO_LONG / DEFAULT_TOO_MANY_RANGES                        |
| Hai dòng `fr` + `en;q=0.5` (Node nối)      | en           | MATCHED                                                                  |

### API (draft đến review contract G5)

```text
GET /api/v1/requests/{id}/translations/{field}[?source=vi|en]
GET /api/v1/requests/{id}/approval-steps/{stepId}/translations/{field}[?source=vi|en]
Accept-Language: en
```

**Lý do tách thành endpoint riêng theo yêu cầu:**

- Owner chọn dịch theo yêu cầu.
- Response chi tiết hiện có không đổi và không phụ thuộc thời gian chạy model (0,5–3 s).
- Route có rate limit, hàng đợi và cô lập lỗi riêng.
- `field` là enum đóng và văn bản do server nạp, nên client không gửi được văn bản tùy ý.

**Còn draft:** path, tên enum, schema, có trả `original` hay `sourceVersion`, budget theo người dùng, operationId và mã 404.

**Thứ tự xử lý:**

1. Throttler, authentication (401).
2. Role (403).
3. Zod params/query (422).
4. Nạp resource **với đúng quyền của route chi tiết** (403/404; DB lỗi → 503).
5. Field enum.
6. Phân giải đích.
7. Lối tắt không gọi model: rỗng, cùng ngôn ngữ, không có chữ, `und`/`mul`.
8. Kiểm độ dài, rồi cờ tính năng.
9. **Chỉ lúc này** mới tra cache hoặc tham gia việc đang chạy.
10. Hàng đợi.
11. Model → cổng placeholder → cổng cực tính.
12. Lưu cache nếu đạt.

**Body 200** (envelope thường, message key `TRANSLATION.RESULT`):

```json
{
  "field": "businessJustification",
  "sourceLanguage": "vi",
  "effectiveSourceLanguage": "vi",
  "sourceOverridden": false,
  "requestedTarget": "en-us",
  "resolvedTarget": "en",
  "targetResolution": "MATCHED_BY_TRUNCATION",
  "status": "TRANSLATED",
  "reason": null,
  "textLanguage": "en",
  "original": "…",
  "text": "…",
  "machineTranslated": true,
  "segments": { "total": 3, "translated": 3 }
}
```

`status` ∈ {`TRANSLATED`, `NOT_NEEDED`, `NOT_TRANSLATED`}. `reason` là enum ổn định, đồng thời là key i18n gợi ý cho FE. Bộ này thay sáu trạng thái của bản trước. Chưa có code nên việc đổi chỉ ảnh hưởng tài liệu; mã AC đã được đánh lại.

**Nguồn đã lưu và nguồn hiệu lực:**

- `sourceLanguage` là mã người viết đã khai báo, lưu trong bản ghi.
- `effectiveSourceLanguage` = `source=` của người đọc nếu có, ngược lại bằng `sourceLanguage`. `sourceOverridden` = true khi có `source=` khác giá trị đã lưu.
- Nguồn hiệu lực được dùng cho mọi bước: lối tắt cùng ngôn ngữ, chọn model, key cache. Bản ghi không bao giờ bị sửa.
- Khi trả bản gốc:
  - không ghi đè ⟹ `textLanguage` = `Content-Language` = nguồn hiệu lực;
  - có ghi đè khác giá trị đã lưu ⟹ ngôn ngữ của bản gốc đang tranh chấp, nên `textLanguage` = null và **bỏ** `Content-Language`.

  Không gắn nhãn ngôn ngữ đích cho văn bản vẫn là bản gốc.

| Kết quả                                                                                                                                          | `sourceLanguage` | `textLanguage`                                      | `text`                   | `machineTranslated` | `segments` | `Content-Language`                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------- | ------------------------ | ------------------- | ---------- | ---------------------------------- |
| `TRANSLATED`                                                                                                                                     | vi/en            | = đích                                              | bản dịch                 | true                | {n, n}     | đích                               |
| `NOT_NEEDED` / `SOURCE_EMPTY` (null)                                                                                                             | lưu hoặc null    | null                                                | **null** (đúng giá trị)  | false               | null       | bỏ                                 |
| `NOT_NEEDED` / `SOURCE_EMPTY` (`""`, `"␠␠"`)                                                                                                     | lưu hoặc null    | null                                                | đúng giá trị, không trim | false               | null       | bỏ                                 |
| `NOT_NEEDED` / `SAME_LANGUAGE`                                                                                                                   | = đích           | = đích                                              | bản gốc                  | false               | null       | đích                               |
| `NOT_NEEDED` / `NO_TRANSLATABLE_CONTENT`                                                                                                         | bất kỳ           | null                                                | bản gốc                  | false               | null       | bỏ (RFC 9110 §8.5)                 |
| `NOT_TRANSLATED` / `SOURCE_LANGUAGE_UNKNOWN`                                                                                                     | `und`            | `und`                                               | bản gốc                  | false               | null       | bỏ                                 |
| `NOT_TRANSLATED` / `SOURCE_MIXED` (nếu có `mul`)                                                                                                 | `mul`            | `mul`                                               | bản gốc                  | false               | null       | bỏ (không ghi chỉ đích)            |
| `NOT_TRANSLATED` / `TOO_LONG`, `DISABLED`, `MODEL_UNAVAILABLE`, `BUSY`, `TIMEOUT`, `SEGMENT_FAILED`, `TRUNCATED`, `QUALITY_GATE`, `RATE_LIMITED` | vi/en            | = nguồn hiệu lực (null nếu ghi đè khác giá trị lưu) | bản gốc                  | false               | null       | nguồn hiệu lực (bỏ nếu tranh chấp) |

Áp cho mọi dòng 200:

- `original` = bản gốc chính xác.
- Header `Vary: Accept-Language` và `Cache-Control: no-store`. Thêm `private` không bắt buộc (RFC 9111 §5.2.2.5).
- `text` không bao giờ null khi nguồn có nội dung.
- Model không được gọi ở các nhánh `SOURCE_EMPTY`, `SAME_LANGUAGE`, `NO_TRANSLATABLE_CONTENT`, `und`, `mul`, `TOO_LONG`, `DISABLED`.

Các mã trong `reason`:

- `QUALITY_GATE`: cổng cực tính hoặc thuật ngữ trả bản gốc.
- `RATE_LIMITED`: vượt budget riêng của tính năng. Trả 200 kèm bản gốc theo quyết định Owner. Throttler chung vẫn trả 429.

**Lỗi** (theo API contract):

| HTTP | Code                                               | Khi nào                                             |
| ---- | -------------------------------------------------- | --------------------------------------------------- |
| 401  | `AUTHENTICATION_REQUIRED` / `INVALID_ACCESS_TOKEN` | Token thiếu hoặc sai                                |
| 403  | `AUTHORIZATION.FORBIDDEN` / như route chi tiết     | Sai vai hoặc không thuộc phạm vi                    |
| 404  | Mã của resource                                    | Không có hoặc không thấy được, giống route chi tiết |
| 422  | `VALIDATION_ERROR`                                 | `id` sai, `field` ngoài enum, `source` sai          |
| 429  | `HTTP_TOO_MANY_REQUESTS`                           | Throttler chung                                     |
| 503  | `SERVICE_UNAVAILABLE`                              | DB không truy cập được khi nạp resource             |
| 500  | `INTERNAL_SERVER_ERROR`                            | Chỉ lỗi lập trình; lỗi model được map sang `reason` |

**Bỏ hẳn 406.** `text` là plain text: server không diễn giải hay mã hóa HTML; FE render bằng text node với `white-space: pre-wrap`, không chèn HTML.

### Xử lý một lần dịch

1. Chuẩn hóa: NFC, gộp khoảng trắng; xuống dòng là ranh giới đoạn.
2. Tách câu, rồi đếm token nguồn bằng tokenizer thật (gồm token ngôn ngữ và `</s>`).
   - Segment > 128 token thì tách theo ranh giới mệnh đề (`;`, `,`, liên từ), không cắt placeholder; vẫn quá dài thì trường đó `TOO_LONG`. 512 chỉ là trần cứng của model.
   - Vi→en thoái hóa từ khoảng 190 token, en→vi mất nội dung từ 450 token.
3. Bảo vệ thuật ngữ bằng placeholder `<xN>`. Các kiểu `{N}`, `__TN__`, `#N` đã bị model làm hỏng trong đo đạc. Các thành phần được thay:
   - email, URL, số/số tiền, ngày, mã;
   - **danh sách thuật ngữ thật từ resource**: họ tên những người liên quan (lấy qua facade `organization`) và tên phần mềm trong Catalog (qua facade);
   - glossary tĩnh có version.
   - Văn bản nguồn đã có chuỗi giống placeholder thì chuỗi đó được bảo vệ như một span.
4. Dịch **từng segment một (batch size 1)**: batch có padding thêm `!`/`!!`/`!!!` vào câu ngắn.
   - Gọi trực tiếp `model.generate`.
   - Chiều en→vi chèn id token ngôn ngữ tường minh. Id tra từ vocab và kiểm decode, không hardcode; lúc nạp phải fail closed nếu `model_type` khác `marian`, thiếu EOS/decoder start, token ngôn ngữ không đúng một hoặc input không kết thúc bằng `</s>`.
   - `max_new_tokens = min(512, 2 × token vào + 16)`.
   - **Bắt buộc truyền `forced_eos_token_id: null`.** `generation_config` của cả hai model có `forced_eos_token_id: 0`, nên nếu không truyền, output bị cắt vẫn kết thúc bằng EOS và trông như hoàn chỉnh.
   - Segment chỉ được coi là xong khi token cuối là EOS do model sinh ra (`finishReason = 'eos'`). Chạm `max_new_tokens` ⟹ `TRUNCATED`; bị criterion dừng ⟹ `TIMEOUT`/hủy.
5. Cổng placeholder: thiếu, thừa, trùng hoặc hỏng ⟹ cả trường `SEGMENT_FAILED` và trả bản gốc.
6. Cổng cực tính (lexicon vi/en riêng cho phủ định, duyệt, từ chối, thu hồi; không phụ thuộc dữ liệu test): nguồn có dấu hiệu của một nhóm mà bản dịch thiếu dấu hiệu cùng nhóm ⟹ `QUALITY_GATE` và trả bản gốc. Đây chỉ là heuristic phát hiện, không bảo đảm giữ nghĩa.
7. Khôi phục placeholder theo giá trị gốc hoặc giá trị glossary của ngôn ngữ đích. Ngày dạng chữ và dạng số giữ **nguyên văn**, không bản địa hóa.
8. Bất kỳ segment nào không đạt ⟹ trả **đúng chuỗi gốc của cả trường**, không chuẩn hóa.

**Giới hạn đã đo:** các cổng không bắt được lỗi dịch sai danh từ/thuật ngữ (license → "bằng lái", subscription → "tờ báo") và lỗi model bỏ mất nội dung quanh placeholder (`<x0>=*`). Xem [research](research.md#vòng-cuối-trên-431-15102026).

### Tính toán, hủy và vòng đời

Căn cứ ([research T-2](research.md#t-2--tính-toán-hủy-và-vòng-đời)):

- onnxruntime-node chạy đồng bộ trên luồng JS (đọc source 1.21 và 1.30).
- Binding không đọc `RunOptions.terminate`.
- `worker_threads.terminate()` khi đang inference đã làm chết cả process. Quan sát này có giới hạn: Windows 11, Node 24.0.1, ORT 1.21.0, tái hiện 2 lần; chưa thử trên Linux hay ORT 1.30. Spec không dựa vào việc nó luôn xảy ra, mà dựa vào việc `terminate()` không chặn được code native (tài liệu Node).

- **Topology:**
  - Process API **không import** transformers.
  - `TranslationSupervisor` fork tối đa `TRANSLATION_CONCURRENCY` tiến trình con. Mỗi tiến trình nạp model và chạy **một việc một lúc**.
  - Fork với env tối thiểu (không có secret DB/S3), `--max-old-space-size=256`; con tự thoát khi mất IPC.
  - Con đặt tripwire `fetch` trước khi import, cấu hình env offline, `session_options` `intraOpNumThreads=TRANSLATION_THREADS`, `interOpNumThreads=1`.
- **IPC:**
  - Supervisor → con: `load`, `run{jobId, direction, segments, computeDeadline, maxNewTokensRule}`, `cancel`, `shutdown`.
  - Con → supervisor: `loaded`, `loadFailed{permanent}`, `started`, `done{complete, deadlineHit, cancelled}`, `error{code}`.
  - Message không bao giờ chứa văn bản lỗi thô của thư viện.
- **Trạng thái model:** `UNLOADED → LOADING → READY`.
  - `LOADING → FAILED`: lỗi toàn vẹn là vĩnh viễn; lỗi tạm thì backoff 1 s → 60 s.
  - `READY → DISPOSING → UNLOADED`.
  - `LOAD_TIMEOUT_MS` 30000 kill tiến trình nạp bị treo.
- **Trạng thái việc:** `QUEUED → RUNNING → DONE`.
  - `QUEUED → ABANDONED` khi không còn caller chờ.
  - `RUNNING → CANCEL_REQUESTED → ABANDONED` khi con trả `done{complete:false}`.
  - Không có `done` khi tới deadline tính toán + kill grace ⟹ SIGKILL ⟹ `KILLED`. Chỉ thành `ABANDONED` sau khi nhận sự kiện `exit`.
- **Quy tắc slot:**
  - Tiến trình con chính là slot. Slot chỉ được giải phóng khi con báo `done`/`error`, hoặc khi nhận `exit` sau kill.
  - **Không bao giờ** giải phóng slot khi caller hết giờ, rời đi hay chạm deadline.
  - Chỉ spawn tiến trình thay thế sau `exit`, nên số tiến trình sống luôn ≤ concurrency.
- **Ba đồng hồ:**
  - Deadline trả lời, theo từng caller: tới hạn thì caller đó nhận `TIMEOUT` kèm bản gốc. Tính cả thời gian chờ hàng đợi và nạp model.
  - Deadline tính toán, theo việc: **bắt đầu khi `run` được giao cho một tiến trình con đã `READY`**, không tính lúc spawn hay nạp model (nạp model có giới hạn riêng `LOAD_TIMEOUT_MS` và vẫn nằm trong deadline trả lời).
    - Con tự dừng bằng stopping criterion; supervisor đồng thời gửi `cancel`.
    - Đo được vượt deadline p95 42 ms, max 53 ms.
    - Output bị cắt — do deadline hoặc do chạm `max_new_tokens` — **không** được coi là thành công.
  - Kill grace: phải ≥ 2 × thời gian `session.run` lớn nhất đo được (đo 207–214 ms, nên mặc định 3000 ms). Sau `cancel`, kill timer đặt lại thành `cancel + grace`.
- **Rời đi:**
  - Timeout, ngắt kết nối hoặc abort: settle-once, gỡ khỏi danh sách chờ.
  - Hook ngắt kết nối: `res.once('close', () => { if (!res.writableFinished) abort() })`, gỡ listener sau khi settle.
    - **Không** dùng `req.on('close')`: trên Node 24.0.1, sự kiện `close` của IncomingMessage phát ra trước khi response xong ở GET bình thường, nên sẽ hủy nhầm request lành.
    - Đã kiểm bằng harness `node:http` có socket thật: GET bình thường không hủy; client hủy socket thì đúng caller đó settle, caller khác cùng key vẫn nhận kết quả ([spike/runtime](spike/runtime/README.md)).
  - Không còn ai chờ: việc `QUEUED` bị bỏ, việc `RUNNING` nhận lệnh hủy.
  - **Không** chạy tiếp chỉ để làm đầy cache.
- **Kết quả về muộn:** kết quả hoàn chỉnh và đạt cổng có thể vào cache, nhưng không bao giờ giao cho caller đã settle. Caller mới cho key đang `CANCEL_REQUESTED` nhận một việc mới.
- **Circuit breaker:**
  - Mỗi chiều dịch có breaker riêng.
  - Tính là lỗi: chạm deadline tính toán, bị kill, crash, lỗi nạp tạm.
  - 3 lỗi trong 5 phút ⟹ `OPEN` (`MODEL_UNAVAILABLE` ngay). Cooldown 30 s, nhân đôi tới 5 phút; `HALF_OPEN` cho một việc thử.
  - Cache hit vẫn được trả khi `OPEN`, vì cache chỉ chứa kết quả thành công và chỉ được tra sau khi kiểm quyền.
- **Tắt máy:**
  1. Ngừng nhận việc.
  2. Settle các việc đang chờ bằng `MODEL_UNAVAILABLE`.
  3. Hủy việc đang chạy, chờ `done` tối đa `SHUTDOWN_GRACE_MS`.
  4. Gửi `shutdown`; con dispose pipeline và `exit 0`.
  5. Hết grace thì SIGKILL.

  Cần `app.enableShutdownHooks()`.

- **Readiness** của API không phụ thuộc tính năng dịch. Có thể nạp trước (preload), nhưng không gắn vào request.

### Single-flight và cache

- **Interface:** `translate({organizationId, scope, text, source, target, signal, deadlineAt}) → {status: OK | TIMEOUT | UNAVAILABLE | BUSY, text, cacheHit}`.
  - Caller (use case của module sở hữu) phải **đã kiểm quyền và nạp resource**. Coordinator chỉ nhận văn bản.
  - Không có API đọc, liệt kê hay xóa cache.
- **Key:** HMAC-SHA256 với khóa ngẫu nhiên tạo theo process lúc khởi động, trên `JSON.stringify(["tr-v1", organizationId, scope, engineId, modelDigest, glossaryVersion, "nfc-ws-v1", placeholderPolicyVersion, source, target, sha256(normalizedText)])`.
  - `scope` = `resourceType:resourceId:field`.
  - `engineId` = phiên bản transformers + ORT + q8 + greedy + quy tắc max token.
  - `modelDigest` = sha256 của các mục lock tương ứng chiều dịch.
  - Dùng HMAC để giảm rủi ro đoán văn bản ngắn từ key trong memory dump. Dùng scope theo resource để bỏ kênh suy luận qua thời gian giữa các resource.
- **Single-flight:**
  - Map `inflight` chỉ chứa việc `QUEUED`/`RUNNING`. N caller cùng key dùng chung một việc, không tốn thêm slot hàng đợi.
  - Mỗi caller có timer và `AbortSignal` riêng; một caller rời đi không hủy việc của người khác.
  - Kích thước `inflight` ≤ `QUEUE_MAX + CONCURRENCY`.
- **Cache:**
  - LRU trong process API: tối đa 500 mục **và** 8 MiB, TTL 86400 s, hết hạn lười.
  - Chỉ lưu kết quả hoàn chỉnh, không chạm deadline, không bị hủy và đạt mọi cổng.
  - Không cache bản gốc trả về khi lỗi, không cache âm.
  - Không DB/Redis; mất khi restart; mỗi process một cache.

### Toàn vẹn model và offline

- **Lock hash kỳ vọng được commit**, ví dụ `src/infrastructure/translation/model-lock.json`:
  - Schema: `{schemaVersion, models: [{id, revision, files: [{path, bytes, sha256, hubOid}]}]}`.
  - Nội dung lấy từ bảng 16 file đã khớp hash Hugging Face công bố ([research T-6](research.md#t-6--toàn-vẹn-offline-đóng-gói)).
  - Downloader kiểm theo lock **trước** khi rename. Runtime kiểm theo lock, không theo `manifest.json` tự tính.
- **Kiểm trước khi nạp, trong tiến trình con:**
  1. `realpath` thư mục gốc.
  2. Id/path chỉ gồm `[A-Za-z0-9._-]` và `/`; không tuyệt đối, không `..`, không `\`, không NUL; không trùng (không phân biệt hoa thường).
  3. `lstat` từ chối symlink; từ chối file thừa hoặc thiếu; đường dẫn đã resolve phải nằm dưới thư mục gốc.
  4. Kiểm kích thước, rồi sha256.

  Sai ở bất kỳ bước nào ⟹ `FAILED` vĩnh viễn, log một lần, tính năng ở `MODEL_UNAVAILABLE`.

- **Spike đã chứng minh** (`spike/runtime/verify-lock.mjs`, 15/10/2026):
  - Kiểm đúng 16 file thật.
  - Bản copy có 1 byte bị sửa trong `tokenizer.json` ⟹ `MODEL_LOCK_MISMATCH` trước khi nạp hay chạy; chiều còn lại vẫn nạp được.
  - Unit test cho thiếu file, file thừa, symlink/junction, path `..`.
- **Chi phí:** Windows 0,85–0,95 s cho cả 16 file; Linux bind mount 2 CPU khoảng 1,6–1,85 s mỗi chiều, làm nạp lạnh chậm khoảng 2,3 lần (p50 3,8–4,1 s so với 1,5–1,8 s).
- **Còn mở cho dev review:** kiểm một lần khi supervisor khởi động rồi tin vào mount read-only, hay kiểm lại mỗi lần respawn. Đánh đổi là giữa thời gian nạp và cửa sổ TOCTOU. Cửa sổ TOCTOU giữa lúc kiểm và lúc thư viện mở file vẫn chỉ được chặn bằng mount read-only.

- **Env offline:** `allowRemoteModels=false`, `allowLocalModels=true`, `useFSCache=false` (bắt buộc: FS cache được đọc trước đường dẫn local), `useBrowserCache=false`, `env.fetch` và `globalThis.fetch` thay bằng tripwire, `useWasmCache=false`, `logLevel=ERROR`.
- **Bằng chứng offline:** container `--network none` (không chỉ stub fetch) và tripwire đếm 0 lần.

### Giới hạn (mặc định đề xuất)

Các con số này chờ dev chốt theo [kết quả runtime](research.md#kết-quả-runtime).

| Biến                            | Mặc định  | Ghi chú                                                                                          |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `TRANSLATION_ENABLED`           | `false`   | Tắt ⟹ `DISABLED`, không spawn                                                                    |
| `TRANSLATION_MODELS_DIR`        | —         | Thư mục model, kiểm theo lock                                                                    |
| `TRANSLATION_MAX_CHARS`         | `1000`    | Linux 2 CPU, concurrency 1: p95 6,4–7,3 s; 4000 ký tự mất 24–28 s                                |
| `TRANSLATION_TIMEOUT_MS`        | `10000`   | Deadline trả lời mỗi caller                                                                      |
| `TRANSLATION_COMPUTE_MAX_MS`    | `10000`   | Deadline tính toán mỗi việc                                                                      |
| `TRANSLATION_KILL_GRACE_MS`     | `3000`    | ≥ 2 × `session.run` lớn nhất đo được                                                             |
| `TRANSLATION_CONCURRENCY`       | `1`       | **Số tiến trình con**; RSS 526 MB một chiều, 838 MB hai chiều. Concurrency 2 trên 2 CPU chậm hơn |
| `TRANSLATION_THREADS`           | `1`       | `intraOpNumThreads` của ORT; trên 2 CPU, 2 luồng không nhanh hơn                                 |
| `TRANSLATION_LOAD_TIMEOUT_MS`   | `30000`   | Đo nạp lạnh p50 1,5–1,8 s, max 2,9 s                                                             |
| `TRANSLATION_SHUTDOWN_GRACE_MS` | `5000`    | Đo SIGTERM thoát sau 48–808 ms                                                                   |
| `TRANSLATION_QUEUE_MAX`         | `4`       | Đầy ⟹ `BUSY`                                                                                     |
| `TRANSLATION_CACHE_MAX_ENTRIES` | `500`     |                                                                                                  |
| `TRANSLATION_CACHE_MAX_BYTES`   | `8388608` |                                                                                                  |
| `TRANSLATION_CACHE_TTL_SECONDS` | `86400`   |                                                                                                  |
| `TRANSLATION_PRELOAD`           | `false`   | Không gắn với readiness                                                                          |

Budget riêng 20 lần/phút/người dùng (vượt ⟹ `RATE_LIMITED` kèm bản gốc), ngoài throttler chung 120/phút/route/IP.

### Dữ liệu và bảo mật

- Phân loại không đổi: BRD 7.7.2 dòng 5. Người xem bản dịch phải là tập con của người được đọc hồ sơ. Nội dung tự do có thể vô tình chứa dữ liệu khác, và việc dịch không đổi phân loại.
- Không gửi dữ liệu ra ngoài, nên không mâu thuẫn BRD 7.7.5.
- **Log:**
  - Không log văn bản nguồn hay đích, placeholder map, glossary hit, `Accept-Language` thô, hay `err.message` thô của thư viện.
  - Chỉ log `requestId`, resource type, field, chiều dịch, số ký tự, số segment, thời gian, status/reason, cache hit.
- Đọc bản dịch không ghi Audit Trail (`FR-8.3` chỉ audit thay đổi); mã ngôn ngữ được ghi trong lần tạo đã audit.
- Nội dung trông như chỉ dẫn ("bỏ qua hướng dẫn…") được dịch như văn bản thường.

### Kiến trúc, dependency, triển khai

- **Module:**
  - Tiến trình con, supervisor và lock đặt ở `src/infrastructure/translation/` vì là adapter kỹ thuật.
  - Module G5 khai allowlist, route và kiểm quyền, rồi gọi coordinator qua provider đã export.
  - Không module nào đọc bảng của module khác.
- **Dependency:**
  - `@huggingface/transformers@4.3.1` pin exact.
  - pnpm override `'@huggingface/transformers>onnxruntime-web': '-'`; giữ `allowBuilds` false cho `onnxruntime-node` và `sharp`; bỏ mục `protobufjs`.
  - Gate: `pnpm audit --prod --audit-level high` exit 0. Đổi trong PR riêng của hạng mục, **không** gộp vào PR remediation.
  - Thay đổi dependency 3.8.1 chưa commit trong working tree là của phiên khác; giữ nguyên tới khi dev quyết định.
- **Đóng gói:**
  - Build stage `translation-models` tải và kiểm theo lock (cache mount); runtime COPY quyền root, mode 0444/0555, `TRANSLATION_MODELS_DIR=/app/models/translation`.
  - Thêm `.models` vào `.dockerignore`.
  - Có thể ghi đè bằng volume cho dev; runtime vẫn kiểm.
  - CI không tải model; test chạy model thật bỏ qua có thông báo khi thiếu model. Bỏ qua không phải bằng chứng model đạt.
- **Không có migration** ở hạng mục này; cột mã ngôn ngữ thuộc Logical/migration của G5.

### Tác động API/OpenAPI/FE

- **OpenAPI:** mỗi trường trong allowlist có operation `GET …/translations/{field}`, khai 200/401/403/404/422/429/503 (**không** có 406). Response đọc hiện có không đổi. Cập nhật API inventory; chạy `pnpm openapi:export`.
- **Contract G5:** body tạo/sửa có mã ngôn ngữ của từng trường tự do; response chi tiết trả mã đó để FE biết khi nào hiện nút dịch.
- **FE:**
  - Regenerate orval.
  - Đặt `Accept-Language` theo ngôn ngữ i18n.
  - Bộ chọn ngôn ngữ nội dung cạnh ô nhập.
  - Nút "Xem bản dịch" khi mã nguồn khác ngôn ngữ UI.
  - Luôn hiện bản gốc; nhãn "Bản dịch máy — bản gốc là căn cứ".
  - Link "Bản gốc là tiếng …? Dịch lại" gửi `source`.
  - Xử lý ba `status` cùng `reason`; không branch theo `message`; render plain text.
- **Ví dụ FE** (giả lập):
  - `NOT_TRANSLATED/TIMEOUT` ⟹ hiện bản gốc và gợi ý "Chưa dịch được, thử lại sau".
  - `TRANSLATED` ⟹ hiện bản gốc, rồi bản dịch có nhãn.
  - `SOURCE_EMPTY` với `text: ""` ⟹ ô trống, không có nút dịch.

### Dependency của hạng mục

| Phụ thuộc                                                                                                             | Vì sao                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs ghi `QĐ-74` (đề xuất) + BRD/US/Logical ([source-sync](source-sync.md))                                           | Yêu cầu chưa có trong nguồn                                                                                                                                                         |
| Lát G5: Request, bước duyệt, cột mã ngôn ngữ                                                                          | Chưa có resource                                                                                                                                                                    |
| [`g0-g1-remediation-after-rereview`](../g0-g1-remediation-after-rereview/spec.md) merge và kiểm lại (N-1, R-15, R-13) | G5 có transaction ghi. Hạng mục này không sửa `TransactionRunner`, `prisma.service.ts` hay cấu hình DB; biến `TRANSLATION_*` chỉ thêm vào `env-schema.ts` sau khi remediation merge |
| Gate dependency: 4.3.1 + cách chèn id token ngôn ngữ; benchmark chất lượng chạy lại trên 4.3.1                        | T-1                                                                                                                                                                                 |
| Cổng chất lượng T1–T8 được Owner/dev chốt và đạt                                                                      | Điều kiện bật tính năng                                                                                                                                                             |
| Giới hạn tài nguyên đo trên Linux đạt tiêu chí ([kết quả runtime](research.md#kết-quả-runtime))                       | T-2                                                                                                                                                                                 |
| Owner/pháp lý xem license dữ liệu huấn luyện                                                                          | T-6                                                                                                                                                                                 |

## Acceptance và kiểm chứng

Mã `TR-AC-xx` là mã tạm, được đánh lại theo contract mới; map sang AC của `US-05-02`/`US-05-04` khi US cập nhật. Chi tiết ở [test plan](test-plan.md).

| Mã       | Hành vi                                                                                                                                         | Cấp test và kỳ vọng                                                            | Bằng chứng                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| TR-AC-01 | Không có quyền đọc resource                                                                                                                     | E2E: 403/404 như route chi tiết; không tra cache, không join, không gọi worker | Chưa implement                                                                                             |
| TR-AC-02 | Field ngoài enum, `source` sai                                                                                                                  | E2E: 422                                                                       | Chưa implement                                                                                             |
| TR-AC-03 | Bảng header ở mục Accept-Language                                                                                                               | Unit: đủ các dòng; E2E: thiếu header ⟹ `vi`; không có 406                      | Chưa implement                                                                                             |
| TR-AC-04 | Nguồn null / `""` / khoảng trắng                                                                                                                | Unit + E2E: `NOT_NEEDED/SOURCE_EMPTY`, giữ đúng giá trị; worker không được gọi | Chưa implement                                                                                             |
| TR-AC-05 | Cùng ngôn ngữ; không có chữ; `und`                                                                                                              | Unit: lý do đúng, trả bản gốc, không gọi worker                                | Chưa implement                                                                                             |
| TR-AC-06 | Mọi nhánh `NOT_TRANSLATED` trả bản gốc với `textLanguage` = nguồn                                                                               | Unit + E2E: `text` = `original`, không null                                    | Chưa implement                                                                                             |
| TR-AC-07 | Một segment hỏng placeholder                                                                                                                    | Unit (fake): cả trường `SEGMENT_FAILED`, trả đúng chuỗi gốc                    | Product: chưa. Spike: helper test (`spike/quality/pipeline.test.mjs`, fake model)                          |
| TR-AC-08 | Thiếu dấu hiệu cực tính                                                                                                                         | Unit: `QUALITY_GATE`, trả bản gốc                                              | Product: chưa. Spike: helper test + benchmark model thật                                                   |
| TR-AC-09 | en→vi chèn id token ngôn ngữ (tra vocab, kiểm decode); fail closed khi giả định sai                                                             | Integration: id đầu đúng; giả định sai ⟹ `MODEL_UNAVAILABLE`                   | Product: chưa. Spike: model thật (adapter, 22/22)                                                          |
| TR-AC-10 | Ghi: có nội dung mà thiếu mã ngôn ngữ                                                                                                           | E2E G5: 422; không tạo bản ghi                                                 | Chưa implement                                                                                             |
| TR-AC-11 | `source=` ghi đè khi đọc                                                                                                                        | E2E: dùng nguồn mới; bản ghi không đổi                                         | Chưa implement                                                                                             |
| TR-AC-12 | Single-flight: N caller cùng key ⟹ worker chạy 1 lần; một caller rời đi không hủy caller khác                                                   | Unit (fake worker)                                                             | Spike runtime                                                                                              |
| TR-AC-13 | Slot: không giải phóng khi caller hết giờ; kill ⟹ chỉ spawn lại sau `exit`; số tiến trình sống ≤ N                                              | Unit + integration model thật trên Linux                                       | Spike runtime                                                                                              |
| TR-AC-14 | Deadline tính toán và `max_new_tokens` (có `forced_eos_token_id: null`): output bị cắt không thành công, không vào cache; đồng hồ tính từ `run` | Integration model thật                                                         | Product: chưa. Spike: model thật Windows + Linux (truncation, overrun, clock)                              |
| TR-AC-15 | Cache: entries/bytes/TTL; không cache bản gốc trả khi lỗi; key HMAC                                                                             | Unit                                                                           | Spike runtime                                                                                              |
| TR-AC-16 | Lock: hash sai, file thừa, symlink, `..` ⟹ `MODEL_UNAVAILABLE`; readiness vẫn 200                                                               | Unit + integration                                                             | Product: chưa. Spike: unit + model thật (bản copy bị sửa); readiness chưa có vì spike không có API product |
| TR-AC-17 | Offline: container `--network none`, tripwire 0                                                                                                 | Integration/container                                                          | Spike deps/runtime                                                                                         |
| TR-AC-18 | Log không chứa văn bản, header thô, `err.message` thô                                                                                           | Integration (marker)                                                           | Chưa implement                                                                                             |
| TR-AC-19 | Header 200: `Vary`, `Content-Language` theo bảng, `Cache-Control: no-store`                                                                     | E2E                                                                            | Chưa implement                                                                                             |
| TR-AC-20 | Budget riêng ⟹ `RATE_LIMITED` kèm bản gốc; throttler chung ⟹ 429                                                                                | E2E                                                                            | Chưa implement                                                                                             |
| TR-AC-21 | Health/event loop của API không nghẽn khi dịch, nạp model, kill                                                                                 | Spike runtime trên Linux                                                       | Spike runtime                                                                                              |
| TR-AC-22 | SIGTERM khi đang dịch: thoát trong grace, không mồ côi                                                                                          | Integration                                                                    | Spike runtime                                                                                              |
| TR-AC-23 | Cổng chất lượng T1–T8                                                                                                                           | Benchmark chạy lại trên 4.3.1 + người duyệt                                    | Spike 4.3.1 đã chạy: **không đạt** (vi→en), chưa đạt để bật (en→vi); AI phân xử, chưa có người duyệt       |
| TR-AC-24 | OpenAPI không có 406; response đọc cũ không đổi                                                                                                 | `pnpm openapi:export` + review diff                                            | Chưa implement                                                                                             |

Các nhãn bằng chứng:

- _Helper test_: test của thư viện spike với model giả.
- _Spike runtime_: test supervisor với tiến trình con giả, hoặc đo bằng model thật khi có ghi rõ.
- _Model thật_: chạy model thật trên Windows/Linux trong spike.
- _AI review_: Opus đọc và phân xử.
- Duyệt của người: **chưa có ở bất kỳ AC nào.**

Không nhãn nào là bằng chứng của implementation product. Mọi AC đều "Product: chưa" cho tới khi có code product.

## Sẵn sàng bàn giao

- [ ] Nguồn: Docs ghi `QĐ-74` + BRD/US và pin snapshot có hash.
- [ ] Contract được dev review cùng contract G5.
- [ ] Dependency: PR riêng đổi sang 4.3.1, audit gate exit 0, golden parity, benchmark chạy lại.
- [ ] Chất lượng: kết quả spike 15/10/2026 là **âm tính** (vi→en không đạt; en→vi còn lỗi thuật ngữ lọt qua cổng). Cần Owner/dev chọn: giữ disabled/pending, hoặc chỉ en→vi sau khi người duyệt gold set và chấp nhận rủi ro thuật ngữ.
- [ ] Tài nguyên: tiêu chí runtime trên Linux đạt; đã chọn cách đóng gói.
- [ ] Remediation đã merge; resource G5 sẵn sàng; license đã được xem.
- [ ] Dev khác xác nhận với link review và revision.

## Thay đổi và nghiệm thu

- 14/10/2026 (lượt 1): draft đầu.
- 14/10/2026 (lượt 2):
  - Contract theo quyết định Owner: default `vi`, bỏ 406, trả bản gốc, policy `q=0`, `source=`, không là tính năng AI.
  - Bộ trạng thái mới và bảng sự thật.
  - Ngôn ngữ gốc do người viết khai báo.
  - Tiến trình con + state machine, single-flight, cache HMAC, lock hash.
  - Dependency 4.3.1 và regression token.
  - Bỏ `QĐ-71`; đề xuất `QĐ-74`.
  - Spike tái chạy được.
- 15/10/2026 (lượt 3, khép [translation spike review](../../../reviews/dynamic-content-translation-2026-10-15/spike-review.md) V-1 → V-5):
  - Adapter 4.3.1 tra token ngôn ngữ và fail closed; `forced_eos_token_id: null`.
  - Segment 128 token đếm thật; cổng cực tính; fallback cả trường; ngày giữ nguyên văn.
  - Đồng hồ tính toán tính từ `run`; xử lý spawn lỗi; hook `res` `close`; tách nguồn đã lưu / nguồn hiệu lực; lock probe.
  - Benchmark 4.3.1 cho kết quả âm tính; bảng license; nhãn bằng chứng.
- Chưa implement, chưa nghiệm thu. Research hoàn tất không có nghĩa tính năng được nghiệm thu.
