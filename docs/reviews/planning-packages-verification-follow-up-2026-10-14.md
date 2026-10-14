# Kiểm lại hai gói kế hoạch và quyết định tiếp tục — 14/10/2026

Reviewer: Codex, có hai sub-agent đọc độc lập từng gói. Đây là review tài liệu/artifact và một số
probe có giới hạn, chưa chạy lại toàn bộ prototype, model benchmark hay D1/D4. Không sửa product source,
dependency, migration hoặc tài liệu có sẵn. BE vẫn `a8ba88f`; working tree có thay đổi của các phiên trước.
[Bản review tài liệu đã có](planning-packages-review-2026-10-14.md) được giữ nguyên.

## Kết luận

Cả hai đã hoàn thành phần lớn nhiệm vụ **tạo gói draft**, không phải đã hoàn thành sửa sản phẩm.
Remediation có phân tích nguyên nhân, prototype và bằng chứng hữu ích; dịch có scope/dependency G5
và benchmark ban đầu. Hai gói chưa đủ để giao implement nguyên trạng: còn gap kỹ thuật, artifact tái chạy
và quyết định mới cần đồng bộ. Không cần làm lại nghiên cứu đã có; tiếp tục đúng các gap bên dưới.

## Quyết định Owner trong lượt kiểm này

- **R-13 phải sửa trong gói remediation lần này**, không hoãn tới production.
- **Dịch giữ yêu cầu gốc:** thiếu/không hỗ trợ `Accept-Language` mặc định `vi`; khi không dịch được
  trả nội dung gốc. Không dùng lựa chọn 406/null của draft hiện tại. Null/rỗng của chính nguồn vẫn giữ nguyên.
- Opus cho review/nghiên cứu/thiết kế; Sonnet cho code, sửa prototype/runner hoặc implementation theo plan.
  Đây là phân công cho phiên Claude tiếp theo; các sub-agent của lượt Codex này dùng model hiện có,
  không được mô tả là đã chạy Opus/Sonnet.

## Đã tự kiểm

| Kiểm tra                                                     | Kết quả trong lượt này                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check` trước khi thêm tệp review này             | exit 0, 47 tệp/299 link/0 lỗi                                                                                   |
| `pnpm rules:format`, `pnpm format:check`                     | exit 0                                                                                                          |
| `git apply --check .../prototype/remediation.prototype.diff` | exit 0; không áp patch                                                                                          |
| Probe trích nguyên lớp client từ diff và transpile trong RAM | Promise và callback cuối: `end()` 1 lần; `new pg.Query(text, callback)`: `end()` 0 lần khi `Query read timeout` |
| Mutation N1a so với artifact cuối                            | Pattern `Client: RetireOnTimeoutClient` không có; diff dùng `Client: PooledClient`                              |
| `pnpm audit --prod --audit-level high --json`                | exit 1: 3 high, 1 moderate; các high qua `@huggingface/transformers > sharp@0.34.5`                             |
| Sổ quyết định Docs hiện tại                                  | `QĐ-71` đã dành cho việc bỏ đặc tả AI cũ, không phải dịch                                                       |

Audit lần sandbox đầu lỗi `fetch failed`; lần chạy được cấp quyền truy vấn registry trả các advisory:
[libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj),
[libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c),
[librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
Đây là gate dependency fail; chưa có bằng chứng route dịch text có exploit.

## Remediation: việc phải khép trước bàn giao

1. **C-1 — contract wrapper vượt phạm vi đã bảo vệ.**
   [Spec](../workspace/items/g0-g1-remediation-after-rereview/spec.md) dòng 66,
   [plan](../workspace/items/g0-g1-remediation-after-rereview/plan.md) bước 1.3,
   [diff](../workspace/items/g0-g1-remediation-after-rereview/prototype/remediation.prototype.diff) dòng 64–80
   nói giữ mọi overload nhưng chỉ quan sát Promise/callback cuối. Probe đã xác nhận Query object không retire.
   Đường Prisma Promise đã được prototype kiểm không vì vậy bị phủ nhận. Cần giới hạn contract nội bộ
   tường minh hoặc hỗ trợ/test các dạng được nhận; tránh lời hứa an toàn cho cả API chưa bao phủ.
   Kiểm idempotent retire, queued errors, hook log ném lỗi không chặn đóng client, giữ lỗi gốc.
   [pg Client API](https://node-postgres.com/apis/client) cũng có dạng Submittable.
2. **C-2 — mutation runner và lắp prototype chưa tái lập đủ.**
   [mutate-n1.mjs](../workspace/items/g0-g1-remediation-after-rereview/prototype/mutate-n1.mjs) dòng 16
   sai pattern N1a; dòng 89–108 bỏ qua mutation không áp và tính mọi exit khác 0 là killed, thiếu restore trong
   `finally`. Thêm chỉ mục revision/hash, README lắp clone từ diff, vị trí candidate test riêng và lệnh chạy.
   Phải tách killed/survived/unapplied/setup error, chỉ counted kill khi assertion mục tiêu fail.
   Giữ evidence lịch sử; chạy lại trên artifact cuối, không xóa số đo cũ để làm báo cáo đẹp.
3. **C-3 — rollback phải an toàn với P1.** Spec dòng 119 chỉ ghi revert PR, có thể quay về N-1.
   Cần rollback artifact đã biết an toàn hoặc biện pháp dừng/hạn chế write khi chưa có artifact đó.
   Không mặc định mọi revert đều an toàn, không tự retry write sau kết quả COMMIT chưa xác định.
4. **C-4 — R-13 chuyển từ hoãn sang task thực hiện.** Bổ sung spec/plan/test/prototype cho CLI chỉ yêu cầu
   cấu hình thực sự dùng, nhưng API/worker vẫn fail closed với thiếu secret production.
5. **C-5 — đồng bộ gate/đối chiếu.** Plan thêm Docker build và container boot/CLI với env mới;
   sửa mapping R-12 ở spec (đang trỏ bước 4, thực tế bước 2). Test backstop T8 và refactor relay còn dự kiến
   là hợp lệ trong draft, cần ghi chưa chạy thay vì ngầm tính vào kết quả prototype.

## Dịch EN–VI: tiếp tục design/spike, chưa triển khai G5

1. **T-1 — dependency audit fail.** Tách thay đổi dịch khỏi PR remediation, nghiên cứu cách khắc phục trên clone;
   không audit-ignore, override mù hoặc tự xóa thay đổi của phiên khác. Ghi phiên bản/lockfile được kiểm.
2. **T-2 — timeout/concurrency chưa có cơ chế đảm bảo thật.** Spec 145–162 chỉ nêu giới hạn,
   chưa có lifecycle hủy inference/native work, slot còn bị giữ bao lâu sau response timeout, model load,
   shutdown. Promise.race không tự dừng CPU. Thiết kế và spike thật với health, active jobs, RSS, Linux.
3. **T-3 — sửa contract theo quyết định Owner mới.** Spec 95–127 đang 406/null; phải thành default `vi`
   và original-text fallback. Cần truth table đủ sáu status, nguồn null/rỗng/whitespace, target/actual languages.
   `PARTIAL` có cả nguồn/đích không được tuyên bố text chỉ có ngôn ngữ đích.
4. **T-4 — UI locale không chứng minh source language.** Spec 73–81 dùng locale của người viết làm mã nguồn.
   Cần mã do người viết khai báo, UI chỉ gợi ý; xử lý sửa nội dung, sai mã, mixed/unknown, tiếng Việt không dấu.
   Không mở lại lựa chọn lưu source language đã được báo là Owner chốt ở phiên trước.
5. **T-5 — single-flight thiếu.** Spec cache không bao phủ gộp yêu cầu trùng đang chạy; bổ sung key,
   subscriber timeout/disconnect, giữ quyền trước đọc cache, hủy/tháo kết quả về muộn và test đếm adapter calls.
6. **T-6 — bằng chứng/model provenance.** Thêm runner/fixtures/measurements tái chạy benchmark;
   manifest tự tính hash sau download chỉ kiểm thay đổi sau đó, chưa phải checksum đã được review độc lập.
   Pin revision, validate file allowlist/paths và ghi đúng guarantee. Không tải/commit weights vào Git.
   Test không-egress ngoài mock fetch nếu tuyên bố runtime hoàn toàn offline.
7. **T-7 — nguồn và readiness.** Không dùng `QĐ-71` cho dịch. Lấy mã còn trống sau khi kiểm sổ hiện hành;
   đồng bộ BRD/US/Logical qua đúng workflow, không tự đánh dấu GVHD/dev approved. Quality threshold,
   container packaging và resource G5 còn là gate. Không có endpoint phù hợp hiện tại là dependency
   được ghi đúng, không cần dựng module giả để chứng minh task đã làm.

## Handoff

Hai prompt tiếp tục ở gốc workspace: một prompt khép remediation, một prompt khép dịch.
Chỉ lead/coordinator ghi file chung; sub-agent có phạm vi file riêng, code trên clone/worktree riêng.
Opus review không thay xác nhận của dev thật; Sonnet chưa sửa product khi spec/plan còn thiếu review bắt buộc.
Chưa có source sửa N-1 trong checkout sản phẩm; không ghi lỗi đã đóng từ kết quả prototype.
