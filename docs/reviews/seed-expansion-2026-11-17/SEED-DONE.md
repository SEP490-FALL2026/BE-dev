# SEED-v4-EXPAND — bàn giao 18/11/2026

Worktree `D:\FPT\FALL2026\Code\be-seed`, nhánh `feat/seed-v4-expand`, base `feat/p5` @ `1b5d4a39`. Làm tuần tự, không subagent. Không sửa sản phẩm, flow tests, repo Docs/WDP, không merge/deploy. Owner đã mở phạm vi đúng 3 seed integration tests cho fix D-17.

**Trạng thái:** các task code đã hoàn tất; CP1–CP4 và CP5 local/D0+1/CI đạt trên HEAD `0097724b`. CP6 **chưa đạt hai đèn DES/SAL RED**, Owner đã chọn giữ dữ liệu. Không coi CP6 đã nghiệm thu xanh.

## Skill và công cụ

TDD, verification-before-completion, executing-plans, systematic-debugging, git-workflow-and-versioning và security-and-hardening; dùng hướng dẫn repository AGENTS/operational commands/module structure/test guide. Giai đoạn trước theo LEDGER dùng superpowers TDD/verification. Công cụ: PowerShell, Git Bash, pnpm/Jest/ESLint/TypeScript/depcruise, Docker PostgreSQL/MinIO/Redis local, HTTP business API, Node/ExcelJS/pdf-lib, Git và gh. Không có tool browser/agent dùng để làm dữ liệu. Password/token không in hoặc commit.

## Bảng task và kiểm thực tế

`quick` = `pnpm typecheck`, `pnpm lint`, `pnpm exec jest src/cli/seed`, `pnpm test:gates`, `pnpm arch:check`, chạy bằng script ngoài repo `quick.sh`. Mỗi hàng quick xanh gồm 337 gates và không vi phạm kiến trúc; số test seed ở cột cuối. Dữ liệu trước CP2 lấy từ LEDGER/log bàn giao, các lượt CP2–CP6 đã kiểm lại trong phiên.

| Task | Commit | Lệnh / kết quả |
| --- | --- | --- |
| T0 | không commit | Mốc 171 seed tests, 337 gates, type/lint/arch pass |
| T1 | fc791f04 | quick: 175 seed tests |
| T1b | 41fac24b | quick: 205; build exit 0, font thật trong dist; PDF/XLSX thật |
| T2 | 9ad927e7 | quick: 214 |
| T3 | 34519de9 | quick: 222 |
| T4 | 3d1060d8 | quick: 225 |
| T5 | 416fe62f | quick: 235 |
| T6 | a5f6107b | quick: 239 |
| T7 | 112ca661 | quick: 249 |
| T8 | c222a231 | quick: 260 |
| T9 | 46cc0a11 | quick: 265 |
| T9b | 25661917 | quick: 287; CP1 lần 2 đạt sau sửa D-9 |
| T10 | 94250d3f | Chốt cùng T11/T12/T13 quick; API CP2 đạt |
| T11 | 34e76ef4, f43ae1cd | quick ban đầu 323; fix checklist ownership quick 377 |
| T12 | 364de17b, e192c729 | quick ban đầu 339; fix provisional R49/R58 quick 378 |
| T13 | 70a42cd8 | quick 354; continue C-13 API CP2 đạt |
| T14 | 9ef47a1c | quick 360; đủ ca S12, 6 dòng theo D-14 |
| T15 | 11aebaf6 | quick 365 sau retry heap 6144 MB; API BM09 đạt |
| T16 | da68b173 | quick 367; R57/DEV7 API đạt |
| T16b | 87a62008 | quick 372; D0+1 CP2 đạt |
| T17 | 66237852 | quick 381; CP3 usage6/G3/queues đạt |
| T18 | c09cb3c7, 90c3d208 | quick 387 rồi 388 sau fix envelope adjustment; CP3 hai renewal đạt |
| T19 | 05a64880 | quick 391; public/device auth và lỗi không token |
| T20 | a896f438 | quick 395; CP4 7 máy/5 BM06/4 xác nhận đạt |
| T21 | 4d669c96 | quick 401; CP4 ba collector, usage/status/rejections đạt |
| T22 | 8b82a634 | quick 404; CP4 1 OPEN/1 COMPLETED/0 INVALID |
| T23 | 9a216f45 | quick 409; CP4 3 audit REQUESTED SIMULATED |
| T24 | 5d10d7dc | Tách trước:409 pass; quick413; CP6 5 contracts/007R đạt |
| T25 | 80876e6c | quick417; CP6 Skype RETIRED |
| T29 | 87fda8d3 | quick421; CP6 13 invoices/quý/2 giải trình đạt; tài chính còn2fail |
| T26 | 98633cf3 | rules:format exit0 + final prettier check pass |
| Fix CI D-17 | 0097724b | 3 seed integration suites/14 tests pass; quick421/gates337; CI mới xanh |
| T27, T28 | chưa làm | Ngoài phạm vi, không sửa Docs/WDP |

Không task nào bị cắt vì trễ. TDD đỏ→xanh và các lỗi lint/type/heap trước xanh được giữ trong log; không dùng suppression hoặc giảm gate. Một commit/task theo PLAN, fix CP2/CP3 tách riêng.

## Checkpoint

| CP | HEAD | Seed DB rỗng | Continue cùng ngày | Count | Flows | D0+1 / tài chính |
| --- | --- | --- | --- | --- | --- | --- |
| CP1 lượt2 | 25661917 | exit0, CÓ1/GHI67 | exit2,CÓ68 |16/16|70 pass/9 skip/0 fail| D0+1 chưa thuộc CP1 |
| CP2 lượt2 | e192c729 | exit0,CÓ1/GHI88 | exit2,CÓ89 |83/83|70/9/0|clone exit0,CÓ88/GHI1; chỉ budget-adjustments |
| CP3 | 90c3d208 | exit0,CÓ1/GHI89 | exit2,CÓ90 |90/90|70/9/0|2 OUTCOME_RECORDED,0 PROPOSED |
| CP4 | 9a216f45 | exit0,CÓ1/GHI97 | exit2,CÓ98 |114/114|70/9/0|3 AI SIMULATED, 3 máy có usage/status, 0 intake rejection |
| CP6 | 87fda8d3 | exit0,CÓ1/GHI98 | exit2,CÓ99 |121/121|70/9/0|1098 pass/2 fail; CP6 chưa đạt |
| CP5 | 98633cf3 | exit0,CÓ1/GHI98 | exit2,CÓ99 |121/121|70/9/0|clone exit0,CÓ97/GHI2; chỉ usage LT001/LT002 và DEMO14 |

Mọi checkpoint: build exit0, DB/container disposable riêng local55433; test35446; API/count tắt trước flows (D-13). Không đặt biến consent Prisma. CP3 lần đầu đỏ do đọc nhầm envelope adjustment, đã thêm regression và fix. Một lần race build/seed làm mất generated client, dừng trước ghi DB; khắc phục bằng một build chờ exit/kiểm dist rồi mới seed.

CP6 A/B/D/F/G và các đẳng thức C đạt; C còn hai đèn đích: DES YELLOW cần RED, SAL UNDER cần RED. Các đèn ENG/ITO UNDER, BOD GREEN, FIN YELLOW đúng. `companySpent=162874000`; spent phòng ENG754000/SAL200000, phòng còn lại0. Hai hóa đơn 011/012 không gia hạn/đổi ghế. Quý3/6 SIGNED, quý9 có FIN/DES EXPLAINED và còn PENDING. E chỉ in số mua/giữ/trống, không nghiệm thu FR-5.10.

Script ngoài repo: `check-finance.mjs`, `finance-api.mjs`, `finance-arithmetic.mjs`, `finance-arithmetic.test.mjs` (3 pass), `run-finance-local.mjs` (đưa secret từ env local vào process env, không in). POST trong verifier chỉ đăng nhập và xin link tải tệp; không thay nghiệp vụ. Mọi log trong `Code/verify-logs/seed-v4-expand/CPn-*.log`, lịch sử đầy đủ `LEDGER.md`.

CP5 D0+1 dùng wrapper continue thật trên clone `slm_seed_cp5_nextday`, Date của CLI/API/worker +24h, API3101, Redis tạm56379; PostgreSQL wall clock và DB gốc giữ nguyên. `CP5-next-day-proof.log` đọc source/clone: DB gốc chỉ usage18/11; clone có thêm19/11 của LT001(2tool)/LT002(1tool), LT003 giữ18/11(2tool), stop vẫn1OPEN1COMPLETED và intake rejection0. Redis tạm đã dừng/tự xóa. Báo cáo không dùng mock để thay bằng chứng ngày sau.

## D-n và trạng thái

| D | Kết luận / còn chờ |
| --- | --- |
| D-1 | Module boundary cấm private import: template fake + source guard. Live G đã tải/so XLSX thật; không giả làm live test bằng mock. |
| D-2 | Usage header sửa last_active_date đúng API; đã kiểm seed thật. |
| D-3 | ExcelJS spliceRows với merged cells không xóa: clear row values; G đạt. |
| D-4 | BM10 header giá trị ở B cùng dòng nhãn, năm số/ngày chuỗi; G đạt. |
| D-5 | Tách file PDF/budget helper để giữ lint limits; đã xử lý. |
| D-6 | CSV header hằng + source guard thay tải lúc chạy; API nhập thật đạt. |
| D-7 | plan-warnings 9 gói, yêu cầu chứa Notion Plus/Confluence Premium; không kỳ vọng đúng2. |
| D-8 | D0 là ngày apply thực tế, lượt đầu qua nửa đêm neo18/11. |
| D-9 | Không placement lịch sử => không ghế-tháng quá khứ; nghi giới hạn sản phẩm chờ Owner xử lý nếu cần xu hướng. |
| D-10 | Tổng62 employees (58+SA+3IMP), không61; JetBrains2 khóa do R19 lấy1. |
| D-11 | Base chọn bước làm tròn giữ đèn, BM10 fitLines và cân tổng; requestedAmount không ép triệu nếu mất đèn. |
| D-12 | Prisma chặn reset AI: không đặt consent; tái tạo container suite dùng một lần, DB rỗng, đã Owner cho phép. |
| D-13 | ETIMEDOUT flows khi chạy API/count song song; chạy độc lập đạt70/9/0. |
| D-14 | S12 liệt kê6 dòng tính cả duplicate, bảng tổng ghi7 cộng lệch; giữ đủ6ca, chờ audit thống nhất spec. |
| D-15 | R49 phải đủ tiền tạm cho cả2 trước quyết từng dòng: thêm R58 BOD1 Adobe pending;19ca mới; không ép số, chờ audit sai khác18. |
| D-16 | Hai đèn RED không đạt dưới ràng buộc D-9/base bất biến/không Request mới MKT-DES-SAL. Owner trả lời “Giữ dữ liệu, ghi CP6 chưa đạt”. Giữ fail thật, không tự tạo QĐ. |
| D-17 | CI lần1 seed integration kỳ vọng cũ thiếu R40–R58 và NEW3 invited. Owner đã cho sửa đúng3file, commit0097724b giữ exact equality,14integration tests và quick421/gates337 xanh. Không sửa flows/sản phẩm. CI lần2 đã xanh. |

## Tài khoản demo theo vai

Không ghi mật khẩu: dùng password từ stdin/env local đã chọn khi seed.

| Vai | Tài khoản |
| --- | --- |
| Super Admin | system.admin@saoviet.example, NV-SA ở ADMIN |
| Finance | phuc.trinh@saoviet.example, NV-FIN1 |
| Người duyệt chi | an.nguyen@saoviet.example, NV-CEO |
| IT Admin | quan.ly@saoviet.example (ITA1), rang.mai@saoviet.example (ITA2), hai tài khoản còn lại trong README fixture |
| Trưởng phòng | cuong.le@saoviet.example (ENGH), thanh.tran@saoviet.example (ITOH), bich.tran@saoviet.example (DEP), khanh.bui@saoviet.example (DESH), yen.truong@saoviet.example (SALH) |
| Employee thiết bị | tuan.pham@saoviet.example (DEV5), hai.ngo@saoviet.example (ITO1), khai.tran@saoviet.example (BOD1), nga.phung@saoviet.example (BOD4) |
| Bị khóa / mời | BOD3 không đăng nhập; NEW3 lời mời chưa kích hoạt; không SMTP thật |

## Việc tài liệu FE cần sửa — T27 chưa làm

- `demo/README.md`: số liệu CP6 25apps/32plans/30subscription rows,62employees/44accounts, 48 Request trong fixture + R33 tạo ở demo.renewal = 49 Request nghiệp vụ, 5contracts/13invoices,6SaaS theo D-14,4BM09,2returns. Đã kiểm cấu trúc fixture thật trong CP5-fixture-summary.json.
- `demo/accounts.md`: toàn bảng người/tài khoản theo README BE; BOD3 locked, NEW3 invited, NEW2 unplaced; người giữ LT004 là BOD4.
- `demo/scenarios.md`: R40–R58, ca trả/hoàn tất, 007R, SBF20, thiết bị/collector, AI giả lập; 7máy/3ACTIVE/3usage/stop1OPEN1COMPLETED0INVALID; báo CP6 thiếu2RED.
- `roles/super-admin.md` và liên kết vai: ADMIN là phòng khởi đầu do lệnh cài đặt tạo theo QĐ-87f/QĐ-67a, mô hình phẳng, SA vẫn thuộc phòng nhưng không gửi Request. Cố ý không head/ITAdmin/CostCenter; giữ cảnh báo, không ẩn ADMIN hoặc gọi SA unplaced.
- `flows/ai-collector-device.md`: dữ liệu tool mô phỏng, mã enrollment dùng một lần phát lúc demo máy thật; LT003 đã dừng chỉ D0, LT001/LT002 có thêm ngày khi continue; không coi SIMULATED là model thật.

## Nợ test

CP5 local và D0+1 đã đạt. Năm test expectation fail ở CI lần1 đã sửa sau Owner cho phép3file;14test integration local xanh. CI lần2 đã xanh. Không skip hoặc giảm assertion. Jest local có cảnh báo worker thoát trễ trong log, lệnh exit0. Các mock/unit không chứng minh vận hành VPS hoặc collector thật; không kiểm WDP/MongoDB. Chỉ CI GitHub chạy full suite, local không chạy full integration/e2e. CP6 hai đèn fail được giữ theo Owner, không phải test bỏ qua.

## Nghi lỗi logic

Placement mới không thể lùi ngày về hireDate nên không tạo được lịch sử ghế-tháng cho demo. Nếu cần xu hướng, Owner phải quyết thay đổi sản phẩm first-placements hoặc phương án dữ liệu khác. Không sửa sản phẩm trong suite này. D-7 cảnh báo điều khoản cả K1 có thể là chủ ý, chưa kết luận bug. FR-5.10 tỷ lệ ghế Trống là nợ prompt4b.

## Chưa làm

T27 (cấm sửa Docs), T28 (điều phối chuyển WDP sau audit), hai đèn RED của CP6 theo quyết định giữ dữ liệu. Không task cắt. Không merge/push dev/main, không deploy, không seed DB chung/VPS. Không có công cụ gửi vào phiên điều phối khác; chỉ bàn giao nội dung/file, không tuyên bố đã gửi thông điệp nếu chưa thực hiện.

## CI

[Backend CI](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/44255186390): **success**, HEAD `0097724b6609bd6f0cd80ce178d73e7dd9aa8ff1`, workflow_dispatch trên `feat/seed-v4-expand`. Không deploy.

Quality: 607 unit suites / 8.147 test, 337 gates; schema/migration, OpenAPI, build, format/lint/type/architecture và audit production dependencies đạt. HTTP: 111 suites / 2.583 test; e2e: 10 suites / 48 test; integration-inband: 7 suites/28 timing tests và 13 suites/97 serial tests. Integration shard 1: 176 suites, 2.020 pass/1 skip test; shard 2: 176 suites, 1.966 pass; shard 3: 174 pass/1 skip suite, 1.836 pass/4 skip tests. Tất cả số này lấy từ log run lần2.

| Job | Kết quả |
| --- | --- |
| select | success |
| e2e-smoke | success |
| quality | success |
| http-contract | success |
| integration (1) | success |
| integration-inband | success |
| integration (3) | success |
| integration (2) | success |
| Deploy to VPS | skipped |

Run lần1 44250344039 đỏ5test expectation; log được giữ, không dùng kết quả cũ để khẳng định run mới. Bảng job bên trên và log lần2 chứng minh commit cuối. Log CI: `CP5-ci*.log`, JSON `CP5-ci.json`; branch đã push, source sạch, chỉ SEED-DONE.md ngoài commit. Không merge dev/main, không sửa Docs/WDP.

**SEED XONG phần triển khai và kiểm trong phạm vi đã thống nhất; CP6 vẫn chưa đạt hai đèn RED theo lựa chọn giữ dữ liệu của Owner.**