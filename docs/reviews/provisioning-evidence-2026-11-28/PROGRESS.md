# PROGRESS — Provisioning evidence files

Skill đã đọc: `ponytail` (full), `using-superpowers`, `using-agent-skills`, `executing-plans`, `test-driven-development` (+ `writing-good-tests.md`), `verification-before-completion`, `git-workflow-and-versioning`, `using-git-worktrees`, repo `be-quick-check`, repo `create-migration`. Không cần mapping tên skill.

## Nền và phạm vi

- Worktree `D:/FPT/FALL2026/Code/BE-evidence`; branch `feat/provisioning-evidence-files`; HEAD đầu `3cd7e875`, base `595cdc48`; worktree sạch khi bắt đầu.
- `git fetch origin`: thành công (ngoài sandbox); không merge/rebase/chuyển nhánh.
- `pnpm.cmd install --frozen-lockfile --prefer-offline`: exit 0, không đổi dependency.
- Run nền dev mới nhất đã xong: [46116992628](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46116992628), `failure`, 2026-11-28 06:31:21 UTC; phân loại từng test ở P5.
- Full test chỉ chạy trên CI GitHub. Không chạy integration/http/Docker/seed/migration ở máy; SQL migration được viết theo SPEC, thay cho lệnh `db:migrate:dev` trong skill do giới hạn trực tiếp của task.
- Ledger dùng file này theo yêu cầu task; không tạo workspace/brief trùng lặp của skill. Thực thi tuần tự P1 → P2a → P2b → P3a → P3b → P4 → P5.

## Gói và bằng chứng

| Gói | Trạng thái | sha        | EV                  | Lệnh kiểm + pass/fail thực tế                                        | CI            |
| --- | ---------- | ---------- | ------------------- | -------------------------------------------------------------------- | ------------- |
| P1  | xong local | bac2e26f   | SPEC §4             | quick checks exit 0; gates 346/346; unit 68/68                       | chưa chạy     |
| P2a | xong local | b1a7440b   | EV-01…05            | quick checks 0; gates 346/346; unit 116/116                          | chờ P5        |
| P2b | xong local | commit P2b | EV-09/10/14 catalog | typecheck/lint/arch/rules/format 0; gates 346/346; catalog 1079/1079 | chờ P5        |
| P3a | chờ        | —          | EV-06…12 complete   | chưa chạy                                                            | chưa chạy     |
| P3b | chờ        | —          | EV-06…12 revocation | chưa chạy                                                            | chưa chạy     |
| P4  | chờ        | —          | EV-13…16            | chưa chạy                                                            | chưa chạy     |
| P5  | chờ        | —          | SPEC §8             | chưa chạy                                                            | chưa dispatch |

## Pre-flight interfaces

- P1 → P2: `DocumentPurpose` union và Prisma enum đồng bộ trong P1; khai báo DTO chỉ mở ở P2a.
- P2b → P3/P4: attach cùng `DbTx`, lỗi public `DocumentAttachRefusedError`, list/link qua public API; không query catalog từ licensing.
- P3a → P3b: policy danh sách, attach service, lỗi và `AuditValue` chung; attach trước mọi ghi/khóa tầng thấp.
- P3 → P4: file READY mở qua route riêng, xét `requireActingItAdmin` hiện tại; không qua scope đọc rộng.
- P1 guard: định nghĩa mới nhất `20261022130000_document_final_key_and_expiry`; giữ nguyên `document_attachment_guard`, không `CREATE OR REPLACE` trong M2.

## D-n

### D-1 — ĐÃ ĐÓNG: lỗi chữ trong SPEC, commit d8f59225

- SPEC §8 ca 6 yêu cầu: “Thu hồi K2 `UNTIL_PAID_END` kèm 1 PDF, rồi `access-cut` kèm 1 ảnh `ACCESS_CUT_EVIDENCE`”. PLAN P5 đòi đủ nguyên 11 ca.
- Code hiện hành: `revocation.policy.ts:78-85` chỉ cho K1 `RENEWAL_CANCELLED`; K2 chỉ `ACCOUNT_REMOVED`/`ALREADY_GONE`. `planCompletion` ở dòng 176-185 từ chối mọi access field của cách không phải `RENEWAL_CANCELLED`. Mapper trả 422 `REVOCATION.COMPLETION_NOT_ALLOWED`.
- Unit có sẵn `revocation.policy.spec.ts:99-135` ghim rõ K2 không dùng `RENEWAL_CANCELLED` và không nhận `paidThroughOn`, `accessState`, `accessCutOn`, `accessEvidence`. Đã chạy nguyên file: **62 pass, 0 fail**, không sửa test/kỳ vọng cũ.
- Giữ hành vi cũ theo LUẬT CỨNG 1 và 4. Không tự đổi K2 thành K1 trong test, không mở luật K2 để làm xanh.
- Đã xử lý theo chỉ đạo user và SPEC 1.3 `d8f59225`: ca 6 là **K1** `UNTIL_PAID_END`, dùng checklist theo test hiện hành. K2 giữ 422 `REVOCATION.COMPLETION_NOT_ALLOWED`.
- Lịch sử: đợt trước dừng sau P1 vì mâu thuẫn này. Nay tiếp tục P2a → P5, không cần thay đổi nghiệp vụ thu hồi.

## Kiểm chứng P1

- RED: `CI=true pnpm.cmd test -- src/modules/catalog/contract/contract.policy.spec.ts --runInBand`: 64 pass, **4 fail** do hai khóa purpose chưa tồn tại trong `PURPOSE_ROLES` (runtime TypeError, không phải lỗi biên dịch). Bốn ca thêm mới bao phủ IT được chọn và Finance bị `DocumentPurposeForbiddenError`.
- GREEN: `CI=true pnpm.cmd test -- src/modules/catalog/contract/contract.policy.spec.ts`: **68 pass, 0 fail**, 1 suite.
- `pnpm.cmd prisma:validate`: exit 0; `pnpm.cmd prisma:generate`: exit 0; không kết nối/chạy migration DB.
- `pnpm.cmd typecheck`: exit 0.
- `pnpm.cmd exec eslint src/modules/catalog/contract/contract.policy.ts src/modules/catalog/contract/contract.policy.spec.ts`: exit 0.
- `pnpm.cmd arch:check`: exit 0, 3 211 modules/17 316 dependencies, 0 violation.
- `pnpm.cmd rules:check`: exit 0, 565 files/4 243 links, 0 error.
- `pnpm.cmd format:check`: exit 0.
- `CI=true pnpm.cmd test:gates`: **346 pass, 0 fail**, 17 suites, gồm `migration-order.gate-spec.ts`.
- Mapping lệnh PLAN P1: `pnpm test -- test/gates/migration-order.gate-spec.ts` dùng runner unit (`src/.*.spec.ts$`) nên không chọn gate. Gate được kiểm bằng runner đúng `test:gates` ở trên; không đổi config/runner.
- Self-review: đúng hai migration mới; enum/cột nullable/index đồng bộ; hai CHECK chép định nghĩa hiện hành và thêm đúng owner mới; không FK mới; không thay guard/migration cũ/merged manifest. `NEW_DOCUMENT_PURPOSES` chưa đổi (để P2a).
- `Kiểm giữ:` P3 chưa triển khai; không service ghi cũ nào được sửa.
- File gần trần có sẵn: `document.service.ts` 498 dòng tổng; `revocation.policy.spec.ts` 389/400 dòng; cả hai chưa sửa. `contract.policy.spec.ts` sau P1: 303/400 dòng.
- Tính năng chưa dùng được: P1 chỉ chuẩn bị schema/type/quyền chọn ở policy; chưa mở DTO upload, chưa gắn/đọc file.
- Trước commit báo cáo dừng, chạy lại đúng bộ kiểm nhanh PLAN §4: typecheck/eslint/arch/rules/format đều exit 0; gates **346 pass, 0 fail** (17 suites); unit policy **68 pass, 0 fail** (1 suite). Không đổi source sau commit P1; báo cáo ghi sha `bac2e26f`.
- CI: chưa dispatch run nhánh, chưa phân loại từng test đỏ vì dừng trước P5. Log nền đã tải để tra cứu, không dùng kết quả local để kết luận CI xanh.

- Tiếp tục theo SPEC 1.3 `d8f59225`; không sửa lại P1.

## P2a — EV-01…05

- RED: contract policy 7 fail/67 pass; GREEN: catalog/contract 116 pass/0 fail (3 suites). Unit policy has 74 cases.
- Quick checks: typecheck, changed-file eslint, arch:check, rules:check, format:check exit 0; gates 346 pass/0 fail (17 suites); targeted unit 116 pass/0 fail.
- Self-review: WebP only for two new purposes; existing MIME/size/name rules kept; signature uses pictureKindOf; READY evidence is HIDDEN for general routes. DocumentService already passes purpose through `{ ...input, maxBytes }`, so no edit needed there.

## P2b — Catalog

- Ruling: `CatalogApi` đã đủ 8 phụ thuộc. Bỏ lớp `OnboardingFactsService` trung gian: ba phép đếm giữ nguyên thứ tự ở facade, `getPlanSummaries` gọi trực tiếp `PlanFactsService.summaries`; `SubscriptionFactsService` mở `count` qua repo hiện có. Chỗ trống dùng cho service bằng chứng, không tăng trần/gate hoặc thêm facade. Thêm unit bảo toàn kết quả onboarding và mapping lỗi public. Chỉ mở rộng file trong catalog; không đổi nghiệp vụ.
- RED service: 9 fail/9 total vì chưa có hành vi; GREEN: 9 pass/0 fail.
- Vòng sửa 1: lint bắt `require-await` trong test doubles và format chuỗi mock; sửa `Promise.resolve` và format, không đổi kỳ vọng test hay suppression. Lint chạy lại exit 0.
- Vòng sửa 2: gate chỉ còn `catalog/public: 26 files`; thêm các ca facade vào `catalog-duplicate.policy.spec.ts` hiện có cùng thư mục (25 file), không thay kỳ vọng cũ. Không tăng trần gate hoặc tạo ngoại lệ.
- Kết quả cuối: `pnpm typecheck`, eslint các file sửa, `arch:check`, `rules:check`, `format:check` exit 0; `CI=true pnpm test:gates` 346 pass/0 fail (17 suites); `CI=true pnpm test -- src/modules/catalog` 1079 pass/0 fail (103 suites). Đây đồng thời là mốc sau P2b.
- Self-review EV-09/10/14: khóa id tăng, uploader → purpose → trạng thái, ghi/audit cùng tx; query list chỉ projection READY của task, take 6, attachedAt/id; query link lọc cả task/id/status/purpose, ký 300 giây và audit chỉ expiresAt. Không qua mayOpen ở route riêng.
