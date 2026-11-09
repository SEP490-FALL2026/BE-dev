# Research: dịch nội dung động EN–VI

- Mục đích: chọn cách dịch và đo giới hạn thật trước khi thiết kế. Kết luận dùng ở [spec](spec.md); spike tái chạy được ở [spike/](spike/README.md).
- Trạng thái: **draft**, cập nhật sau [review spike và finalization](../../../reviews/dynamic-content-translation-2026-10-15/README.md). Chưa có dev review.
- Vai trò:
  - **Opus 5.5** điều phối, nghiên cứu nguồn chính thức và review kết quả: agent A (contract, nguồn nghiệp vụ), agent B (runtime, dependency, toàn vẹn model).
  - **Sonnet 5.5** viết spike, runner và test: agent C (dependency, Linux), agent E (chất lượng), agent D (runtime/worker).
  - AI review không thay xác nhận của dev.
- Ràng buộc đã giữ:
  - Không sửa product source/config/lockfile; không cài vào product.
  - Install chỉ trong clone/scratch với `--ignore-scripts`.
  - Không gọi dịch vụ trả phí, không tải model mới, không commit weights.

## Câu hỏi và trả lời ngắn

| Mã  | Câu hỏi                                                                  | Trả lời                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | Trường/endpoint nào có nhu cầu dịch thực tế?                             | Chưa có trong code. Lát đầu có trường do người viết và người khác đọc là **G5**: `US-05-02` (lý do nghiệp vụ, lý do ngoài bộ chuẩn), `US-05-04` (lý do quyết định, cờ ngoài bộ chuẩn ở AC-7)                                                         |
| Q-2 | Google hay DeepL?                                                        | Cả hai đáp ứng EN↔VI nhưng chuyển dữ liệu ra nước ngoài. Owner chọn dịch cục bộ; Google chỉ là phương án dự phòng                                                                                                                                    |
| Q-3 | Thư viện Node.js dịch cục bộ?                                            | `@huggingface/transformers` + `Xenova/opus-mt-vi-en`, `Xenova/opus-mt-en-vi` (ONNX q8). Đã chạy offline trên Windows và Linux `--network none`                                                                                                       |
| Q-4 | Dependency có qua gate audit không?                                      | 3.8.1 **không** (sharp 0.34.5: 3 high). 4.3.1 qua (sharp 0.35.5) nhưng **làm vỡ token `>>vie<<`**; phải tự chèn id token ngôn ngữ — mục T-1                                                                                                          |
| Q-5 | Có giới hạn được CPU/RAM thật không?                                     | Không hủy được inference trong process (ORT chạy đồng bộ, không có `terminate`). Phải chạy ở **tiến trình con**: dừng hợp tác giữa các bước decode, SIGKILL làm chặn cứng — mục T-2                                                                  |
| Q-6 | Chất lượng có đủ để bật không?                                           | **Không, sau vòng cuối trên 4.3.1 (kết quả âm tính).** vi→en: 32% trường trả bản gốc, còn lỗi nghiêm trọng lọt qua. en→vi: không thấy mất cực tính nhưng lỗi thuật ngữ còn lọt qua, fallback 17–35% — mục _Chất lượng_. Đề xuất giữ disabled/pending |
| Q-7 | Model có đúng là file đã công bố không? Có chạy hoàn toàn offline không? | 16/16 file khớp hash Hugging Face công bố tại commit đã pin; 0 lần gọi mạng; container `--network none` chạy được. License dữ liệu huấn luyện cần Owner/pháp lý xem                                                                                  |

## Nhu cầu trong code và nguồn

Đọc BE `a8ba88f` + working tree và Docs working tree. BRD đang ở **v3.39**, sổ quyết định tới `QĐ-73`; chưa pin snapshot mới.

- **BRD/US:** chưa có yêu cầu dịch. Đề xuất ghi ở [source-sync](source-sync.md).
- **FE:** có i18n EN/VI cho chuỗi tĩnh (mặc định `vi`). Generated client không đặt `Accept-Language`.
- **BE:** success message là key và lỗi có code; email có template theo locale. Các trường chuỗi đang trả ra là tên riêng hoặc danh mục, không dịch.
- **Đính chính bản trước:** cờ và lý do ngoài bộ chuẩn nằm ở `US-05-04` **AC-7** (`FR-3.18`). `US-05-02` AC-6 là "thiếu trường bắt buộc của `BM-01`".
- **Quét các lát sớm hơn (Opus A):**
  - `US-03-06`: mô tả phòng do IT viết.
  - `US-04-10`: lý do đổi bộ chuẩn; người khác chỉ thấy qua thông báo/Audit Trail.
  - `US-07-04`, `US-02-05`: lý do do IT viết và IT đọc.
  - `US-12-09`: ghi chú thuế.

  Đều là dữ liệu quản trị/tham chiếu hoặc chỉ hiện qua thông báo, nên G5 vẫn là điểm tích hợp đầu. Ứng viên G5 thêm: lý do thời hạn > 12 tháng (`US-05-04`), lý do duyệt chi (`US-06-01`). Thêm trường nào cũng cần quyết định của Owner.

## So sánh phương án

Nguồn chính thức, tra 14/10/2026.

| Tiêu chí         | Google Cloud Translation                                                                                        | DeepL API                                                         | OPUS-MT cục bộ                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| EN↔VI            | Có                                                                                                              | VI có trong danh sách; EN-US/EN-GB chỉ làm đích                   | Hai model một chiều                                                |
| Dữ liệu ra ngoài | Có; "held briefly in-memory", không huấn luyện, Cloud DPA; chỉ v3 có endpoint theo vùng, không có vùng Việt Nam | Có; điều khoản gói miễn phí chưa xác minh (trang support trả 403) | Không                                                              |
| Chi phí          | $20/1M ký tự; credit $10/tháng ≈ 500k ký tự                                                                     | Gói Developer/Growth/Enterprise; giá Growth theo nguồn thứ ba     | Không phí theo ký tự; RAM ≈ 0,6–0,8 GiB/tiến trình, CPU            |
| Giới hạn         | 5k ký tự khuyến nghị; v3 30k codepoint; quota chặn chi phí                                                      | Request 128 KiB; SDK timeout 10 s, 5 retry                        | Tự đặt; tiến trình con, hàng đợi, deadline                         |
| Kiểm thử         | Fake adapter; gọi thật cần billing                                                                              | Fake adapter; cần key                                             | Fake worker cho unit; model thật trong integration, không cần mạng |

## T-1 — Dependency

**Advisory** (GitHub advisory API, Opus B):

| GHSA                                                                     | Thành phần | Bị ảnh hưởng   | Sửa ở  | Công bố    |
| ------------------------------------------------------------------------ | ---------- | -------------- | ------ | ---------- |
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | libvips    | sharp < 0.35.0 | 0.35.0 | 2026-07-21 |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | libheif    | < 0.35.4       | 0.35.4 | 2026-09-08 |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | librsvg    | < 0.35.5       | 0.35.5 | 2026-10-06 |

- Advisory nói tác động chỉ có khi xử lý ảnh không tin cậy. Tính năng dịch không giải mã ảnh, nhưng gate audit vẫn fail. Đây không phải bằng chứng route text có exploit.
- Moderate còn lại: `sprintf-js` 1.1.3 ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)) qua `onnxruntime-node` 1.21 → `global-agent` → `roarr`.

**sharp nạp ngay khi import** ở cả 3.8.1 (`dist/transformers.node.cjs`, `src/utils/image.js` throw khi thiếu) và 4.3.1 (`src/utils/image.js:18`).

- Thử `--no-optional` thì cả hai bản đều fail khi load.
- Upstream không có entry point chỉ cho text.
- Không thể bỏ sharp. Muốn gate xanh phải dùng sharp ≥ 0.35.5.
- Chỉ dòng 4.3.x khai `sharp ^0.35.4`. Caret trên 0.x không vượt minor, nên 3.8.x → 4.2.0 không bao giờ tới 0.35.

**Ma trận** (Sonnet C; [spike/deps](spike/deps/README.md), evidence trong `spike/deps/evidence/`):

| Ứng viên                                                                 | sharp / ort-node / ort-web   | `pnpm audit --prod --audit-level high` | CJS/ESM | Smoke offline Win + Linux | VmHWM Linux  |
| ------------------------------------------------------------------------ | ---------------------------- | -------------------------------------- | ------- | ------------------------- | ------------ |
| Working tree (3.8.1) trên clone `a8ba88f`                                | 0.34.5 / 1.21.0 / 1.22.0-dev | **exit 1**: 3 high, 1 moderate         | ok      | ok                        | ≈ 750–790 MB |
| HEAD sạch (không có delta dịch)                                          | —                            | exit 0, 0 finding                      | —       | —                         | —            |
| 4.3.1 (A0)                                                               | 0.35.5 / 1.30.0 / 1.31.0-dev | exit 0                                 | ok      | ok                        | ≈ 570–640 MB |
| 4.3.1 + override `'@huggingface/transformers>onnxruntime-web': '-'` (A1) | 0.35.5 / 1.30.0 / —          | exit 0                                 | ok      | ok; 30/30 output giống A0 | ≈ 570–640 MB |

- Lockfile product (bản copy trong scratch) đổi sang 4.3.1: update lock, frozen prod install và audit gate đều exit 0.
  - Thay đổi +38/−46 package, tất cả trong cây transformers.
  - A1 bỏ thêm `onnxruntime-web`, `protobufjs`, `flatbuffers`. Theo build của 4.3.1, `onnxruntime-web` là `NODE_IGNORE_MODULES`.
- `node_modules` prod trên Linux: 755 MB (3.8.1), 872 MB (4.3.1), 729 MB (4.3.1 + A1).
- Binary linux-x64 của ORT có sẵn sau `--ignore-scripts`; ORT 1.30 cần GLIBC 2.28 (bookworm có 2.36). Không có CUDA.
- pnpm 11: `minimumReleaseAge` hiện chưa đặt nên không chặn 4.3.1. Đặt 20000 phút sẽ chặn cả 4.3.1 và `@types/node` 26.6.5.

**Regression token ngôn ngữ trong 4.3.1** (Sonnet C phát hiện, coordinator xác minh nguyên nhân):

- Ở 4.3.1, `tokenizer.encode` không còn gọi `MarianTokenizer._encode_text` (đo được 0 lần so với 2 lần ở 3.8.1). Phần override tách `>>vie<<` thành mã chết, nên token bị cắt thành 5 mảnh `[5402, 2257, 16203, 5896, 5896]` thay vì id `3`.
- Hậu quả: en→vi có tiền tố cho 9/10 câu khác 3.8.1, phần lớn tệ hơn (ví dụ "The enterprise plan includes fifty user licenses." → "Ghi chú xe đạp."). vi→en: 9/10 giống.
- Cách khắc phục: tokenize câu **không** tiền tố, tự chèn id token ngôn ngữ lấy từ vocab, gọi `model.generate`, rồi `batch_decode`. Kết quả 10/10 giống 3.8.1 (`spike/deps/probe-prefix-workaround.mjs`).

**Khuyến nghị:**

- Dùng `@huggingface/transformers@4.3.1` (pin exact) cùng override bỏ `onnxruntime-web`.
- Gọi trực tiếp `model.generate` với id token ngôn ngữ chèn tường minh.
- Worker tự kiểm lúc khởi động: id đầu của chiều en→vi phải là `3`, sai thì tính năng `UNAVAILABLE`.
- Có bộ golden parity cho mỗi lần nâng version.
- Đánh đổi: phụ thuộc API nội bộ `model.generate` của transformers.js; `node_modules` lớn hơn ~ −26 MB so với 3.8.1 khi có A1; vẫn giữ libvips trong image dù không dùng.
- **Không** dùng override ép sharp cho 3.8.1: vi phạm range đã khai, nằm ngoài phạm vi được phép.
- **Phương án C** (chỉ so sánh): `onnxruntime-node` + `@huggingface/tokenizers` + vòng greedy tự viết, ≈ 200–300 dòng, 2–3 ngày dev. Không có sharp/libvips; token parity chưa kiểm. Chỉ cân nhắc nếu Owner muốn bỏ libvips khỏi image.
- Gate dependency này tách khỏi PR remediation. Lockfile product chưa đổi; người implement đổi trong PR riêng của hạng mục dịch.

## T-2 — Tính toán, hủy và vòng đời

**Đã xác minh trong source** (Opus B):

- onnxruntime-node `session.run` và nạp model là **lời gọi native đồng bộ** trên luồng JS: `setImmediate(() => resolve(session.run(...)))` ở 1.21 và 1.30.
  - Event loop chỉ quay giữa các bước decode.
  - Nạp model chặn loop suốt thời gian nạp (1–3,4 s).
- `RunOptions.terminate` có trong typings nhưng binding node không đọc (1.21, 1.30). transformers.js không truyền RunOptions.
- Sinh văn bản: encoder chạy một lần, sau đó mỗi bước decode là một `session.run` trong vòng lặp JS. Chỉ có greedy (beam search là no-op), nên output tất định.
- `StoppingCriteria` tự viết, truyền dạng mảng, được gọi mỗi bước. Đo được vượt deadline 2–14 ms (≤ một bước).
  - Output bị cắt vẫn trả như thành công, nên phải coi cờ `hit` là chưa xong.
  - Truyền `StoppingCriteriaList` thì criterion **không** được gọi.
- Cách ly (probe Windows, ORT 1.21):

  | Cách                                                     | Kết quả                                                                                                                                                                               |
  | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `worker_threads.terminate()` khi worker đang rảnh        | Sạch                                                                                                                                                                                  |
  | `worker_threads.terminate()` **khi đang chạy inference** | **Làm chết cả process** (0xC0000409), tái hiện hai lần. Chỉ quan sát trên Windows 11 + Node 24.0.1 + ORT 1.21.0; chưa thử Linux/ORT 1.30. Không tái hiện thêm vì có thể làm chết host |
  | `child_process.fork` + SIGKILL giữa chừng                | Con thoát sau 60–70 ms; cha sống                                                                                                                                                      |

**Kết luận thiết kế:**

- Process API không import transformers.
- Mỗi tiến trình con là một "slot" và chạy một việc một lúc. Slot chỉ được trả khi tiến trình con báo xong hoặc khi sự kiện `exit` tới sau khi bị kill.
- Có ba đồng hồ riêng: deadline trả lời (theo từng caller), deadline tính toán (dừng hợp tác) và kill grace.
- Chi tiết ở [spec](spec.md#tính-toán-hủy-và-vòng-đời).

**Kết quả spike runtime** (Sonnet D; [spike/runtime](spike/runtime/README.md)): xem mục _Kết quả runtime_ ở cuối file.

## Chất lượng

Sonnet E; [spike/quality](spike/quality/README.md).

- Dữ liệu: 84 câu nghiệp vụ giả lập mỗi chiều; bản tham chiếu là **AI draft**. Coordinator đã kiểm mẫu 32 cặp, không thấy sai nghĩa; đây không phải gold set do người duyệt.
- Cấu hình: transformers 3.8.1, q8, batch size 1, warmup 2, 3 lần lặp; output giống nhau giữa các lần lặp.
- chrF tự viết khớp sacreBLEU 2.6.0 trong khoảng ±0,005.
- 82 unit test (`node --test`) pass; coordinator chạy lại 82/82.

| Chỉ số                                               | vi→en raw         | vi→en bảo vệ                   | en→vi raw         | en→vi bảo vệ        |
| ---------------------------------------------------- | ----------------- | ------------------------------ | ----------------- | ------------------- |
| chrF corpus                                          | 35,8              | 36,6                           | 28,9              | 40,9                |
| Giữ thuật ngữ được bảo vệ (% câu; danh sách cho sẵn) | 34,3              | 100                            | 16,2              | 100                 |
| Kiểm nghĩa đạt (%)                                   | 43,5              | 71,0                           | 33,3              | 88,3                |
| Phủ định / duyệt / từ chối / thu hồi đạt (%)         | 47 / 22 / 60 / 20 | 74 / 56 / 80 / 50              | 53 / 33 / 78 / 22 | 100 / 78 / 100 / 89 |
| Segment trả bản gốc (%)                              | 0                 | 24,2 (20,7 không tính câu dài) | 0                 | 12,1 (8,0)          |
| Flag cực tính tự động, không báo (câu)¹              | 29                | **5**                          | 23                | **1**               |
| p50 / p95 mỗi câu (ms)                               | 704 / 2746        | 666 / 1619                     | 622 / 1535        | 756 / 1493          |

¹ Đây là flag do kiểm từ khóa tự động. README của quality đã chỉ ra vi-018 ("accepting") và en-015 ("tán thành") là dùng từ đồng nghĩa. AI phân xử còn 4 / 0 lỗi; chưa có người duyệt.

Phát hiện:

1. **Batch có padding làm hỏng output**: câu ngắn bị thêm `!`, `!!`, `!!!`. Phải dịch từng segment một.
2. **Mức giữ 100% dựa vào danh sách thuật ngữ cho sẵn của fixture.** Chỉ dùng regex: 74,3% (vi→en) và 63,2% (en→vi); mọi ca hụt đều là tên người hoặc tên phần mềm. Thiết kế cần danh sách thuật ngữ thật từ resource: tên người liên quan, tên phần mềm trong Catalog.
3. Model làm hỏng placeholder (`x0>`, `<x2`) ở 18/80 segment vi→en và 7/79 segment en→vi. Tỷ lệ tăng theo số placeholder trong segment. Bước sửa placeholder chưa đo.
4. **Thoái hóa sớm hơn 512 token nhiều**: vi→en lặp từ khoảng 190 token; en→vi mất nội dung từ 450 token. Đề xuất giới hạn segment 128 token, tách theo dấu phẩy.
5. Glossary có tác dụng phụ (_phòng_ = room hay department; chia động từ tiếng Anh). Tiếng Việt không dấu vẫn sai nặng.
6. Lỗi nặng còn lại ở chế độ bảo vệ:
   - "Đã duyệt…" → "Browseed…" (vi-017);
   - "tôi duyệt ngay" → "I immediately did the review" (vi-019);
   - mất phủ định/từ chối ở câu không dấu (vi-069, vi-070).

**Ngưỡng đề xuất** (Sonnet E soạn, coordinator giữ nguyên ý; Owner/dev chốt):

| Mã  | Ngưỡng                                                                                                                        | Hiện trạng                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| T1  | Thuật ngữ được bảo vệ giữ 100%, nếu không thì trả bản gốc                                                                     | Đạt khi có danh sách; cơ chế cổng có                                                      |
| T2  | 0 ca mất cực tính không báo trên gold set do người duyệt; thêm kiểm dấu hiệu cực tính, thiếu thì trả bản gốc                  | 3.8.1: flag tự động 5 / 1 (AI phân xử 4 / 0). 4.3.1: xem _Vòng cuối_ — vi→en **chưa đạt** |
| T3  | Luôn hiện bản gốc cạnh bản dịch                                                                                               | Thiết kế                                                                                  |
| T4  | Segment ≤ 128 token, tách theo dấu phẩy; 512 chỉ là trần cứng                                                                 | Chưa hiện thực                                                                            |
| T5  | Segment trả bản gốc ≤ 15%                                                                                                     | **vi→en 20,7%**; en→vi 8,0%                                                               |
| T6  | chrF chỉ dùng làm cảnh báo regression (36,6 / 40,9, dung sai −2)                                                              | Baseline                                                                                  |
| T7  | p95 < 3 s mỗi trường; khoảng 0,6–0,8 GiB mỗi tiến trình                                                                       | Xem kết quả runtime                                                                       |
| T8  | Chạy lại benchmark + người duyệt các câu cực tính/glossary trước khi bật và sau mỗi lần đổi model/thư viện/glossary/segmenter | Quy trình                                                                                 |

Bảng trên là **baseline 3.8.1** (14/10/2026). Mục dưới là vòng 4.3.1; baseline được giữ nguyên, kết quả không ghi đè lên nhau.

### Vòng cuối trên 4.3.1 (15/10/2026)

Sonnet A viết; coordinator (Opus) kiểm lại. [spike/quality](spike/quality/README.md), kết quả `results/2026-10-14-4.3.1b-*.json`.

**Cấu hình:**

- `@huggingface/transformers` 4.3.1, ORT 1.30.0, sharp 0.35.5, tokenizers 0.2.0; lockfile `1492a4ed…`; model q8 với revision đã pin.
- **Adapter:** `lib/generate-adapter.mjs`.
  - Tra id token ngôn ngữ từ vocab và kiểm decode, không hardcode; fail closed khi giả định không đúng.
  - Gọi `model.generate` với `forced_eos_token_id: null`. Nếu không, output bị cắt do `max_new_tokens` vẫn kết thúc bằng EOS, vì `generation_config` của cả hai model có `forced_eos_token_id: 0` — phát hiện mới của vòng này.
  - `finishReason` phân biệt `eos`, `max_new_tokens` và `stopped`.
- **Guard:**
  - Segment ≤ 128 token nguồn đo bằng tokenizer thật, tách theo mệnh đề, không cắt placeholder.
  - Cổng cực tính dùng lexicon riêng, không đọc fixture.
  - Fallback **cả trường**, trả đúng chuỗi gốc.
  - Ngày giữ nguyên văn.
- **Thứ tự chạy:** tập held-out mới (54 vi→en, 51 en→vi; Jaccard từ < 0,6 so với tập chính) được viết và đóng băng trước khi chạy.
  - Lần chạy 1 lộ ra 2 lỗi implementation ở lexicon: "revocation" không khớp, và "not allowed" bị xếp vào nhóm từ chối.
  - Đã sửa kèm test hồi quy, đóng băng lại (`freeze-4.3.1b.json`, `--check` OK) và chạy lại; giữ cả kết quả lần 1.
  - Không chỉnh guard vì lý do nào khác sau khi xem kết quả.
- **Coordinator kiểm lại:**
  - `node --test`: 159 pass, 3 skip.
  - `SPIKE_REAL=1` cho `generate-adapter.test.mjs`: 22/22.
  - Freeze check OK.
  - Số trường đã dịch khớp file kết quả.

**Kết quả chế độ bảo vệ** (trường = một field):

| Tập / chiều         | Đã dịch    | Fallback cả trường (placeholder / cực tính / quá dài / chạm `max_new_tokens`) | chrF (chỉ trường đã dịch) | p50 / p95 mỗi trường |
| ------------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------- | -------------------- |
| Chính vi→en (84)    | 57 (67,9%) | 27 (18 / 8 / 0 / 1)                                                           | 63,9                      | 1015 / 3103 ms       |
| Chính en→vi (84)    | 70 (83,3%) | 14 (13 / 1 / 0 / 0)                                                           | 66,0                      | 999 / 2611 ms        |
| Held-out vi→en (54) | 37 (68,5%) | 17 (6 / 10 / 0 / 1)                                                           | 59,6                      | 985 / 2212 ms        |
| Held-out en→vi (51) | 33 (64,7%) | 18 (10 / 8 / 0 / 0)                                                           | 63,5                      | 888 / 2895 ms        |

- Thuật ngữ được bảo vệ giữ 100% ở các trường đã dịch. Con số này vẫn dựa vào danh sách thuật ngữ cho sẵn của fixture.
- Raw trên cùng adapter: 26–40 flag tự động trong 51–83 trường; giữ thuật ngữ 33% (vi→en) và 16% (en→vi).
- Latency dao động tới 1,8 lần giữa hai lần chạy cùng code vì host dùng chung; chỉ mang tính chỉ báo.

**Ba lớp đánh giá lỗi** (tách riêng, không có lớp nào là duyệt của người):

1. **Flag tự động** (từ khóa của fixture, chỉ trên trường đã dịch): 1/57, 3/70, 2/37, 2/33 = 8 flag (`results/flags-4.3.1.json`).
2. **AI phân xử 8 flag** (coordinator Opus, một người phân xử):
   - **2 lỗi nghiêm trọng:**
     - h-vi-024: "bị bác" → "uncleed", mất ý từ chối. Cổng cực tính không bắt vì "bác" không có trong lexicon.
     - en-040: "license" → "bằng lái".
   - 2 lỗi giảm chất lượng, không đổi ý: h-vi-033, en-050.
   - 4 flag giả do dùng từ đồng nghĩa: vi-018 "accepting", en-015 "tán thành", h-en-018 "cho phép", h-en-025 "không thể chấp nhận".
3. **AI đọc toàn bộ trường đã dịch của tập held-out** (Opus, kể cả trường không bị flag, để thấy lỗi mà từ khóa không bắt):

   | Chiều                     | Lỗi nghiêm trọng (đổi nghĩa / mất ý chính)                                                                                                                             | Lỗi nghĩa đáng kể                                                                                                                                           | Mất cực tính |
   | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
   | vi→en (37 trường đã dịch) | 3: h-vi-024 (mất từ chối); h-vi-009 (model trả `<x0>=*`, mất "Marketing" — cổng placeholder vẫn cho qua); h-vi-019 ("từ chối báo giá" → "refuse to report the prices") | 5: h-vi-027, h-vi-034, h-vi-039, h-vi-042 (điều kiện giảm giá đổi), h-vi-050                                                                                | 1            |
   | en→vi (33 trường đã dịch) | 0                                                                                                                                                                      | 4: h-en-005 ("billing portal" → "cổng dự phòng"), h-en-007 ("subscription" → "tờ báo"), h-en-030 ("API key" → câu vô nghĩa), h-en-036 ("Invoice" → "Inice") | 0            |

   Người duyệt: **chưa có.** Bản tham chiếu và lexicon đều do AI soạn.

**Kết luận chất lượng — kết quả âm tính có bằng chứng:**

- **vi→en: không đạt.**
  - 31–32% trường phải trả bản gốc.
  - Trong số trường đã dịch của held-out vẫn có 3 lỗi nghiêm trọng (8%) và 5 lỗi nghĩa đáng kể.
  - Có dạng lỗi mất nội dung mà mọi cổng hiện có đều không bắt được.
- **en→vi: chưa đạt để bật.**
  - Không thấy mất cực tính ở các trường đã dịch.
  - Lỗi thuật ngữ/danh từ (license, subscription, billing portal, API key) vẫn lọt qua ở khoảng 12% trường đã dịch của held-out.
  - Fallback 17% (tập chính) đến 35% (held-out).
- Cổng làm giảm mạnh lỗi so với raw (raw có 26–40 flag), nhưng phải đổi lấy tỷ lệ trả bản gốc cao.
- Heuristic cực tính chỉ hỗ trợ phát hiện, không bảo đảm giữ nghĩa.
- Đề xuất: giữ tính năng **disabled/pending**. Chỉ bật en→vi dưới dạng "bản dịch tham khảo" khi Owner/dev chấp nhận lỗi thuật ngữ còn lại sau khi người duyệt gold set. Không tự bật, không đổi model/provider, không hạ ngưỡng.

## T-6 — Toàn vẹn, offline, đóng gói

- **Hash** (Opus B):
  - Nguồn: HF API `GET /api/models/{id}/tree/{rev}?recursive=true` và `/revision/{rev}`. Revision trả về đúng commit đã pin: vi-en `541dfd72ec07e8f1563795e0224408ad8d729e80`, en-vi `30bcd461c0d7338ad106b36314d3eedc2d4e998c`.
  - Kết quả: **16/16 file khớp**. File ONNX khớp theo LFS sha256, file nhỏ theo git blob SHA-1 cộng kích thước; khớp cả `manifest.json` local.
  - Bảo đảm: byte trùng với những gì Xenova đã commit tại revision, độc lập với script tải.
  - Không bảo đảm: vẫn tin HF API qua TLS; không chứng minh nội dung lành tính hay bản convert trung thành với Helsinki-NLP.
  - `manifest.json` hiện do downloader tự tính sau khi tải, nên chỉ là trust-on-first-use. Đề xuất commit file **lock hash kỳ vọng** (spec).
- **ONNX sha256 kỳ vọng:**

  | Model | Encoder                                                            | Decoder merged                                                     |
  | ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
  | vi-en | `fa7bd78e8bed6bdc03728f62f1592c4bb52d9e12795496604c1e990e102abdb2` | `540edbcc08bab0b42c03576a759fd9b4d5fc99996ac3178630733916dc2325cb` |
  | en-vi | `dfcd7a32be3fdd21cbcf5d354520d626f1768fd6e205ca62a6a11a4641d31f36` | `1cfc6a84f9c189e6928c9710b281fae3f1f42d4ffbba109e7b4ec8e31ceb06dd` |

- **License theo artifact** (kiểm 15/10/2026, chỉ dùng nguồn chính thức; đây là bảng thông tin, không phải ý kiến pháp lý):

  | Artifact                                                                                              | License đã khai                                                     | Nguồn                                                                                      | Điểm chưa xác minh / cần làm                                                                                                                          |
  | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Weights gốc Helsinki-NLP `opus-mt-vi-en` (HF sha hiện tại `c8d2853e…`), `opus-mt-en-vi` (`989c9fb9…`) | Model card: `apache-2.0`                                            | HF API `cardData.license`, [model card](https://huggingface.co/Helsinki-NLP/opus-mt-vi-en) | README [OPUS-MT-train](https://github.com/Helsinki-NLP/OPUS-MT-train) lại ghi model phát hành theo **CC-BY 4.0**: hai nguồn chính thức khai khác nhau |
  | Bản convert ONNX Xenova `opus-mt-vi-en` @`541dfd72…`, `opus-mt-en-vi` @`30bcd461…` (đang dùng)        | **Không khai** (`cardData` không có license; chỉ có `base_model`)   | HF API                                                                                     | Không biết Xenova convert từ revision nào của Helsinki-NLP; quyền phân phối lại bản convert theo license gốc                                          |
  | Dữ liệu huấn luyện Tatoeba-Challenge                                                                  | Training: **CC-BY-NC-SA 4.0**; test/dev: CC-BY 2.0 FR               | [Tatoeba-Challenge README](https://github.com/Helsinki-NLP/Tatoeba-Challenge#license)      | Điều kiện của dữ liệu có ràng buộc tới weights hay không là câu hỏi pháp lý; **không** tự suy ra "weights bị cấm thương mại"                          |
  | Code OPUS-MT-train                                                                                    | MIT                                                                 | Repo                                                                                       | Không dùng trong runtime                                                                                                                              |
  | `@huggingface/transformers` 4.3.1, `@huggingface/tokenizers` 0.2.0                                    | Apache-2.0                                                          | `package.json` của gói đã cài                                                              | NOTICE theo Apache-2.0                                                                                                                                |
  | `@huggingface/jinja` 0.5.10, `adm-zip` 0.6.1                                                          | MIT                                                                 | Như trên                                                                                   | —                                                                                                                                                     |
  | `onnxruntime-node`/`-common` 1.30.0                                                                   | MIT                                                                 | Như trên                                                                                   | Bản ORT native kèm third-party notices — chưa liệt kê                                                                                                 |
  | `global-agent` 4.1.3                                                                                  | BSD-3-Clause                                                        | Như trên                                                                                   | Chỉ install script dùng                                                                                                                               |
  | `sharp` 0.35.5                                                                                        | Apache-2.0                                                          | Như trên                                                                                   | —                                                                                                                                                     |
  | `@img/sharp-libvips-linux-x64` 1.3.4; `@img/sharp-win32-x64` 0.35.5                                   | **LGPL-3.0-or-later** (libvips); `Apache-2.0 AND LGPL-3.0-or-later` | `npm view`, `package.json`                                                                 | Thư viện LGPL nằm trong image dù tính năng không dùng ảnh: cần notice LGPL và đánh giá nghĩa vụ phân phối                                             |
  - Notice dự kiến: attribution Helsinki-NLP/OPUS-MT và trích dẫn Tiedemann 2020 (Tatoeba-Challenge yêu cầu khi dùng "data and models"); Apache-2.0 NOTICE cho transformers.js/tokenizers; LGPL-3.0 cho libvips; MIT/BSD cho các gói còn lại.
  - Người phụ trách license cần xem:
    1. license nào áp cho weights (apache-2.0 hay CC-BY 4.0) và cho bản convert Xenova;
    2. ảnh hưởng của CC-BY-NC-SA của dữ liệu huấn luyện khi doanh nghiệp dùng thương mại;
    3. nghĩa vụ LGPL khi đóng gói libvips.
  - Phân loại "không phải tính năng AI" của Owner không xác nhận hay miễn các điểm này.

- **Offline:**
  - Mạng trong transformers chỉ đi qua `getFile → fetch`, chặn bởi `allowRemoteModels`.
  - FS cache được đọc **trước** đường dẫn local, không kiểm traversal, và nằm trong `node_modules`, nên `useFSCache=false` là bắt buộc.
  - Bằng chứng:
    - Tripwire `globalThis.fetch` và `env.fetch` đếm 0 lần ở mọi lần chạy.
    - Container `--network none` chạy dưới user `node` dịch được cả hai chiều.
    - fetch tới huggingface.co trong container báo EAI_AGAIN.
- **Đóng gói:**
  - `.dockerignore` không loại `.models`: build context khoảng 205 MB, so với 0,75 MB nếu loại. Model không vào layer vì Dockerfile chỉ COPY đường dẫn cụ thể.
  - Đề xuất: build stage riêng tải và kiểm theo lock; runtime COPY với quyền root, file 0444 và thư mục 0555; thêm `.models` vào `.dockerignore`.
  - Chưa build Dockerfile product trong spike.

## Contract và nguồn (Opus A)

- RFC 9110 §12.4.1 cho phép server bỏ qua header và trả mặc định thay vì 406. §12.4.2: q=0 nghĩa là "not acceptable". §12.4.3: ngôn ngữ không được nhắc tới là không chấp nhận, trừ khi có wildcard. §12.5.4: thứ tự trong header không đáng tin. §8.5: `Content-Language` có thể liệt kê nhiều ngôn ngữ, hoặc bỏ khi không biết.
- RFC 4647 §3.4 lookup cắt dần từ cuối (`en-US` → `en`).
- RFC 5646: `mul`/`und` không đặt trong header.
- RFC 9111 §5.2.2.5: `no-store` áp cho cả cache riêng và cache chung.
- Node 24 nối các dòng header trùng thành một danh sách; `maxHeaderSize` 16384.
- Thuật toán, bảng 32 header và bảng sự thật nằm ở [spec](spec.md#accept-language). Đề xuất đồng bộ nguồn ở [source-sync](source-sync.md).

## Bảng khép finding

| Finding | Đã làm                                                                                                                             | Còn mở                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| T-1     | Tái hiện audit; ma trận 3.8.1/4.3.1/A1 trên Windows và Linux; tìm và xác minh regression `>>vie<<` cùng cách khắc phục             | PR riêng đổi lockfile; chạy lại benchmark chất lượng trên 4.3.1; golden parity |
| T-2     | Xác minh ORT đồng bộ, không có `terminate`, worker thread làm chết process; thiết kế tiến trình con + state machine; spike runtime | Xem _Kết quả runtime_; gate trước implement                                    |
| T-3     | Default `vi` (cả policy q=0), trả bản gốc, bộ trạng thái mới, bảng sự thật, header — trong spec                                    | Dev review contract cùng G5                                                    |
| T-4     | Mã ngôn ngữ do người viết khai báo; người đọc chọn lại nguồn khi khai sai                                                          | Giá trị `mul` chờ Owner; Logical G5                                            |
| T-5     | Single-flight, cache HMAC có giới hạn byte, quyền trước cache/join; spike runtime có test                                          | Dev review                                                                     |
| T-6     | Runner + fixture + evidence được track; 16/16 hash khớp nguồn công bố; offline thật trong container                                | Lock hash kỳ vọng và build stage chưa hiện thực; license                       |
| T-7     | Bỏ `QĐ-71`; `QĐ-74` còn trống; đề xuất P1–P7; Owner chốt dịch máy không là tính năng AI theo 6.4                                   | Docs ghi sổ; ngưỡng chất lượng                                                 |

## Kết quả runtime

Sonnet D; [spike/runtime](spike/runtime/README.md), evidence trong `spike/runtime/evidence/`.

**Cấu hình đo:**

- `@huggingface/transformers` 4.3.1 + override bỏ `onnxruntime-web` (ORT 1.30.0, sharp 0.35.5), `--ignore-scripts`.
- Tiến trình con dùng đường `model.generate` có chèn id token ngôn ngữ, tự kiểm khi khởi động, dịch từng segment (batch 1).
- Linux: `node:24-bookworm-slim`, `--network none`, user `node`, `--cpus=2 --memory=2g`, model `:ro`, mỗi kịch bản một container. Windows chỉ chạy profile rút gọn.

**Coordinator đã kiểm lại:**

- `node --test "test/*.test.mjs"`: 94 pass, 5 skip (ca model thật), 0 fail.
- `SPIKE_REAL=1` trên 4.3.1, Windows: 5/5 ca model thật pass.
- Số latency và SIGKILL khớp file evidence Linux.
- D báo 99/99 trong container Linux.

| #   | Tiêu chí (Opus B đề xuất)                  | Kết quả Linux                                                                                                                                                                                                                       | Kết luận                                      |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Inference đang chạy ≤ N                    | Sampler `/proc` tối đa 1 tiến trình con trong 589 mẫu. Log sự kiện: 0 vi phạm / 207 sự kiện, gồm 10 lần SIGKILL từ ngoài. Kill/respawn: tối đa 1 con                                                                                | Đạt với N=1. N=2 với model thật **chưa chạy** |
| 2   | `/health` 20 Hz: p99 < 50 ms, max < 200 ms | Tiến trình con: nạp lạnh p50 0,9–1,7 ms, max 21–78 ms; bão hòa max 52–58 ms (một lần host nhiễu 1251 ms). Nạp model trong process API: p50 188–323 ms, max 2,0–2,8 s                                                                | Đạt (trừ một lần nhiễu)                       |
| 3   | Event loop API: p99 < 20 ms, max < 100 ms  | Tiến trình con: p99 ≈ 11 ms, max 39–79 ms. Trong process: p99 445–1751 ms                                                                                                                                                           | Đạt; event loop của tiến trình con chưa đo    |
| 4   | RSS                                        | API +2 MB (in-process +800 MB). Tiến trình con 526 MB (vi-en), 838 MB (cả hai chiều; HWM 846). 1000 việc: 858 → 917 MB, HWM phẳng từ việc 100. 20 lần kill: API +2,2 MB. `memory.peak` 500–1081 MB                                  | Đạt                                           |
| 5   | Số luồng                                   | 18 luồng (intra 1) / 20 luồng (intra 2). Với 2 CPU, intra 2 không nhanh hơn: 1000 ký tự p50 5,6 s so với 4,6 s                                                                                                                      | Đạt; đề xuất `THREADS=1`                      |
| 6   | Vượt deadline, kill, giải phóng slot       | Criterion trong con: vượt p50 18 ms, p95 42, max 53 ms. Bước decode dài nhất 207–214 ms, nên grace 3000 ms ≥ 2× bước dài nhất. Kill → exit p50 38 ms, max 46 ms. Spawn lại 6–9 ms sau `exit`. Kết quả chạm deadline không vào cache | Đạt                                           |
| 7   | Latency                                    | Bảng dưới                                                                                                                                                                                                                           | Đo được                                       |
| 8   | Nạp lạnh qua 5 lần spawn                   | Nạp vi-en p50 1,8 s (1,26–2,14 s), en-vi p50 1,5 s (0,96–2,9 s). Request đầu tiên tính từ đầu đến cuối p50 2,9 s, max 3,46 s                                                                                                        | Đạt (< 10 s)                                  |
| 9   | SIGTERM khi đang dịch                      | Thoát code 0 sau 48–66 ms (808 ms nếu đang nạp lạnh); tiến trình con thoát 0, không mồ côi                                                                                                                                          | Đạt                                           |
| 10  | SIGKILL từ ngoài: caller settle < 100 ms   | p50 24 ms; **9/10 dưới 100 ms, max 103 ms**. Breaker mở ở lần thứ 3; lần gọi kế trả `UNAVAILABLE` trong 0,9 ms. Windows 10/10 (max 75 ms)                                                                                           | **Không đạt** tiêu chí chặt; phần còn lại đạt |

Latency trên Linux, 2 CPU, batch 1, segment cỡ câu. Concurrency 2 nghĩa là hai tiến trình con dùng chung 2 CPU.

| Ký tự | Chiều | Concurrency 1: p50 / p95 / vừa 10 s | Concurrency 2: p50 / p95 / vừa 10 s |
| ----- | ----- | ----------------------------------- | ----------------------------------- |
| 200   | vi→en | 1,6 / 2,2 s / 10/10                 | 2,2 / 2,5 s / 10/10                 |
| 200   | en→vi | 1,7 / 2,0 s / 10/10                 | 2,6 / 3,1 s / 10/10                 |
| 1000  | vi→en | 6,1 / 6,4 s / 8/8                   | 9,0 / 10,0 s / 8/8                  |
| 1000  | en→vi | 6,9 / 7,3 s / 8/8                   | 10,6 / 11,1 s / **2/8**             |
| 4000  | vi→en | 24,5 / 25,3 s / 0/6                 | 36,7 / 37,3 s / 0/6                 |
| 4000  | en→vi | 27,2 / 27,8 s / 0/6                 | 40,5 / 41,3 s / 0/6                 |

**Rút ra cho spec:**

1. Phải dùng tiến trình con. Nạp model trong process API làm `/health` và event loop nghẽn tới giây.
2. 4000 ký tự không bao giờ vừa 10 s, nên hạ `TRANSLATION_MAX_CHARS` xuống 1000 với concurrency 1 trên 2 CPU. Đề xuất T7 "p95 < 3 s mỗi trường" chỉ đạt với trường khoảng 200 ký tự; Owner/dev chọn giữa trần ký tự và mục tiêu thời gian.
3. Concurrency 2 trên 2 CPU không tăng thông lượng mà làm chậm từng việc; RAM khoảng 1,9 GB cho hai tiến trình đủ hai chiều.
4. Cửa sổ tính toán của spike tính cả spawn và nạp model (1,3–2,2 s, có lần 6,6 s trên Windows). Spec chốt lại: đồng hồ tính toán chỉ chạy từ lúc giao `run` cho con đã `READY`; nạp model giới hạn bằng `LOAD_TIMEOUT` và vẫn nằm trong deadline trả lời của caller.
5. Output bị cắt do chạm `max_new_tokens` chưa được spike nhận diện là chưa xong. Spec yêu cầu coi là thất bại của segment.
6. Breaker tách theo chiều dịch; cache hit vẫn được phục vụ khi breaker `OPEN`. Chấp nhận được vì cache chỉ chứa kết quả thành công và chỉ tra sau khi kiểm quyền.
7. Supervisor gửi `cancel` ngay ở deadline tính toán, ngoài việc con tự dừng. Sau `cancel`, kill timer được đặt lại thành `cancel + grace`.
8. Các outlier của `/health` (40–80 ms) trùng với lúc CFS throttling. Một lần max 1251 ms xảy ra khi host đang chạy nhiều agent khác. Chưa thử `--cpuset-cpus`.

**Chưa làm:**

- Cổng sha256 theo lock trong tiến trình con.
- Event loop của tiến trình con.
- Hai tiến trình con thật đủ hai chiều.
- SIGTERM trên Windows.

### Vòng sửa 15/10/2026 (Sonnet B, coordinator kiểm)

**Cấu hình:**

- Worker dùng adapter chung `spike/quality/lib/generate-adapter.mjs` (đọc, không sửa), qua `forced_eos_token_id: null`, kiểm lock trước khi import thư viện.
- Linux: `node:24-bookworm-slim`, `--cpus=2 --memory=2g --memory-swap=2g --network none`, user `node`, model và `spike/` mount `:ro`.
- Volume deps `spike-runtime-deps` mount `:ro`, đã kiểm `@huggingface/transformers` 4.3.1 và lockfile `1492a4ed…`, không sửa.
- Mọi container chạy `--rm` và có label `spike.run`/`spike.owner`. Sau khi chạy, `docker ps -a --filter label=spike.owner=translation-runtime` trống; không tạo volume mới.

**Test:**

- Fake: 188 test = 180 pass + 8 skip.
- `SPIKE_REAL=1` trên Windows: 188/188. Linux container: 188/188 (lần đầu 178/188 vì `run-linux.sh` lưu CRLF; đã đổi sang LF; log lỗi giữ lại).
- Coordinator chạy lại suite fake 5 lần: 4 lần 180/0, **1 lần 178 pass / 2 fail**. Lần đó không lưu tên test. ⟹ Có test phụ thuộc thời gian bị flaky; chưa xác định là test nào, cần sửa trước khi dùng làm gate.

| Hạng mục (finding)      | Kết quả thực chạy                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-3 spawn lỗi           | 11 test fake (throw đồng bộ, error không có exit, error rồi exit, error trên child sống, kill bị throw, settle một lần, hàng đợi tiếp tục, drain). Linux thật: sai đường dẫn exec/cwd ⟹ `UNAVAILABLE/spawn-failed` trong 8–42 ms, 0 worker sống, breaker mở ở lần thứ 3; thiếu script ⟹ `crash` trong 53–68 ms; 0 vi phạm log |
| V-4 đồng hồ             | `computeMaxMs` 1500 ms, 5 lần nạp lạnh: spawn → nạp xong mất 3887–4366 ms, cả 5 đều OK, 0 kill. Deadline trả lời trong lúc nạp: caller hết giờ sau khoảng 715 ms, việc bị hủy, chưa gửi `run`, request kế tiếp OK. Trường tổng hợp trong JSON evidence `clock` bị sai (bug đã sửa sau đó); giá trị từng lần đo đúng           |
| Truncation              | Test model thật `max_new_tokens=3` ⟹ `max_new_tokens`, không coi là DONE. Bỏ override `forced_eos_token_id` thì test này fail (lập luận từ code adapter, không sửa adapter để thử)                                                                                                                                            |
| Hook ngắt kết nối       | 8 test socket thật; đổi sang hook `req` thì 6/8 fail (mutation)                                                                                                                                                                                                                                                               |
| Nguồn hiệu lực          | 10 test (`storedSource`, `sourceOverride`, lối tắt, key cache, `textLanguage` null khi tranh chấp)                                                                                                                                                                                                                            |
| Lock                    | 14 unit test (gồm symlink/junction thật trên Windows). Thư mục thật: 16 file / 213.353.376 byte, 0,85–0,95 s. Bản copy bị sửa ⟹ `MODEL_LOCK_MISMATCH` trước khi nạp/chạy                                                                                                                                                      |
| Chi phí lock trên Linux | 1,6–1,85 s mỗi chiều (bind mount, 2 CPU). Nạp lạnh vi-en p50 4116 ms, en-vi p50 3804 ms, request đầu p50 5620 ms — chậm khoảng 2,3 lần so với 14/10                                                                                                                                                                           |
| Vượt deadline           | 40/40 lần chạm deadline: vượt p50 13 ms, p95 38 ms, max 68 ms; 0 kill                                                                                                                                                                                                                                                         |
| SIGKILL từ ngoài        | Giá trị từng lần (ms): 35, 43, 43, 32, 33, 31, 29, 38, 70, 36 ⟹ 10/10 dưới 100 ms, max 70                                                                                                                                                                                                                                     |

**Phương pháp đo SIGKILL:**

- `tKill` và `tSettle` là `Date.now()` ở orchestrator, quanh lệnh kill và lúc caller nhận HTTP response. Mốc phía API tách thành: kill → sự kiện `exit` (28–69 ms), `exit` → settle (0–1 ms), settle → client (0–1 ms).
- Mỗi lần đo có ghi delta cgroup `cpu.stat`, loadavg và event loop. CFS throttling bằng 0 ở 9/10 lần; lần 70 ms có 1 chu kỳ bị throttle.
- 14/10 có một lần 103 ms trong 10 lần. 15/10 không lặp lại, nhưng n=10 không đủ để kết luận về đuôi phân phối.
- **Đề xuất SLO cho reviewer** (không phải PASS tự xác nhận): p99 < 100 ms đo trên ≥ 100 lần kill, máy chạy test riêng hoặc `--cpuset-cpus` cố định. Tiêu chí hiện tại giữ nguyên 100 ms; chưa đề xuất đổi kiến trúc chỉ vì chênh 3 ms trên host dùng chung.

**Dùng lại evidence 14/10, không chạy lại:** latency, saturation, health so sánh, longrun, threads, SIGTERM, kill cycles, kill exit, các bench win32.

**Chưa chứng minh:**

- Concurrency 2 với model thật trong giới hạn 2 GiB.
- Chi phí lock trên ổ Linux native.
- TOCTOU giữa kiểm lock và lúc thư viện mở file.
- Worker còn sống nhưng không kill được sẽ giữ slot và chặn shutdown. Đây là phía an toàn; có sự kiện `exitWaitExpired`.
- `bench/inproc.mjs` còn dùng đường generate cũ (chỉ là baseline).

**Sự cố trong phiên 14/10:** D đã chạy `taskkill //F //IM node.exe` trên host Windows khi gỡ một test bị treo. Lệnh này có thể đã dừng các tiến trình node khác đang chạy cùng lúc, kể cả của agent khác. Không có file product nào bị ảnh hưởng.

## Xử lý review spike (V-1 → V-5)

Nguồn: [translation spike review](../../../reviews/dynamic-content-translation-2026-10-15/spike-review.md). Coordinator đã tái hiện từng điểm trên code trước khi giao sửa.

| Finding                                             | Disposition                              | Bằng chứng / còn lại                                                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-1 chất lượng chưa chạy trên cấu hình cuối         | **fixed/verified**                       | Adapter 4.3.1, 128 token, cổng cực tính, held-out đóng băng; chạy đủ 168 + 105 câu. Kết quả **âm tính** (mục _Vòng cuối trên 4.3.1_)                                                                                |
| V-2 fallback trộn ngôn ngữ, ngày bị bản địa hóa     | **fixed/verified**                       | Fallback cả trường, trả đúng chuỗi gốc; bỏ bản địa hóa ngày; test cũ khẳng định output trộn đã đổi trước và thấy fail                                                                                               |
| V-3 spawn lỗi giữ slot / treo shutdown              | **fixed/verified**                       | Test fake + chạy thật trên Linux; còn một test flaky chưa xác định                                                                                                                                                  |
| V-4 đồng hồ, truncation, hook, nguồn hiệu lực, lock | **fixed/verified** (spike)               | Đồng hồ tính từ `run`; `forced_eos_token_id: null`; hook `res` `close`; nguồn hiệu lực; lock probe. Còn mở: lock kiểm một lần hay mỗi lần respawn (chi phí nạp lạnh); TOCTOU — **external gate** cho implementation |
| V-5 flag và license                                 | **fixed** (tài liệu) / **external gate** | Tách flag tự động, AI phân xử, người duyệt (chưa có); bảng license theo artifact. Quyết định license, gold set do người duyệt, `mul` và ngưỡng chất lượng: Owner/dev                                                |
| An toàn chạy spike                                  | **fixed**                                | `run-linux.sh` dùng run id/label, từ chối ghi đè, không xóa `spike-runtime-deps`; không kill theo tên; cleanup chỉ tài nguyên có label                                                                              |

## Chưa kiểm chứng

- Build Dockerfile product với 4.3.1; `pnpm check` và test Nest trên 4.3.1.
- Benchmark chất lượng đầy đủ trên 4.3.1; gold set do người duyệt; người dùng thật.
- arm64/musl/GPU; các bản 4.0.0 → 4.3.0; bản sau 4.3.1 có sửa tokenizer không.
- Phương án C (token parity); bước sửa placeholder; tách theo dấu phẩy.
- Chất lượng Google/DeepL (không gọi dịch vụ trả phí).

## Nguồn

- Advisory sharp ở bảng T-1. [pnpm dependency resolution](https://pnpm.io/settings).
- Transformers.js: [custom models](https://huggingface.co/docs/transformers.js/custom_usage), [env API](https://huggingface.co/docs/transformers.js/api/env), [package.json](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/package.json).
- Node.js: [worker_threads](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html), [child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html).
- RFC: [9110](https://www.rfc-editor.org/rfc/rfc9110), [9111](https://www.rfc-editor.org/rfc/rfc9111), [4647](https://www.rfc-editor.org/rfc/rfc4647), [5646](https://www.rfc-editor.org/rfc/rfc5646).
- Google: [pricing](https://cloud.google.com/translate/pricing?hl=de), [data usage](https://docs.cloud.google.com/translate/data-usage), [quotas](https://docs.cloud.google.com/translate/quotas). DeepL: [languages](https://developers.deepl.com/docs/getting-started/supported-languages), [usage limits](https://developers.deepl.com/docs/resources/usage-limits), [data security](https://www.deepl.com/en/pro-data-security).
- Model: [Xenova/opus-mt-vi-en](https://huggingface.co/Xenova/opus-mt-vi-en), [Xenova/opus-mt-en-vi](https://huggingface.co/Xenova/opus-mt-en-vi), [Helsinki-NLP/opus-mt-vi-en](https://huggingface.co/Helsinki-NLP/opus-mt-vi-en), [Helsinki-NLP/opus-mt-en-vi](https://huggingface.co/Helsinki-NLP/opus-mt-en-vi), [Tatoeba-Challenge](https://github.com/Helsinki-NLP/Tatoeba-Challenge).
