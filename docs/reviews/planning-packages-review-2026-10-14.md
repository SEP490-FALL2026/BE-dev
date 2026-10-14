# Review hai gói research/spec/plan — 14/10/2026

Reviewer: Codex, kiểm tài liệu và một số thuộc tính của artifact; không phải nghiệm thu,
không thay dev review. BE HEAD `a8ba88f`; giữ nguyên working tree và hai gói draft.
Không sửa source/config/dependency, không commit/push. Bản sửa N-1 vẫn chỉ ở prototype.

## Kết luận

Hai phiên đã tạo đúng bộ `research.md`, `spec.md`, `plan.md`, `test-plan.md` và phần lớn
đã đáp ứng nhiệm vụ nghiên cứu/lập draft. Gói remediation có hướng sửa và bằng chứng hữu ích;
gói dịch giữ đúng việc chưa implement, chưa tạo endpoint nghiệp vụ giả.
Chưa nên coi cả hai là thiết kế sẵn sàng giao implement nguyên trạng: cần khép các điểm dưới đây.

Các phần đã hoàn thành không cần làm lại: phân tích N-1, so sánh phương án, disposition các finding,
prototype D1/D4, phân biệt prototype với PR, allowlist/phụ thuộc G5 và lựa chọn local được ghi là
quyết định Owner. R-13 còn là đề xuất hoãn đúng như báo cáo, chưa phải rủi ro được chấp nhận.

## Đã tự kiểm trong lượt này

| Kiểm tra                                                                                        | Kết quả                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm rules:check`                                                                              | exit 0; 47 tệp, 299 link, 0 lỗi                                                                  |
| `pnpm rules:format`                                                                             | exit 0                                                                                           |
| `pnpm format:check`                                                                             | exit 0                                                                                           |
| `git apply --check .../prototype/remediation.prototype.diff`                                    | exit 0, chỉ kiểm khả năng áp diff; không áp vào repo                                             |
| Probe lớp client lấy nguyên từ diff, transpile trong bộ nhớ với TypeScript cài sẵn và pg 8.23.0 | Promise timeout: gọi `end` 1 lần; callback đối số cuối: 1; `new pg.Query(text, callback)`: **0** |
| Đối chiếu mutation N1a với diff cuối                                                            | Mẫu `Client: RetireOnTimeoutClient` không tồn tại; diff cuối dùng `Client: PooledClient`         |
| `pnpm audit --prod --audit-level high` trên working tree hiện tại                               | **exit 1: 1 moderate, 3 high**; các high đi qua `@huggingface/transformers → sharp`              |
| Sổ quyết định Docs hiện tại                                                                     | `QĐ-71` đã tồn tại cho việc bỏ `AI_BACKEND_MODEL_SPEC.md`, không phải dịch EN–VI                 |

Probe client không kết nối DB: cấu hình timeout 20 ms, thay `end()` bằng bộ đếm, gọi ba dạng query
và quan sát `Query read timeout`. Nó chứng minh thiếu quan sát ở wrapper, chưa chứng minh bug trên
đường Prisma promise đã được prototype kiểm trước đó. Chưa tự chạy lại D1/D4, full product gate,
50.000 candidates, benchmark model hoặc Linux container trong lượt review này.

## A. Remediation: cần khép trước khi bàn giao

### C-1 — P2: phạm vi hỗ trợ `Client.query` bị mô tả rộng hơn implementation

Vị trí: `g0-g1-remediation-after-rereview/plan.md` bước 1.3;
`prototype/remediation.prototype.diff`, lớp `RetireOnTimeoutClient`.

Wrapper chỉ quan sát Promise và callback ở đối số cuối. `client.query(new pg.Query('SELECT 1', cb))`
trả Query object, callback nằm trong object; wrapper không thấy lỗi nên không retire client khi timeout.
Tài liệu lại ghi giữ mọi overload và invariant không có ngoại lệ. Đây là gap đã kiểm bằng probe ở trên;
không phủ nhận bằng chứng sửa đường Prisma hiện tại.

Yêu cầu: hoặc hỗ trợ và test các dạng query được chấp nhận, hoặc giới hạn wrapper thành adapter nội bộ
cho những dạng đã kiểm, không quảng bá như thay thế đầy đủ pg.Client. Ghi rõ việc sử dụng Prisma,
callback/config callback/Submittable, prepared statement, queue/concurrency và quá trình retire.
Kiểm thêm retire idempotent, log hook không cản đóng client, lỗi ban đầu không bị thay thế bởi cleanup.
API query còn hỗ trợ Submittable theo [tài liệu pg](https://node-postgres.com/apis/client).

### C-2 — P2: artifact mutation chưa tái chạy được nguyên trạng

`prototype/mutate-n1.mjs` N1a tìm `return new Pool({ ...config, Client: RetireOnTimeoutClient });`,
trong khi diff cuối là `Client: PooledClient`. Runner hiện chỉ ghi `NOT APPLIED` rồi tiếp tục;
chỉ dựa exit khác 0 để tính killed, không phân biệt compile/setup failure, không restore trong `finally`.
Vì vậy không thể dùng runner hiện tại để tái lập nguyên vẹn tuyên bố 11/11 trên diff cuối.

Bằng chứng `mutation-n1.json` còn có N5 sống, `mutation-n5.json` là lượt bổ sung đã bắt N5.
Điều này có thể giải thích tổng 11/11, nhưng cần chỉ mục ghi rõ lượt nào thay thế lượt nào,
hash artifact/patch và runner phù hợp. Không xóa kết quả lịch sử để làm số đếm đẹp hơn.

Yêu cầu: sửa runner để báo lỗi nếu mutation không áp đúng một lần, phân loại killed/survived/unapplied/
infrastructure error, restore bằng `finally` và kiểm hash. Chạy lại trên clone riêng có diff cuối,
chỉ tính killed khi test hành vi mục tiêu fail đúng lý do.

### C-3 — P2: rollback không được khôi phục lỗi P1 đã biết

Spec mục triển khai hiện chỉ ghi “Rollback: revert PR”. Revert riêng bản sửa N-1 về `a8ba88f`
sẽ khôi phục nguy cơ transaction nửa vời. Kế hoạch cần chỉ rõ artifact an toàn để rollback,
hoặc biện pháp vận hành hạn chế/đóng write khi chưa có artifact an toàn; không mặc định mọi revert là an toàn.
Phân biệt rollback code triển khai với rollback transaction và kết quả COMMIT chưa xác định.

### C-4 — cần quyết định: R-13

Đề xuất hoãn có nêu lý do và task thay thế, đúng yêu cầu research. Còn cần Owner/dev xác nhận điều kiện;
chưa có xác nhận thì không đánh dấu accepted risk và không coi cả gói đã được duyệt.

## B. Dịch EN–VI: các gap thiết kế và dependency

### T-1 — P2: dependency đã thêm làm gate audit hiện tại fail

`package.json`/lockfile của working tree đã có Transformers 3.8.1 và sharp 0.34.5 do phiên khác thêm.
Audit thực chạy hiện báo 3 high, 1 moderate. Nguồn advisory đối chiếu:
[libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj),
[libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
[librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

Đây là gate dependency fail, không phải kết luận API dịch text hiện đã có exploit (chưa implement route).
Không dùng kết quả audit sạch của clone remediation `a8ba88f` để chứng nhận working tree này.
Cần tách rõ phạm vi dependency của remediation và spike dịch; nghiên cứu giải pháp tương thích
trong clone riêng, không override transitive major/version hoặc audit-ignore mù quáng.
Không tự xóa/revert thay đổi của phiên khác.

### T-2 — P2: chưa có thiết kế đủ để đảm bảo timeout và concurrency thực

Spec quy định timeout 10 s, concurrency 1, queue 4; test-plan yêu cầu fake adapter treo vẫn “không rò promise”.
Chưa chỉ rõ cách hủy/giới hạn inference thực. Trả fallback sau Promise.race không dừng CPU/native work;
nếu giải phóng slot sớm, số tác vụ thực có thể vượt concurrency. Nạp model/lazy load và client disconnect
cũng chưa có lifecycle rõ.

Yêu cầu research cơ chế phù hợp đúng version: cancellation/cooperative stopping hoặc worker/process;
chốt semantics response timeout so với compute timeout, ai giữ slot, dọn queue và kết quả về muộn.
Thử trên môi trường Linux/container và model thật trong spike cô lập trước khi chốt hạn mức cứng.
Không nhất thiết phải hoàn thành toàn bộ spike chất lượng ngay để gọi bộ tài liệu là draft;
phải ghi đúng gate nào còn mở trước implement/bật tính năng.

### T-3 — P2: API/metadata chưa nhất quán với fallback và nội dung thực

- Spec trả 406 khi thiếu/không hỗ trợ `Accept-Language`, khác yêu cầu đầu vào mặc định `vi`.
- Endpoint riêng trả `text: null` khi unavailable/too-long/unknown, khác yêu cầu ban đầu trả nội dung gốc.
  Đây có thể là contract hợp lý cho endpoint on-demand, nhưng cần ghi là thay đổi thiết kế và xác nhận,
  không suy từ quyết định “dịch từng trường” rằng mọi chi tiết đã được Owner chốt.
- `Content-Language` luôn là đích cho `PARTIAL`, dù `text` chứa segment nguồn chưa dịch;
  khi `text=null` lại yêu cầu suy header từ ngôn ngữ của text. Cần truth table cho mọi status,
  actual language(s), tỷ lệ dịch và fallback, không gắn metadata sai cho kết quả hỗn hợp.

### T-4 — P2: ngôn ngữ giao diện không chứng minh ngôn ngữ nội dung

Spec lấy mã nguồn từ UI locale và tin tuyệt đối khi có mã. UI tiếng Anh vẫn có thể nhập tiếng Việt;
người dùng có thể sửa văn bản sang ngôn ngữ khác. Cần mô tả mã do người viết khai báo, UI chỉ gợi ý,
cách chọn/sửa mã cùng nội dung hoặc xử lý unknown/mixed. Heuristic ASCII có từ tiếng Anh không đủ
đảm bảo với tiếng Việt không dấu xen thuật ngữ; cần test ví dụ đúng phạm vi. Nếu giữ lựa chọn từ phiên
Owner thì ghi giới hạn và hỏi lại phần mâu thuẫn cụ thể, không âm thầm thay quyết định.

### T-5 — nguồn và readiness còn thiếu

- `QĐ-71` đã được sổ quyết định dùng cho việc khác. Bỏ mã giả định này khỏi gói dịch;
  chỉ nhận mã mới sau khi kiểm sổ hiện hành, không tái sử dụng/ghi đè.
- Yêu cầu dịch vẫn chưa có trong BRD/US; trường G5 chưa có schema/endpoint. Đây là dependency
  được báo cáo đúng, không phải thiếu implementation trong một task research.
- Ngưỡng chất lượng, giới hạn Linux thực và cách đưa model vào container còn mở. “Bản dịch tham khảo”
  hoặc placeholder còn nguyên không chứng minh giữ đúng nghĩa, phủ định, phê duyệt/từ chối, con số/ngày.
- Benchmark được mô tả trong research nhưng chưa có runner/fixtures/kết quả thô đã lọc đủ để người nhận
  tái chạy từ checkout. Cần bổ sung artifact nhỏ và nguồn model/version; không cần commit weights.
- Manifest do downloader tự tính hash sau tải phù hợp kiểm file local bị đổi về sau, chưa phải bằng chứng
  đối chiếu checksum tin cậy độc lập. Ghi đúng guarantee, pin revision và quản lý manifest/allowlist file rõ.
- Chưa đăng ký hai hạng mục ở roadmap; nên phối hợp bổ sung tối thiểu, giữ nguyên delta có sẵn.

## Đề xuất tiếp tục

Khép C-1→C-3 và bằng chứng tái chạy trước review thiết kế PR N-1; xác nhận disposition R-13.
Gói remediation có thể được dev review ngay với những finding này, chưa được coi là approved.

Gói EN–VI tiếp tục research/design cho T-1→T-5; chưa cài thêm hoặc đưa module dịch vào product.
Hai luồng không cùng sửa dependency/config/roadmap trong một checkout. Không gộp dependency dịch chưa đạt
vào PR remediation. Những cổng G5/quality/review chưa đạt phải giữ trạng thái blocked/conditional đúng phạm vi.
