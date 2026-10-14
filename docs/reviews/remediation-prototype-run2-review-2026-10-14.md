# Kiểm lại prototype remediation lượt 2 — 14/10/2026

Reviewer: Codex, hai sub-agent đọc độc lập source/thiết kế và runner/evidence. Đầu vào là báo cáo Claude
Owner gửi kèm và gói `g0-g1-remediation-after-rereview` hiện tại. BE product vẫn `a8ba88f`;
không sửa production source/config/dependency, không commit/push hoặc chạy DB dùng chung.

## Kết luận

Gói đã tiến bộ rõ và **đủ để dev review thiết kế**. C-1 và R-13 có thiết kế, code prototype và test
phù hợp; các artifact cuối tái dựng được. Chưa thể nói “khép đủ C-1→C-5” theo nghĩa mọi gate xanh:
G8 live smoke còn 2/3 lượt fail, G10 còn một `infra-error`; README và runbook còn sửa nhỏ.
Không tìm thấy lý do cần nghiên cứu lại từ đầu hoặc mở rộng wrapper hỗ trợ mọi API pg.
N-1 vẫn chưa được sửa trong source sản phẩm; kết quả prototype không đóng nghiệm thu PR thật.

## Đã tự xác minh trong lượt này

| Kiểm tra                                                                         | Kết quả                                                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SHA-256 diff, fixture candidates, mutation script, reset script, consistency SQL | 5/5 khớp chỉ mục evidence                                                                                        |
| Clone local `a8ba88f`, apply diff + chép fixture, `git write-tree`               | `5c633f12a3278b9d2ffe2cca36b4f3c9506f2cce`, khớp cây artifact `d32b523` đã ghi; scratch đã dọn                   |
| Probe lớp client trích từ diff, transpile trong RAM, không cần DB                | Promise, callback, callback kèm trailing undefined, config + callback: giữ `Query read timeout`, end đúng 1 lần  |
| Probe Query object và callback nằm trong config                                  | Từ chối đồng bộ trước khi pg dispatch; đúng contract mới                                                         |
| Probe retire lặp + hook ném lỗi                                                  | end đúng 1 lần; hook không chặn đóng client                                                                      |
| Đọc JSON mutation cuối                                                           | Control 12 mục, 22 mutations: 21 killed, 1 infra-error, 0 survived/unapplied, 0 restore failed; script hash khớp |
| `pnpm rules:check` trên working tree lúc kiểm                                    | 58 tệp/412 link, 3 lỗi link, đều thuộc gói dịch (`spike/runtime/README.md` thiếu)                                |
| `pnpm rules:format`                                                              | Chưa đạt do 9 file gói dịch; không tự sửa vì ngoài phạm vi                                                       |

Không chạy lại full unit/integration/E2E, Docker/D1/D4, mutation có DB hoặc live smoke trong lượt này.
Số 318/201/33, 26 PASS và số mutation là kết quả Claude đã lưu, không phải test Codex vừa chạy.
Không dùng gate chung đang fail ở gói khác để phủ nhận bằng chứng clone remediation riêng.

## Phần đã khép hợp lý

- **C-1:** contract nội bộ giới hạn rõ; các query form không quan sát được bị từ chối. Release guard dựa
  hành vi pg/pg-pool được pin và có test hợp đồng. Không yêu cầu hỗ trợ API không dùng.
- **C-2:** runner mới có control, assertion target, phân loại lỗi và restore/hash; chỉ mục hạ số 11/11 cũ
  thành lịch sử, không che kết quả DISP. Còn phần thao tác tái chạy và harness bên dưới.
- **C-3:** đã có rollback floor, phân biệt deploy rollback với transaction và SQL kiểm nghi vấn hư hại;
  còn một lựa chọn containment chưa đầy đủ.
- **C-4/R-13:** CLI DB-only env, API/worker fail closed, PTY đủ kịch bản và module wiring có test.
  Export repo/hasher trong `IdentityAccessFacadeModule` phục vụ module identity dùng chung instance;
  installation hiện chỉ dùng service. Đây là điểm review encapsulation, chưa phải vi phạm ownership đã chứng minh.
- **C-5:** có bảng gate và bằng chứng container/idle/CLI/audit đúng lockfile; phần live/mutation chưa hoàn tất.

## Cần hoàn thiện có giới hạn

### F-1 — G8 live smoke còn chưa ổn định

[Evidence](../workspace/items/g0-g1-remediation-after-rereview/prototype/evidence/README.md):
lượt 1 M-2 đọc outbox `SENDING`, lượt 2 X-2 đọc `PENDING`, lượt 3 đạt.
[Runner](backend-g0-g1-rereview-after-fix-2026-10-14/live-smoke.mjs) khoảng dòng 281–285 nhận mail
rồi đọc DB ngay; khoảng 634–637 khởi động worker, chờ không có thư 12 s rồi đọc state.
Giả thuyết race có căn cứ nhưng chưa đủ gọi mọi failure là lỗi runner chắc chắn.

Sửa runner riêng cho prototype: chờ đúng terminal state với deadline/polling, ghi timeline,
giữ kiểm mail count/token/ciphertext/attempt/state. Không tăng sleep mù hoặc bỏ assertion.
Chạy tuần tự ít nhất ba lượt fresh-reset cùng artifact, không mutation/live đồng thời.
Nếu còn fail phải điều tra product/worker/runner theo trace, không lặp tới khi chọn được một lượt xanh.

### F-2 — G10 DISP: cần dọn test đúng để phân loại không nhiễu

[Mutation JSON](../workspace/items/g0-g1-remediation-after-rereview/prototype/evidence/run2-rg2001/mutation-rg2001-final.json)
ghi assertion Expected 0/Received 1 nhưng thêm runtime error do pool mở lúc drop DB.
Giữ nguyên quy tắc `infra-error`; sửa test T6 cleanup trong `finally`, theo đúng pool do test sở hữu.
Assert pool leak trước cleanup vẫn phải fail khi bỏ `disposeExternalPool`.
Sau đó đóng pool trước relay/drop database dù assertion fail, rồi chạy control + DISP; cuối cùng chạy
mutation phù hợp trên artifact mới và lưu evidence. Không đổi classifier để biến lỗi runtime thành killed.

### F-3 — README tái dựng thiếu clean snapshot trước mutation

[README prototype](../workspace/items/g0-g1-remediation-after-rereview/prototype/README.md) dòng 23–27
apply patch + copy fixture, nhưng sau đó gọi runner yêu cầu `git status` sạch (`mutate-prototype.mjs` khoảng 507).
Người nhận làm đúng hướng dẫn sẽ bị exit 2. Thêm bước snapshot/commit **chỉ trong clone riêng**, không push,
ghi HEAD/tree/hash; không bỏ dirty guard. Kiểm README bằng chính các lệnh đã ghi.

### F-4 — containment phải dừng mọi writer

[Spec](../workspace/items/g0-g1-remediation-after-rereview/spec.md) khoảng dòng 160–161 cho phép
“API và worker về 0 **hoặc** ingress trả 503”. Nhánh ingress-only vẫn để worker ghi và request đang chạy
chưa được drain. Chỉnh thành dừng worker/CLI/other writers **và** dừng/drain API; scaling API + worker 0,
không chạy CLI là thủ tục cụ thể đơn giản. Không cần thiết kế thêm maintenance subsystem.

### F-5 — đồng bộ nhỏ, không mở rộng nghiên cứu

- Research khoảng dòng 111 còn câu “giữ mọi overload”; cập nhật theo contract giới hạn ở mục 2.6.
- Plan 1.8 chuyển test cũ sang `PgRelay` vẫn unchecked: làm trong prototype nếu cần đồng bộ,
  hoặc giữ rõ là task implement chưa thực hiện; không coi refactor test này là P1 mới.
- Bảng C-1→C-5 phải phản ánh G8/G10 còn mở cho tới khi có bằng chứng; các câu hỏi “có sửa test/runner không”
  là lựa chọn thực thi thường lệ, không cần Owner quyết nghiệp vụ.
- Ranh giới facade/client vẫn cần dev review theo repo, không tự ghi approved hoặc tạo vòng nghiên cứu mới.

## Bước tiếp theo

Prompt tiếp tục ở gốc workspace: `PROMPT_CLAUDE_FINALIZE_REMEDIATION_EVIDENCE_2026-10-14.md`.
Opus điều phối/review và xác định nguyên nhân còn lại; Sonnet sửa harness/runner/tài liệu theo phạm vi.
Hoàn tất các việc trên rồi bàn giao dev A review/implement PR 1; không tự viết 1c/G2/dịch hoặc product fix trong phiên.
