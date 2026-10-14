# Review kết thúc nghiên cứu dịch EN–VI — 15/10/2026

Review spike ban đầu: [spike-review.md](spike-review.md).

Đối chiếu prompt `PROMPT_CLAUDE_FINALIZE_TRANSLATION_SPIKE_2026-10-14.md`, báo cáo Owner gửi,
[research](../../workspace/items/dynamic-content-translation/research.md), spec/plan/test-plan và artifact spike.
BE HEAD `a8ba88fd81581000ade8b84f1c1d3b4583c3d3e1`; artifact mới chưa commit.

## Kết luận và quyết định Owner

**Phần nghiên cứu chất lượng đã hoàn thành với kết quả âm tính.** Claude đã xử lý đúng phần lớn
V-1–V-5, chạy benchmark trên cấu hình 4.3.1 cuối và ghi rõ chưa có người duyệt gold set.
Không cần một vòng tối ưu model hoặc nghiên cứu provider khác để kết thúc task này.

**Owner xác nhận trong phiên review ngày 15/10/2026: giữ pending, chưa implement; ưu tiên G1/remediation.**
Đây là quyết định thực tế, thay cho cách viết "đề xuất giữ pending" trong draft đang có.
Không có route dịch product hiện hữu cần đặt biến môi trường disabled. Không tự bật riêng en→vi.

Còn một lỗi cụ thể ở tổ hợp coordinator/circuit breaker trong spike và một lần suite fail chưa có
nguyên nhân. Giao một lượt khép nhỏ cho artifact bàn giao, không coi các việc này hay license/mul/
G5 là blocker của G1. Chưa thể nói mọi code spike đã verified ổn định chỉ vì vài lần chạy xanh.

## Kiểm chứng trong phiên này

| Phép kiểm                                                                                                           | Kết quả / ranh giới                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Quality helper suite, reviewer độc lập chạy `node --test`                                                           | 162 test: 159 pass, 3 model thật skip, 0 fail                                                                                  |
| `node tools/freeze-431.mjs --check --tag 4.3.1b`                                                                    | Reviewer và coordinator chạy: OK, library/fixture hiện tại khớp freeze cuối                                                    |
| Đối chiếu 8 file JSON kết quả 4.3.1b                                                                                | Hash library khớp freeze; số translated/fallback và reason breakdown khớp research                                             |
| Runtime full fake suite, coordinator chạy `node --test --test-timeout=30000 --test-reporter=spec "test/*.test.mjs"` | 188 test: 170 pass, 18 skip, 0 fail. 8 skip model thật; 10 runner test skip vì Bash không khả dụng trong môi trường review     |
| Reviewer runtime chạy targeted spawn/run-job/shared-adapter tests                                                   | 46 test: 44 pass, 2 real-model skip, 0 fail                                                                                    |
| `pnpm rules:check`, `pnpm rules:format`                                                                             | Exit 0; checker 59 file, 441 link, 0 lỗi trong phạm vi quy định                                                                |
| Docs/source-sync                                                                                                    | Docs HEAD `3341ea03fd3355d19d1a234931463d75be887af0`, status sạch lúc kiểm; 6/6 blob trong bảng source-sync khớp file hiện tại |
| Probe HALF_OPEN với sync spawn throw                                                                                | Tái hiện lỗi bên dưới bằng mock; không spawn/kill process hay chạy model                                                       |

Không chạy lại full inference, benchmark chất lượng hoặc Docker. Log real-model Windows/Linux có
188/188; quality báo adapter 22/22. Đây là evidence đã đọc, không gọi là do phiên review này tự tái chạy.
Con số runtime 180 pass + 8 skip của Claude không mâu thuẫn với 170 + 18 ở môi trường review thiếu Bash.

Working tree product hiện có nhiều thay đổi remediation từ luồng khác. Không dùng git diff tổng thể
để kết luận Claude translation đã sửa product. Claim "45 file không đổi" do báo cáo cung cấp;
không có snapshot đầu phiên tương ứng để phiên này tự chứng nhận lại claim đó.
Phiên này chỉ thêm báo cáo và prompt, giữ nguyên mọi delta có sẵn.

## Các finding cũ đã được xử lý

- **V-1:** full benchmark cuối dùng adapter 4.3.1, tra token ngôn ngữ từ vocab, segment 128 token,
  guard cực tính dựa source/output, không đọc đáp án fixture. Held-out 54 + 51 câu có freeze.
  Hai bug lexicon được sửa sau run đầu, ghi rõ và giữ cả baseline; held-out là AI-authored,
  không phải tập dữ liệu độc lập do người tạo/duyệt.
- **V-2:** pipeline fallback toàn field đúng chuỗi gốc; không còn trộn PARTIAL; ngày giữ nguyên văn.
- **V-3:** lỗi không spawn được child trước đây đã release slot và settle, có test fake và evidence thật.
  Nhưng còn lỗi khi kết hợp đường sync failure với probe breaker, xem F-1.
- **V-4:** clock từ `run` sau READY, load budget riêng; response close hook có completion check;
  source override/metadata rõ; worker có lock check. Adapter tắt `forced_eos_token_id` để output
  hết token budget không giả dạng EOS tự nhiên. Runtime/quality dùng chung adapter.
- **V-5:** flags, AI adjudication và human review được tách; license được ghi theo artifact và
  không tự đưa ra phê duyệt pháp lý.

Số chất lượng bảo vệ đối chiếu được:

| Tập                      | Dịch | Fallback |
| ------------------------ | ---- | -------- |
| Main vi→en, 84 field     | 57   | 27       |
| Main en→vi, 84 field     | 70   | 14       |
| Held-out vi→en, 54 field | 37   | 17       |
| Held-out en→vi, 51 field | 33   | 18       |

Nhận định AI về 3 lỗi nghiêm trọng vi→en và 4 lỗi nghĩa đáng kể en→vi phù hợp ví dụ được lưu.
Không xem đây là human approval. Những kết quả này đủ giải thích việc giữ pending.

## F-1 — lỗi mới trong spike: sync failed probe không mở lại breaker

**Cần sửa trước khi gọi artifact runtime đã khép**, không phải lỗi API product.
`spike/runtime/coordinator.mjs` gọi `sup.enqueue()` trước khi đăng ký job vào `bySup`.
Sync spawn throw khiến supervisor phát `failure` ngay; coordinator chưa tìm thấy job nên không
biết đây là probe. Trong HALF_OPEN, breaker bỏ qua failure không gắn probe. Khi outcome đến,
coordinator chỉ release probe, không OPEN lại hay nhân đôi cooldown.

Probe fake độc lập: `threshold=1`, cooldown ban đầu 10 ms, injected clock, spawn luôn throw EAGAIN:

| Bước                                 | Số lần spawn | Trạng thái thực tế            |
| ------------------------------------ | ------------ | ----------------------------- |
| Request đầu, t=0                     | 1            | OPEN, cooldown 10 ms          |
| Hết cooldown, probe tại t=10 bị fail | 2            | HALF_OPEN, cooldown vẫn 10 ms |
| Request tiếp theo ngay tại t=10      | 3            | Thử spawn ngay, vẫn HALF_OPEN |

Mong đợi: probe failure mở lại OPEN, cooldown 20 ms, request ngay sau bị chặn và không spawn.
Fix association/outcome reconciliation đúng một lần; không chỉ sửa breaker để mọi lỗi non-probe
đều mở lại, vì sẽ làm thay semantics các job khác. Regression phải qua Coordinator + Supervisor,
không chỉ test CircuitBreaker riêng. Không cần model/Docker để sửa finding này.

## F-2 — chưa đủ căn cứ kết luận hai failure chỉ là test flaky

Research ghi 1/5 fake suite có 2 fail nhưng không lưu tên test. Bốn lần xanh không xác định
nguyên nhân và không chứng minh rằng chỉ test lỗi. Lần Linux 10 failure do CRLF có log, đã sửa;
đó là một run khác, không giải thích được hai failure này.

Tìm log nếu có; chạy lại hữu hạn với tên test, assertion/stack, môi trường và exit code được lưu.
Nếu tái hiện, sửa đúng nguyên nhân; không tăng sleep mù/bỏ assertion để xanh. Nếu không tái hiện,
giữ disposition **intermittent failure chưa giải thích, chưa dùng làm gate đáng tin cậy**.
Không bắt lặp tới vô hạn hoặc coi việc chưa tái hiện là finding đã fixed.

## F-3 — đồng bộ trạng thái tài liệu trước khi archive

- Cuối research vẫn ghi "Benchmark chất lượng đầy đủ trên 4.3.1" và tách dấu phẩy chưa làm,
  mâu thuẫn với phần kết quả vòng cuối. Giữ nội dung cũ chỉ nếu có heading snapshot lịch sử rõ.
- Cập nhật "đề xuất/Owner cần chọn pending hay en→vi" thành quyết định Owner nêu trên;
  các gate triển khai trong tương lai vẫn giữ nguyên.
- Source-sync hash còn khớp nhưng đoạn đầu/bảng working tree vẫn mô tả nguồn dirty 14/10;
  ghi thời điểm lịch sử để không nhầm với snapshot sạch 3341ea0 ngày 15/10.
- JSON clock có summary sai đã được thừa nhận, raw mỗi trial đúng. Giữ raw, ghi corrected summary
  dẫn source artifact/hash bằng phép tính offline, không cần chạy lại heavy bench chỉ để sửa bảng.
- Không claim tất cả V-3/V-4 stable verified trước khi disposition F-1/F-2 được ghi.

## Phần không cần làm tiếp để kết thúc research

Chi phí hash cold load, policy kiểm hash mỗi respawn hay một lần, concurrency 2 model thật,
mutable-directory TOCTOU, human gold, quality thresholds, mul, license và G5 resource là điều kiện
cho một lần mở lại implementation trong tương lai. Default concurrency 1/read-only packaging và
trạng thái pending cho phép để chúng ở danh sách chưa kiểm/decision tương lai, không nghiên cứu thêm ngay.

Nguồn chính thức thực sự có các khai báo license cần phân biệt:
[model card Apache-2.0](https://huggingface.co/Helsinki-NLP/opus-mt-vi-en),
[OPUS-MT-train pretrained models CC-BY 4.0](https://github.com/Helsinki-NLP/OPUS-MT-train#pre-trained-models),
[Tatoeba dataset](https://github.com/Helsinki-NLP/Tatoeba-Challenge#license).
Không tự suy từ license dữ liệu sang kết luận quyền sử dụng tất cả weights.
Khi giữ pending, không cần ép Owner quyết license/mul/quality hoặc ghi yêu cầu triển khai ngay.
QĐ-74 chưa áp dụng: giữ proposal; việc áp dụng yêu cầu nguồn chính thức là một task riêng,
không phải điều kiện để bàn giao negative research result.

Lượt tiếp nối chỉ nên sửa F-1, xử lý bounded evidence F-2 và đồng bộ F-3, rồi archive pending.
Không nâng dependency product, không chạy lại full model benchmark, không code route/G5.
