# Đêm 17/11 — kế hoạch của chat điều phối 123 (Owner chốt qua chat 122)

## Quyết định Owner
1. R2-8 = làm `S20-T4c` (A1).
2. A2-12 = không làm, để 4b.
3. Đưa prompt 5 sang WDP **ngay trong đêm** khi `feat/p5` xanh.
4. Chế độ đêm:
   - điểm chưa có nguồn thì tự chốt `D-n` và ghi file quyết định;
   - không push/merge `dev`/`main`, không deploy;
   - được push nhánh tính năng và chạy CI ở cả hai repo BE.

## Trình tự
1. **SEP:**
   - merge vào `feat/p5` theo thứ tự A2 (lõi) → A1 → C → B, kiểm sau mỗi lần merge (theo `feedback_batch_review_depth`);
   - full CI GitHub, `test:flows`, `seed:local` trên DB trống;
   - push `feat/p5` lên `SEP490-FALL2026/BE-dev`.
2. **WDP-1** (chat 84): nhánh `feat/wdp-ai-history` = `origin/dev` + `feat/AI-services` + MongoDB trong CI/compose prod + preflight
   deploy. Điều phối review/verify.
3. **Đưa P5 sang WDP. KHÔNG copy đè thư mục**, vì sẽ mất code MongoDB của dev Hiển và migration riêng của WDP.
   - Tạo nhánh `feat/wdp-p5` từ `feat/wdp-ai-history`.
   - `git -C <SEP> diff 94a8ee84..feat/p5 > p5.patch`, rồi `git apply --3way p5.patch` trong BE-WDP.
     Có thể áp được vì WDP `dev` có `src`/`prisma`/`test` giống hệt `94a8ee84`.
   - Giải xung đột `ai-assist`: dời code MongoDB của Hiển thành adapter cài port `AiInvocationHistoryStore`, chọn adapter theo env
     (`AI_HISTORY_STORE=mongodb|postgres`, WDP mặc định `mongodb`).
   - Giữ migration WDP `20261116100000_ai_history_mongodb`; migration P5 đều đứng sau nó.
   - Tính lại số đếm tham số theo nhánh WDP.
   - Full CI GitHub repo WDP (có MongoDB), `test:flows`, seed DB trống, push nhánh để Owner merge `dev` → `main`.
4. **Trước sáng:**
   - Tài liệu API sinh lại theo bản cuối và commit Docs `main`:
     - route mới, lỗi, thông báo, catalog;
     - changelog FE prompt 5;
     - thay đổi FE của SBF-20 theo vai.
   - Danh sách env mới cho VPS: `MONGODB_*`, mật khẩu MongoDB của compose prod, `AI_SERVICE_*`, `AI_PROVIDER_MODE`, `AI_HISTORY_STORE`.
   - Lệnh seed (gồm `seed.sh --continue` cho DEMO-14).
   - Báo cáo sáng `MORNING-REPORT.md`: đã làm, `D-n` tự chốt, việc Owner.

## Việc Owner sáng mai
1. Merge, deploy WDP (VPS deploy từ WDP `main`).
2. Modal AI.
3. Seed lại.
4. Test sơ AI và tool.
5. Giao FE.

## Audit bắt buộc trước khi báo xong (Owner 17/11 đêm, qua chat 122)
Mỗi nhánh A2, A1, C, B và bản WDP (patch + adapter MongoDB) phải được kiểm theo các mục dưới, biên bản ghi vào `p5/AUDIT-<nhánh>.md`,
tóm tắt ở `MORNING-REPORT.md`.

1. **Đối chiếu** code thật với:
   - spec;
   - kiến trúc: `AGENTS.md`, `ARCHITECTURE.md`, `docs/rules`, ADR — tầng module, facade, extension point, DI theo graph, migration forward-only, gates;
   - logic: transaction, idempotency, ca biên, không 500;
   - nghiệp vụ: BRD §5.10, `BR-MFn-xx`, sơ đồ MF/SBF, sổ QĐ mới nhất;
   - phân quyền/SoD.
2. **Đọc tận tay** migration, SQL và phân quyền.
3. **Test thật trên bản sạch:** file chạm, thư mục module, `test:http` toàn bộ; mutation ở chỗ chính.
4. **Agent review:** 1–3 agent Opus chỉ đọc, theo `Code/audit-tools/review-brief.md`.
5. **Lỗi logic:** gửi FIX cho chat code, rồi verify lại FIX.
6. **Chỉ báo xong** khi CI GitHub đầy đủ xanh trên cả hai repo.

## Sau prompt 5 (Owner 17/11 chiều)
Thứ tự:
1. Xong WDP-2.
2. Gom về 2 thư mục BE. Owner push và merge `dev`, sau đó xóa các nhánh chỉ dùng để chạy CI.
3. Lượt kiểm nhỏ trước khi giao FE:
   - smoke API thật theo vai (local đã seed);
   - mutation ở 3–4 chỗ chính: số seat cần, điểm điều chỉnh, thông báo lô, render biến vắng.
   Đối chiếu nghiệp vụ từng dòng để prompt 4a.
4. Dọn `verify-logs`.
5. Hướng dẫn deploy AI: `AI-DEPLOY-GUIDE.md`.
6. Seed mở rộng: `SEED-AUDIT.md` → spec → chat Sonnet → audit.

Luật test: suite đầy đủ chạy trên GitHub CI. Ở local chỉ chạy 1 file test khi làm mutation, và smoke qua API trên app local.
