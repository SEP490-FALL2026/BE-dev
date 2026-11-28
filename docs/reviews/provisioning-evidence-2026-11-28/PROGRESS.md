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

| Gói | Trạng thái | sha        | EV                   | Lệnh kiểm + pass/fail thực tế                                        | CI            |
| --- | ---------- | ---------- | -------------------- | -------------------------------------------------------------------- | ------------- |
| P1  | xong local | bac2e26f   | SPEC §4              | quick checks exit 0; gates 346/346; unit 68/68                       | chưa chạy     |
| P2a | xong local | b1a7440b   | EV-01…05             | quick checks 0; gates 346/346; unit 116/116                          | chờ P5        |
| P2b | xong local | 96d829a6   | EV-09/10/14 catalog  | typecheck/lint/arch/rules/format 0; gates 346/346; catalog 1079/1079 | chờ P5        |
| P3a | xong local | d99e3371   | EV-06..12 complete   | quick checks 0; gates 346/346; unit 390/390                          | P5 pending    |
| P3b | xong local | commit P3b | EV-06..12 revocation | lint 4214 files; gates 346/346; catalog+licensing 2181/2181          | P5 pending    |
| P4  | chờ        | —          | EV-13…16             | chưa chạy                                                            | chưa chạy     |
| P5  | chờ        | —          | SPEC §8              | chưa chạy                                                            | chưa dispatch |

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

## P3a — Hoàn tất cấp

- Skill bổ sung đã đọc: `debugging-and-error-recovery` để chẩn đoán lỗi kiểm nhanh theo log, sửa tối thiểu và kiểm lại đúng bước đỏ.
- RED: 16 fail/16 ca mới; GREEN và kiểm cuối: `CI=true pnpm test -- src/modules/licensing/provisioning` **390 pass/0 fail**, 27 suites.
- `typecheck`, eslint các file sửa, `arch:check`, `rules:check`, `format:check`: exit 0; gates **346 pass/0 fail**, 17 suites. Vòng sửa 1: matcher bất đối xứng của Jest bị kiểu `any` nên thay bằng khẳng định lớp lỗi + problem; format lại DTO. Không nới rule hay kỳ vọng cũ.
- Ruling: `write` chung gắn file ở dòng đầu trước khi rẽ GRANT/EXTEND; `writeExtension` không gắn lần hai. Cả hai nhánh trả mảng id từ `write` để dựng audit; unit chứng minh đúng một lần gắn, trước mọi ghi và không markCompleted khi gắn bị từ chối. Input type dùng chung cho hai nhánh để giữ trần 60 dòng/hàm.
- `Kiểm giữ:` `assertItAdmin`, khóa và đọc lại tác vụ, `requireActingItAdmin`, `cleanEvidence`/K1 trước frame, `assertNotRevocationTask`, `nextStatus`, `assertKeyFits`, checklist K1, `markCompleted`, khóa/chọn K4, `recordGranted`, gate báo kết quả và `markCostBorne` giữ thứ tự cũ giữa chúng.
- Thêm hàng khóa `3c` trong database rules; registry mã 422 dùng file mảnh. Chưa sửa service thu hồi.

## P3b — Hoàn tất thu hồi và cắt truy cập

- RED: 7 fail/2 pass ở spec service; GREEN và kiểm nhanh cuối: provisioning **397 pass/0 fail**, 27 suites; gates **346 pass/0 fail**, 17 suites; typecheck/eslint/arch/rules/format exit 0.
- Ruling: service đã đủ 8 phụ thuộc. Chuyển nguyên `planOf` và `completedOf` của `RevocationCompletedFactsReader` vào `RevocationAftermath` cùng nhóm; giữ mọi query/guard/thứ tự đọc. Xóa reader trung gian không còn caller; constructor aftermath có 7 phụ thuộc, completion có 8 kể cả file bằng chứng. Test cũ chỉ cập nhật fixture constructor, không đổi kỳ vọng.
- Vòng sửa 1: lint báo complete 61 dòng do chữ ký input mở rộng; đưa kiểu input ra `EvidenceCompletionInput`, thân callback và thứ tự cũ không đổi. Không tăng trần/suppression.
- `Kiểm giữ:` `assertRevocationTask`, `nextStatus`, `assertNotBefore`, `BEFORE_WORK`, đọc plan, `lockLine`, `ending.lock`, checklist K1, `planCompletion`/`cleanEvidence`/note `ALREADY_GONE`, `planKeyReturn`, ghi hoàn tất/kết thúc quyền, completion facts/`AFTER_WORK`, aftermath; access-cut giữ `NOT_TERMINATING`, `AssignmentNotOpenError`, `planAccessCut` và shorten. Gắn file đứng trước chúng trong write theo EV-09/12.
- Unit mới kiểm attach trước khóa/ghi, lỗi attach không khóa/ghi, audit mảng rỗng khi không gửi file, `ALREADY_GONE` có note vẫn gửi file được. Registry mã 422 của cả hai route đã chuyển vào cùng file mảnh.
- Mốc P3b đang chạy: typecheck, toàn lint, gates, unit catalog + licensing; chỉ sang P4 khi xanh.

### Trạng thái khi lượt thực thi bị ngắt

- P3a đã commit `d99e3371`; P3b còn WIP, chưa commit. P4/P5 chưa triển khai, chưa push hoặc dispatch CI.
- Mốc P3b: typecheck exit 0; `pnpm lint` mặc định kết thúc exit 134 với lỗi hết heap khoảng 4 GB. Không phải kết quả lint xanh.
- Đã thử lại với `NODE_OPTIONS=--max-old-space-size=6144`, cùng mức của `.github/workflows/ci.yml:146`; lượt này bị ngắt trước khi ghi nhận kết quả. Session `31418` không còn tồn tại và PID node đã theo dõi `34888` không còn hiện diện khi kiểm tra lại. Không kết luận mốc đã đạt.
- Bộ kiểm nhanh P3b trước mốc vẫn có bằng chứng: typecheck/eslint/arch/rules/format exit 0; gates 346 pass/0 fail; unit provisioning 397 pass/0 fail. Chưa có kết quả unit catalog + licensing của mốc này.
- Log CI nền đã trích được 637 test đỏ duy nhất thuộc 108 suite (`baseline-failures.log`, file log không commit); chưa phân loại run nhánh vì chưa tới P5.

### Tiếp tục sau lần ngắt

- Theo yêu cầu tiếp tục của user, lint đã kiểm **đủ 4.214 file**, 15 lô, **0 lỗi/0 cảnh báo**. Tập file khớp cả `rg --hidden --no-ignore`; chỉ loại `src/generated/**` đúng cấu hình ESLint. Mọi log lô đều rỗng, exit 0.
- Ruling về môi trường: sau OOM của `pnpm lint` và lần heap 6144 MB bị ngắt, gọi đúng CLI ESLint đã cài (`node node_modules/eslint/bin/eslint.js <files>`) theo lô để giới hạn RAM/độ dài command line Windows. Không đổi tập file, cấu hình, rule, threshold hoặc suppression. Giữ nguyên bằng chứng OOM, không báo lệnh `pnpm lint` cũ xanh.
- Đang kiểm mới typecheck/arch/rules/format/gates và toàn unit catalog + licensing với `maxWorkers=2` để giới hạn RAM; không chạy integration/http/full unit ở máy.
- Báo cáo tổng khi xong P5 sẽ lưu tại `D:/FPT/FALL2026/NOTE MD/logsCodex.txt` theo yêu cầu mới của user; file hiện trống khi đọc.
- Mốc P3b đã đạt: lint đủ 4.214 file xanh theo lô; typecheck/arch/rules/format exit 0; gates **346 pass/0 fail** (17 suites); `CI=true pnpm test --maxWorkers=2 src/modules/catalog src/modules/licensing` **2181 pass/0 fail**, 209 suites. Có thể sang P4.
