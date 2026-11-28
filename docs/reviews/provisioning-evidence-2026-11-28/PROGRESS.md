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

| Gói | Trạng thái | sha      | EV                   | Lệnh kiểm + pass/fail thực tế                                        | CI                              |
| --- | ---------- | -------- | -------------------- | -------------------------------------------------------------------- | ------------------------------- |
| P1  | xong local | bac2e26f | SPEC §4              | quick checks exit 0; gates 346/346; unit 68/68                       | chưa chạy                       |
| P2a | xong local | b1a7440b | EV-01…05             | quick checks 0; gates 346/346; unit 116/116                          | chờ P5                          |
| P2b | xong local | 96d829a6 | EV-09/10/14 catalog  | typecheck/lint/arch/rules/format 0; gates 346/346; catalog 1079/1079 | chờ P5                          |
| P3a | xong local | d99e3371 | EV-06..12 complete   | quick checks 0; gates 346/346; unit 390/390                          | P5 pending                      |
| P3b | xong local | 6a3f48bd | EV-06..12 revocation | lint 4214 files; gates 346/346; catalog+licensing 2181/2181          | P5 pending                      |
| P4  | xong local | 0457a395 | EV-13..16            | quick checks 0; gates 346/346; unit 407/407; generators 474 ops      | P5 pending                      |
| P5  | tiếp tục   | aa0ad0f6 | SPEC §8, EV-08/09    | quick checks 0; gates 346/346; catalog+licensing 2194/2194           | D-2 đóng; kiểm vòng sửa CI 1 |

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

### D-2 — ĐÃ ĐÓNG: user cho phép thêm đúng route vào expectation inventory POST

- CI [46162602020](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020), job `http-contract` có **1 fail/2868 pass**, 124 suites (123 pass/1 fail).
- Test đỏ mới: `test/http/licensing/provisioning.http-spec.ts:414`, tên đầy đủ `provisioning queue routes (e2e, no database) › has no route that makes a revocation: each source opens it through the licensing facade (US-07-05 AC-3)`.
- Test so khớp toàn bộ POST của `/provisioning-tasks`, nhận thêm `/{id}/evidence-files/{fileId}/links` đúng SPEC EV-14. Run nền HTTP xanh nên đây là đỏ mới, không được gọi là nợ cũ.
- LUẬT CỨNG 4 cấm đổi expectation test cũ, chỉ cho ngoại lệ purpose list và số operation. Không thể thêm route đúng SPEC mà giữ nguyên inventory này; không đổi route/filter/OpenAPI/gate để né assertion.
- Giữ nguyên file test. Đề xuất cụ thể, **chưa áp dụng**: thêm đúng chuỗi `/{id}/evidence-files/{fileId}/links` vào mảng expected ở dòng 414–428; giữ nguyên mọi route cũ và assert `/revoke` 404. Patch để xem tại `D-2-proposed-http-expectation.patch`.
- P5 bị chặn bởi luật cứng, chưa hoàn tất. Chỉ thu nốt kết quả run hiện tại và bàn giao; không chạy vòng sửa CI hoặc commit code đỏ. Cần Owner cho phép thêm ngoại lệ này trước khi tiếp tục.
- Cập nhật sau snapshot bàn giao: user trả lời trực tiếp **“Cho phép thêm đúng route này”** cho câu hỏi về patch đã trình bày. Đã áp dụng đúng một dòng `/{id}/evidence-files/{fileId}/links`; không đổi kỳ vọng nào khác. D-2 đóng, tiếp tục P5 và các job integration còn chạy. Snapshot chặn trước đó giữ lại làm lịch sử, không phải trạng thái hiện tại.

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

## P4 — Route đọc file

- RED service: 8 fail/7 pass; GREEN: phạm vi đọc dùng `requireActingItAdmin(undefined, …)`; Super Admin bỏ qua acting check; IT ngoài phạm vi/EmployeeNotStarted/tác vụ chưa xếp phòng đã hoàn tất bị 404. Query task thêm `findInOrganization` không khóa để đảm bảo cả Super Admin không đọc chéo tổ chức.
- Kiểm cuối: typecheck, eslint các file sửa, arch/rules/format, arch:docs:check exit 0; gates **346 pass/0 fail**, 17 suites; unit provisioning **407 pass/0 fail**, 27 suites.
- Generator đã chạy `openapi:export`, `arch:routes`, `arch:graph`, capabilities licensing/catalog (không vòng); có **474 operations**. Không sửa tay generated files.
- Vòng sửa 1: bỏ cast thừa trong helper unit. Hai file support sát trần 400 dòng: chuyển nguyên entry của ba route hoàn tất sang file mảnh cùng feature; không đổi tên/value cũ. Hiện manifest success 398 dòng, coverage 399 dòng.
- Ruling: cập nhật số operation của HTTP presentation từ 472 lên 474 ngay cùng P4 thay vì đợi P5, để commit route không giữ kỳ vọng đếm sai đã biết. Đây đúng ngoại lệ EV-01 được user cho phép; HTTP chỉ chạy trên CI.
- Ruling: SPEC §8/PLAN P5 ghi validation UUID là 400, nhưng API contract và pipeline Zod hiện hành trả 422 `VALIDATION_ERROR`. Giữ hành vi 422 của repo theo luật không đổi behavior ngoài EV; test HTTP mới ở P5 sẽ khẳng định 422, không thay global pipe hay kỳ vọng test cũ. Đây là lệch tài liệu về HTTP validation, không mở quyền hay đổi luật gắn/xem file.
- Collection registry chỉ thêm entry bounded và ledger event của đúng route mới, nguồn SPEC EV-13/Q-EV3 và schema max(6)/repo take(6); giữ INITIAL registries và mọi gate/suppression.
- Skill bổ sung đã đọc: `requesting-code-review` và `code-reviewer.md`; sẽ dùng một reviewer ngữ cảnh mới cho toàn nhánh sau P5, chỉ đọc.

## P5 — Kiểm thử luồng và review toàn nhánh

- Preflight sau compact đã đọc lại đủ `executing-plans`, `test-driven-development` + `writing-good-tests.md`, `verification-before-completion`, `ponytail` full, repo `be-quick-check`, `create-migration`; không mapping tên skill.
- Thêm `ProvisioningEvidenceHarness` kế thừa `RevocationHarness`, giữ nguyên harness cũ; PostgreSQL thật, chỉ `FakeObjectStorage` và request gate là stand-in theo khuôn hiện có.
- Ruling: tách ca K1 thu hồi/cắt truy cập sang `provisioning-evidence-files-revocation.integration-spec.ts` với harness bắt buộc, các ca còn lại ở file chính. Mỗi file một app/database, tránh trộn hai harness hoặc sửa hành vi cũ; không bỏ ca nào.
- Integration bổ sung rollback sau file thứ nhất, SQLSTATE + tên constraint, barrier khóa hàng tài liệu ở connection thứ ba, đổi IT phụ trách, phòng mồ côi, storage 503 và số query ở 2/6 file. HTTP có role/UUID/body/OpenAPI, giữ 422 `VALIDATION_ERROR` theo ruling P4. Chưa chạy các spec này ở máy.
- Vòng sửa local 1: Prettier cần thêm một lượt format ở HTTP chain; lint ban đầu 1 lỗi format/0 cảnh báo, sau format 0 lỗi/0 cảnh báo. Không đổi rule hoặc test cũ.
- Review độc lập một lượt toàn nhánh (`595cdc48..0457a395` + file P5), reviewer chỉ đọc, không chạy DB/test hay sửa Git. Ba Important, không Critical/Minor, không có mục Declined to judge; chi tiết ở `REVIEW.md`. Không dispatch review lần hai.
- Final fix pass: chuẩn hóa chữ thường UUID trước Set/sort để cùng danh tính PostgreSQL có một thứ tự khóa; thêm 3 ca unit hồi quy. RED **3 fail/14 pass**, 2 suites. Sửa fixture đọc tác vụ thứ hai bằng IT2 và thêm ca phòng mồ côi; không đổi expectation test cũ.
- GREEN cuối: `CI=true pnpm test --maxWorkers=2 src/modules/catalog src/modules/licensing` **2194 pass/0 fail**, 209 suites; `CI=true pnpm test:gates` **346 pass/0 fail**, 17 suites. Typecheck, eslint 8 file, arch/rules/rules:format/format exit 0. Generators + arch:docs:check và capabilities hai module exit 0, không drift sinh ngoài P4. Chưa có kết quả integration/HTTP tại commit P5; sẽ push/dispatch và ghi bằng chứng CI sau.
- `Kiểm giữ:` fix catalog chỉ chuẩn hóa ID trước vòng khóa; giữ organization read, khóa/đọc lại document, uploader → purpose → trạng thái, markAttached và audit cùng tx. Policy giữ TOO_MANY trước DUPLICATE, không đổi empty/undefined. Không chạm service nghiệp vụ cũ ở fix này.
- Đã push `aa0ad0f6`, dispatch [46162602020](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46162602020). Run nền giữ cố định [46116992628](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/46116992628), không lấy dev mới thay nền. Nền: quality/http-contract/integration-inband xanh, e2e-smoke skipped; 637 test đỏ/108 suite ở ba shard integration.
- Skill đọc thêm: `finishing-a-development-branch`; menu merge/PR và chạy full local của skill không áp dụng vì user đã chỉ đạo giữ worktree/nhánh, không PR/merge, full chỉ CI. Không cần hỏi lại lựa chọn đã được chỉ định.
- Skill đọc thêm khi CI đỏ: `systematic-debugging`; trace log → inventory POST → route đúng EV-14 → luật cấm đổi expectation; không sửa production để né test.

### Bàn giao tại D-2 — 28/11/2026 23:11 (UTC+7)

- **P5 CHƯA XONG.** Tại snapshot cuối, run còn `in_progress`; không tuyên bố toàn CI xanh hoặc không có lỗi integration mới. Ba shard vẫn chạy. Phân loại test đỏ đã biết và link từng job tại `CI-CLASSIFICATION.md`.
- Đã xác nhận trên CI: quality xanh, unit **10266 pass/0 fail** (911 suites), gates **346 pass/0 fail** (17 suites); e2e-smoke **48 pass/0 fail** (10 suites); integration-inband timing **31 pass/0 fail** (8 suites), serial **100 pass/0 fail** (14 suites). HTTP **2868 pass/1 fail**, 123 suites pass/1 fail. Spec HTTP mới `provisioning-evidence-files.http-spec.ts` PASS.
- Không chạy vòng sửa CI vì D-2 cấm thay expectation cần thiết. Không cancel run đang chạy; điều phối có thể lấy log hoàn tất từ cùng run id. Không gọi lỗi mới này là nợ nền.
- Kiểm trước commit tài liệu bàn giao: typecheck/arch/rules/rules:format/format exit 0; eslint 4 file của fix cuối 0 lỗi/0 cảnh báo; gates **346 pass/0 fail**, 17 suites; unit hai file policy/catalog đã sửa **17 pass/0 fail**, 2 suites. Không thêm code production sau `aa0ad0f6`.
- Gần trần: `provisioning-task.repo.ts` **483 dòng code/500** (560 dòng vật lý); `document.service.ts` 498 dòng vật lý (không sửa); `openapi-example-manifest.ts` **398/400**, `api-coverage-manifest.ts` **399/400**, `api-collection-registry-events.ts` **391/400**; `revocation.policy.spec.ts` **389/400**, không thêm ca. Spec integration mới dài nhất 363/800, harness 38/400.
- Guard P1: giữ nguyên `document_attachment_guard` từ migration `20261022130000_document_final_key_and_expiry`; chỉ thêm hai migration mới, enum/cột/index/CHECK như SPEC. Không sửa migration cũ, requests, merged-migrations, dependency, gate/suppression; không PR/merge/rebase/stash.
- Báo cáo tổng được lưu tại `D:/FPT/FALL2026/NOTE MD/logsCodex.txt`, ghi rõ chặn D-2 và CI còn chạy để Claude tiếp tục kiểm. Đây là bàn giao dừng theo luật, không phải báo cáo P5 hoàn tất hay Owner acceptance.
- Full test chỉ chạy trên CI GitHub. Giữ nguyên worktree và nhánh chờ điều phối quyết định D-2.

### Tiếp tục sau D-2

- User cho phép thêm **đúng route link** vào expectation inventory POST. Patch đã áp dụng, diff test cũ chỉ một dòng thêm; không có thay đổi assertion/route cũ khác. Bản ghi bàn giao D-2 phía trên là lịch sử trước câu trả lời này.
- Shard integration (3) của run `46162602020` đã xong: **1801 pass/201 fail/4 skipped**, 164 suites pass/41 fail/1 skipped. Đối chiếu từng cặp file + full title: **201 nợ cũ, 0 mới**. `provisioning-evidence-files.integration-spec.ts` **PASS**.
- Vòng sửa CI 1 chỉ sửa expectation được phép; chờ kết quả hai shard còn lại và kiểm lại trước commit/dispatch. Không áp dụng lại thay đổi production.
- Shard integration (1): **1901 pass/257 fail/1 skipped**, 170 suites pass/37 fail; **256 nợ cũ/1 mới**. Ca mới K1 dừng ở fixture `no seat of E-EV-K1`, chưa tới thao tác file; ca K2 bảo toàn luật vẫn pass.
- Root cause K1 fixture: `SeatTargetService.resolveSubscription` (nhánh K1) trả target PLAN, `subscriptionId=null` theo W3-17; `RevocationHarness.seat({subscriptionId})` ghi được assignment nhưng đọc lại qua filter subscription cũ nên không tìm thấy. Unit có sẵn `seat-target-k1.service.spec.ts` ghim hành vi này. Sửa **test mới** thành `h.plan('K1')` + `h.seat({planId})`; không sửa harness cũ, production, filter hoặc expectation test cũ. Đây là sửa thứ hai trong cùng vòng CI 1, không phải mở luật K1/K2.
- Run đầu đã xong: integration shard 2 **1908 pass/180 fail**, 175 suites pass/31 fail; toàn bộ **180 nợ cũ/0 mới**. Tổng unique cả run **639 đỏ = 637 nợ cũ + 2 mới**, khớp đủ 637 cặp file/title của nền. Bảng từng test tại `CI-CLASSIFICATION-46162602020.md`; không phân loại chỉ theo số lượng.
- Kiểm vòng sửa CI 1: typecheck/eslint hai test/arch/rules/rules:format/format/generators/arch:docs:check exit 0; gates **346 pass/0 fail**; unit hai file đã sửa của implementation **17 pass/0 fail**. Hai thay đổi test đang chờ CI xác minh, không chạy HTTP/integration local.

### Self-review EV → kiểm thử

| EV    | Kiểm thử / file                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| 01–03 | `contract.policy.spec.ts`: purposes/roles, upload types, target và hiding; integration ca 8/9                |
| 04–05 | `contract.policy.spec.ts`: WebP signature/length; integration PNG/WebP ca 1, byte giả ca 9                   |
| 06–07 | grant/revocation service unit: omitted/empty IDs, ALREADY_GONE, EXTEND; integration ca 2/K1                  |
| 08    | evidence-files policy unit: max/duplicate/canonical UUID; integration ca 3                                   |
| 09–10 | catalog evidence service unit + repo unit; grant/revocation unit; integration ca 1/4/10 rollback/owner/audit |
| 11    | grant completion unit EXTEND; revocation completion unit ALREADY_GONE; K1 integration ca 6                   |
| 12    | service unit order/failure; integration ca 5 frame wins, ca 11 two connections/barrier                       |
| 13    | evidence service unit + repo unit; integration ca 1/7, collection 2/6 files/query projection                 |
| 14    | catalog/link unit, integration ca 7 TTL/no-store/audit without URL/foreign file                              |
| 15    | evidence service unit Super/IT/EmployeeNotStarted/TC-4; integration ca 7 current IT/orphan; HTTP role tests  |
| 16    | integration storage outage 503/no audit; existing shared HTTP mapping retained                               |
