# Review gói nghiên cứu và spike dịch EN–VI — 14/10/2026

Phạm vi: đối chiếu prompt `PROMPT_CLAUDE_CONTINUE_TRANSLATION_OPUS_SONNET_2026-10-14.md`,
báo cáo Owner gửi, [spec dịch](../../workspace/items/dynamic-content-translation/spec.md),
và các artifact dưới `docs/workspace/items/dynamic-content-translation/`.
BE HEAD lúc kiểm tra: `a8ba88fd81581000ade8b84f1c1d3b4583c3d3e1`; spike/spec là working tree chưa commit.
Đây là review draft và spike, không phải nghiệm thu code product hay phê duyệt của dev khác.

## Kết luận

Claude đã thực hiện phần lớn yêu cầu nghiên cứu, thiết kế, chạy spike cô lập và ghi nhận kết quả
không đạt. Kết luận **chưa sẵn sàng implement** phù hợp bằng chứng. Không cần nghiên cứu lại từ đầu.
Tuy nhiên, chưa thể gọi là khép mọi task kỹ thuật: có lỗi lifecycle trong spike, bằng chứng fallback
không đúng contract cuối, và benchmark chất lượng chưa chạy đầy đủ trên dependency đã chọn.

Phân biệt hoàn thành khảo sát T-1–T-7 với đạt điều kiện bật tính năng. Một khảo sát có thể kết thúc
bằng kết quả không đạt. Các điều kiện nguồn nghiệp vụ, chất lượng, license và resource G5 vẫn mở;
không biến việc chưa hoàn thiện dịch thành blocker để thiết kế hoặc làm G1 sau khi remediation đủ điều kiện.

## Đối chiếu yêu cầu và kết quả

| Phần prompt                                                                | Đánh giá                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Khôi phục default `vi`, fallback bản gốc; source language và single-flight | Đã có trong spec; cần sửa spike fallback và làm rõ effective source metadata                                             |
| Dependency matrix, audit candidate, Linux/offline spike                    | Có runner và evidence; bản 4.3.1 mới có parity hẹp, chưa có full quality benchmark                                       |
| Runtime cách ly tiến trình, đo latency/concurrency                         | Đã làm và ghi giới hạn; còn lifecycle/clock/truncation bên dưới                                                          |
| Chất lượng hai chiều                                                       | Đã phát hiện kết quả xấu và không tuyên bố ready; safeguards dự kiến chưa được benchmark trên cấu hình cuối              |
| Pin hash model và nguồn nghiệp vụ                                          | Có evidence hash; model-lock lúc load mới là thiết kế. Source-sync là đề xuất chưa áp dụng, không phải quyết định đã ghi |
| Không implement product/commit/push                                        | Không thấy delta trong `src`, `test`, `prisma`, `openapi.json` tại thời điểm kiểm tra                                    |

## Kiểm chứng độc lập trong phiên review này

| Lệnh / phép kiểm                                                                              | Kết quả và giới hạn                                                                                                |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `node --test --test-reporter=spec` tại `spike/quality`                                        | 82 pass, 0 fail, 0 skip; test helper không chứng minh model dịch đúng                                              |
| `node --test --test-timeout=30000 --test-reporter=spec "test/*.test.mjs"` tại `spike/runtime` | 94 pass, 0 fail, 5 skip; chưa chạy lại 5 ca model thật                                                             |
| `pnpm rules:check`, `pnpm rules:format`, `pnpm format:check` tại BE                           | Đều exit 0 trước khi thêm báo cáo này; checker báo 59 file, 413 link, 0 lỗi trong phạm vi của nó                   |
| SHA-256 và kích thước 16 file model so với manifest local, kiểm path trong model root         | 16/16 khớp; phép kiểm này riêng nó không chứng minh provenance/hash của publisher                                  |
| Probe fallback dùng adapter giả                                                               | Tái hiện output trộn bản gốc và bản dịch khi một segment fail                                                      |
| Probe supervisor dùng EventEmitter giả, không spawn/kill process thật                         | Spawn phát `error` mà không có `exit`: job chưa settle, liveWorkers = 1, shutdown chưa settle sau khoảng chờ 30 ms |

Không chạy lại full benchmark model, Linux/container, audit qua mạng hoặc 5 ca real-model;
các kết quả đó trong báo cáo Claude được đối chiếu artifact, không gắn nhãn do phiên này tự tái chạy.
Hai reviewer AI đọc độc lập quality và runtime; đây không phải human approval.

Kiểm cuối sau khi thêm báo cáo: `rules:check` vẫn 0 lỗi. `rules:format` lúc này exit 1 tại
gói remediation G0/G1, ngoài phạm vi phiên dịch;
không sửa file đó vì có luồng remediation riêng. Kết quả gate xanh trước đó chỉ mô tả snapshot lúc chạy,
không bảo đảm working tree đang được nhiều phiên sửa luôn xanh. Báo cáo và prompt mới được kiểm
format riêng; các link file trong báo cáo được kiểm tồn tại riêng vì report mới ngoài scope rules checker.

## Các điểm cần xử lý tiếp

### V-1 — full quality chưa bao phủ phiên bản/cấu hình được chọn

[research.md](../../workspace/items/dynamic-content-translation/research.md) ghi benchmark 84 câu mỗi chiều
chạy trên 3.8.1, trong khi candidate là 4.3.1. Parity 10 câu en→vi chỉ chứng minh một tập hẹp.
`spike/quality/lib/model.mjs` vẫn đi qua pipeline với tiền tố chuỗi; không dùng đường chèn id token
được đề xuất cho 4.3.1. Guard hiện mặc định 512 token; segment 128 token và cổng cực tính còn ở plan.

Làm tiếp một vòng spike có giới hạn: cùng adapter/cấu hình cuối, xác minh token ngôn ngữ từ tokenizer,
không hardcode id 3 mà thiếu kiểm tra; segmentation và safeguards không đọc đáp án của fixture.
Chạy lại đủ 168 fixture, công bố output, fallback theo cả field và latency. Thêm kiểm tra độc lập
để tránh tuning chỉ nhằm vượt keyword của bộ câu đã biết. Không gọi heuristic là bảo đảm giữ nghĩa.

### V-2 — whole-field fallback chưa được chứng minh, ngày bị thay đổi

[test-plan.md](../../workspace/items/dynamic-content-translation/test-plan.md) TR-AC-07 đánh dấu đã có
whole-field fallback; spec cũng yêu cầu trả nguyên field khi segment fail.
Nhưng `spike/quality/lib/pipeline.mjs` giữ riêng segment hỏng và trả `PARTIAL`;
test hiện khẳng định hành vi trộn đó.

Probe độc lập: nguồn `Alice approved. Hello.`, adapter làm mất placeholder ở câu đầu →
`Alice approved. Xin chao.`, status `PARTIAL`, `wholeFieldFallback:false`.
Đây là sai khác trong spike, chưa phải lỗi endpoint product vì endpoint chưa tồn tại.

Ngoài ra `protect.mjs` chủ động bản địa hóa ngày dạng chữ, trong khi source-sync/prompt nói giữ ngày.
Giữ nguyên ngày dạng chữ và số, trừ khi có quyết định mới cho phép. Sửa test và nhãn evidence theo
contract cuối, không chỉ sửa tài liệu để biến mọi test xanh thành acceptance đã đạt.

### V-3 — spawn thất bại có thể giữ slot và treo shutdown

`spike/runtime/supervisor.mjs` chưa bắt synchronous throw từ spawn; handler `error` bỏ qua vì chờ
`exit`. Node ghi rõ `exit` có thể có hoặc không sau `error`:
[Child process API, Node 24.0.1](https://nodejs.org/download/release/v24.0.1/docs/api/child_process.html#event-error).
Probe giả tái hiện job và shutdown không settle khi không có process được tạo.

Tách failed spawn đã xác định không có child sống khỏi lỗi của child đang sống. Trường hợp sau vẫn
phải chờ xác nhận exit trước khi tái sử dụng slot. Test sync throw, error-no-exit, settle một lần,
drain/shutdown và giữ invariant concurrency; không cần giết Node trên host để thử lỗi này.

### V-4 — một số hành vi runtime cuối vẫn là thiết kế

- Spec đặt compute clock từ `run` sau READY; supervisor hiện bắt đầu ở dispatch trước spawn/load.
  Giữ deadline toàn request hữu hạn, nhưng test phải phản ánh đúng clock cuối đã chọn.
- Worker có thể xem output hết `max_new_tokens` là hoàn thành dù không có EOS; cần phân biệt
  hoàn thành tự nhiên với cắt cụt và fallback, không cache output cắt cụt như thành công.
- Spec đề xuất `req.on('close')` để hủy khi client bỏ đi. IncomingMessage `close` có thể chỉ báo
  request đã nhận xong. Chọn hook và điều kiện theo response/socket lifecycle, test GET bình thường
  và disconnect thật. Xem [Node HTTP API](https://nodejs.org/docs/latest-v24.x/api/http.html#event-close_3).
- Làm rõ ngôn ngữ được lưu và nguồn có hiệu lực sau `source=`; nguồn có hiệu lực phải dùng nhất quán
  cho shortcut, model, cache và metadata khi fallback, không sửa bản ghi.
- Model-lock lúc load chưa implement trong runtime spike: ghi đúng giới hạn, hoặc thêm probe nhỏ
  cho model sai/mất hash trước khi gọi inference; không coi hash trên đĩa là startup enforcement.

Kết quả external kill max 103 ms so với tiêu chí 100 ms đã được báo trung thực. Chênh 3 ms trên
shared host không đủ để yêu cầu đổi kiến trúc. Ghi cách đo và đề xuất SLO có căn cứ cho reviewer;
không tự sửa ngưỡng để gọi PASS. Nhận định worker-thread crash phải gắn môi trường đã quan sát,
không khái quát cho mọi phiên bản ORT/OS hay chạy lại ca có thể làm chết host chỉ để bổ sung bằng chứng.

### V-5 — tách automated flags, lỗi nghĩa xác nhận và provenance license

Research gọi 5 vi→en/1 en→vi là mất cực tính, nhưng quality README đã nhận diện vi-018
(`accepting`) và en-015 (`tán thành`) là synonym false positive. Giữ số flag tự động 5/1;
trong phần mẫu đã phân tích, số lỗi nghiêm trọng được nhận định là 4/0. Đây vẫn là AI review,
không phải toàn bộ gold set đã có người duyệt hoặc bằng chứng chiều en→vi an toàn.

Tách license theo artifact. Model card Helsinki-NLP ghi Apache-2.0; Tatoeba-Challenge ghi điều kiện
riêng cho dữ liệu train. Không suy ra tự động rằng mọi weight/model chuyển đổi bị cấm dùng thương mại,
cũng không tự xác nhận đã đủ quyền triển khai. Ghi đúng model revision, conversion, tập dữ liệu,
notice và điểm cần Owner/người phụ trách license xem:
[model card](https://huggingface.co/Helsinki-NLP/opus-mt-vi-en),
[dataset license](https://github.com/Helsinki-NLP/Tatoeba-Challenge#license).

## An toàn chạy spike và phần chờ ngoài kỹ thuật

Báo cáo thừa nhận đã dùng `taskkill /F /IM node.exe`. Không tái diễn: chỉ dừng PID/child handle hoặc
container đã xác định thuộc run của mình, có timeout và cleanup trong finally. Không tự khởi động
lại process của người khác dựa trên phỏng đoán. Phiên review này không giết process hay xóa volume.

`spike/runtime/run-linux.sh install` hiện xóa volume tên mặc định trước khi tạo. Volume
`spike-runtime-deps` được báo là giữ lại: cần run ID/ownership và không xóa tài nguyên có sẵn khi
chạy tiếp. Một test bị treo không cho phép kill theo tên toàn máy.

Các quyết định Owner đã gửi lại phải được giữ: default vi/fallback nguyên gốc, quy tắc q=0,
reader override source không sửa DB, phân loại dịch local ngoài tính năng AI theo lựa chọn nghiệp vụ.
Chưa hỏi lại các quyết định này. `mul`, ngưỡng chất lượng và license còn cần disposition thích hợp;
không để chúng chặn test kỹ thuật độc lập. Source-sync chỉ là bản đề xuất có hash/anchor, phải
đối chiếu Docs đang thay đổi và số quyết định thực tế trước khi áp dụng, không overwrite phiên khác.

## Bàn giao đề xuất

Một lượt tiếp nối hẹp: Sonnet sửa code spike theo V-1–V-4 và script ownership; Opus review contract,
nguồn, metric và kết luận V-5. Chạy lại các phép đo bị tác động trên artifact cuối, cập nhật bốn tài liệu
và README evidence. Nếu chất lượng vẫn không đạt, chốt báo cáo negative result và để tính năng
disabled/pending; không tự đổi provider, giảm chuẩn hay kéo dài nghiên cứu vô hạn.

Đủ để gửi dev review draft sau khi sửa sai khác bằng chứng; chỉ giao implement khi các gate thực sự
đạt và resource nghiệp vụ sẵn sàng. Phiên này chỉ thêm báo cáo và prompt tiếp nối, không sửa spike,
source sản phẩm, dependencies, Docs nghiệp vụ; không commit/push.
