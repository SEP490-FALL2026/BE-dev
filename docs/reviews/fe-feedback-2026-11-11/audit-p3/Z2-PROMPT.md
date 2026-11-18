# Z2 — seed, flows, dữ liệu demo cho FE (prompt 3, Opus làm; chat điều phối "SEP-Start 122" giao 16/11/2026)

Trả lời/ghi chép tiếng Việt; code, commit message, đường dẫn giữ tiếng Anh.

## 0. Đọc trước (đọc đúng mục, đừng nạp cả file lớn)
- `D:\FPT\FALL2026\CLAUDE.md` (Skill Preflight: chọn process skill + domain skill + `superpowers:verification-before-completion`, đọc SKILL.md).
- `D:\FPT\FALL2026\Code\be-z2\AGENTS.md` + rules BE nó dẫn (kiến trúc, test/README.md, seed).
- Nguồn yêu cầu Z2 (thứ tự thẩm quyền QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code):
  - `docs/reviews/fe-feedback-2026-11-11/SPEC.md` §Z2 (dòng ~613–640: 15 kịch bản DEMO-1…15, dữ liệu chung, flows) và `PLAN.md` §Z2 (~258).
  - Mọi dòng "seed cần cho Z2" / "Z2 (prompt 4)" trong `OVERNIGHT-DECISIONS.md` (grep `Z2`), mục "Seed cần cho Z2" của `OVERNIGHT-DECISIONS-LANE-B.md`, `PROMPT3-DONE.md`, `POLICY-SEED-DRAFT.md` (8 chính sách), `DECISIONS.md`.
  - Kịch bản MF-2/MF-3 đã có trong seed (gói Z của `docs/reviews/mf2-mf3-2026-11-10/`) — giữ và sửa cho hợp code mới.
  - BRD: `D:\FPT\FALL2026\Docs\Requiments\BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md` §5.10 (5 MF) khi cần luật nghiệp vụ.

## 1. Phạm vi và ranh giới
- Worktree **`D:\FPT\FALL2026\Code\be-z2`**, nhánh **`feat/z2-seed`** (tách từ `feat/fe-feedback` @ `1f7ffa19`, deps đã cài). Commit vào nhánh này, **không push/merge**.
- Được sửa: `src/cli/seed/**` (fixture `shared-demo-v4`, steps, README fixture), `test/flows/**`, `test/support/flows/**`, `test/integration/installation/seed*`, `test/integration/**/_serial/seed-check-runtime*`, `scripts/dev/seed-local*` nếu cần, `docs/roadmap.md`, `docs/examples/**`.
- **Không** sửa code sản phẩm (`src/modules/**`, `prisma/**`, migration, `openapi.json`) và **không** sửa test khác — chat "SEP-Start 83" đang sửa nợ test trên `feat/fe-feedback`, đụng file chung sẽ xung đột khi merge. Seed lộ **lỗi sản phẩm** ⟹ ghi vào `Z2-NOTES.md` mục "Nghi lỗi sản phẩm" (route · input · kỳ vọng theo QĐ/BRD · thực tế), dựng dữ liệu đi đường hợp lệ khác nếu được, làm tiếp.
- Quyết định chưa có nguồn: tự cân 2–3 phương án theo thứ tự thẩm quyền trên, chọn, ghi `D-Z2-n` (câu hỏi · phương án · chọn + căn cứ · file/commit · cách đổi lại) trong `docs/reviews/fe-feedback-2026-11-11/Z2-NOTES.md`.

## 2. Việc phải làm
1. **Sửa seed đang đỏ** do code prompt 3: bỏ tỷ giá/giá ngoại tệ (route `/exchange-rates` đã xóa; giá VND, giá gốc ngoại tệ ở cột có cấu trúc), bỏ quý/Trần phòng/dòng `BM-10`/publish ngân sách, gửi `checklist` hợp lệ ở mọi route quyết định đòi checklist (đọc bản hiện hành `GET /policies/{code}/steps/{stepCode}`, mọi câu *Có*) — PL-2-O2/O7/O12, FIX-PL2-O4 (`request.steps.ts:161` lô có `reserveConfirmations`).
2. **Dữ liệu chung**: 7 nhóm chức năng; kỳ ngân sách 2027 nháp + đang mở; 8 chính sách đã xuất bản + 1 bản chờ xác nhận lại; logo (CT-1, ảnh mẫu, không ảnh người thật); mọi ngày = `seedDate` ± khoảng (ngày làm việc khi luật tính ngày làm việc); README fixture ghi "seed lại ≤ 1 ngày trước demo".
3. **15 kịch bản DEMO-1…DEMO-15** đúng trạng thái SPEC §Z2, cộng các ghi chú seed cụ thể trong OVERNIGHT (US-2-O1 `G4 MONITOR`, PI-1-O1 hóa đơn 3 trạng thái, PI-2-O3 cờ *chưa có hóa đơn*, FIX-AD1-O5 điều chỉnh khi kỳ đã khóa, SM-1 seat-tháng `chargeMonth` các tháng đã qua…). Giữ các kịch bản MF-2/MF-3 cũ.
4. **`test:flows`**: thêm flow `MF-4` mới (nháp → mở → nộp `BM-10` → chốt → duyệt/trả về) và mua/chứng từ (nộp hóa đơn → ký → thực chi tháng kỳ); sửa mọi flow cũ cho hợp code mới. Toàn bộ `pnpm test:flows` xanh.
5. **Roadmap**: cập nhật `docs/roadmap.md` theo SPEC §Z2.

## 3. Kiểm chứng (bắt buộc kỹ — Owner sẽ DROP DB trên VPS rồi deploy lại từ đầu)
DB test riêng của bạn: container `slm-test-db-b`, `127.0.0.1:35433` (`TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:35433/postgres`, bootstrap `ci_bootstrap:ci-bootstrap-only`), Redis `127.0.0.1:6379`. `--maxWorkers=2` tối đa (máy đang chạy song song CI và chat khác). Docker treo (500) ⟹ `docker desktop restart`, dựng lại bằng `bash C:/Users/Asus/AppData/Local/Temp/claude/cb9d99d994b36370/c27266ac-740e-4502-b0ab-d8e5058375d3/scratchpad/make-test-db.sh slm-test-db-b 35433`.
1. **Từ DB trống**: tạo DB mới trong 35433 ⟹ `migrate deploy` ⟹ bootstrap ⟹ `pnpm seed:local` (cấu hình `.env.seed.local` từ `.env.seed.local.example`, không commit file env, không mật khẩu thật) ⟹ exit 0, không bước lỗi.
2. **Chạy lại seed** trên DB đã seed (ca rerun) và **seed theo lịch/ngày khác** (`seed-calendar`) — đúng như các suite seed kỳ vọng.
3. Xanh: mọi suite `test/integration/installation/seed*`, `test:integration:serial` (có `TEST_DATABASE_BOOTSTRAP_URL` chỉ cho lệnh này), `pnpm test:flows`, `pnpm test` (unit), `pnpm typecheck`, `pnpm lint`, `pnpm test:gates`, `pnpm rules:check`.
4. **Gọi API thật** trên DB vừa seed: với từng DEMO-1…15 và mỗi MF-1…MF-5, đăng nhập đúng vai (tài khoản demo của seed) gọi route FE sẽ dùng, ghi bằng chứng (route · vai · điểm then chốt của response) vào bảng trong `Z2-NOTES.md`.
5. **Đường deploy production**: tìm cách VPS migrate/bootstrap/seed (deploy workflow, `docker-compose.prod.yml`, `ops:*` CLI, docs vận hành). Diễn tập trên DB trống đúng các lệnh đó (hoặc tương đương gần nhất chạy được ở local) và ghi **chuỗi lệnh chính xác cho Owner** sau khi drop DB VPS, kèm điều kiện/biến môi trường cần.

## 4. Commit, ghi chép, báo cáo
- Commit nhỏ theo bước (`feat(seed): …`, `test(flows): …`, `docs(roadmap): …`), không `--no-verify`.
- `docs/reviews/fe-feedback-2026-11-11/Z2-NOTES.md` (commit): D-Z2-n, "Nghi lỗi sản phẩm", danh sách tài khoản demo + vai (không ghi mật khẩu thật), bảng bằng chứng DEMO/MF, chuỗi lệnh deploy-từ-đầu, **"Dừng ở đâu"** cập nhật sau mỗi bước lớn (để người khác làm tiếp nếu bạn hết ngữ cảnh).
- Giữ ngữ cảnh gọn: grep/đọc theo đoạn; log test ghi file, chỉ đọc phần tóm tắt/lỗi.
- Báo cáo cuối (trả về cho chat điều phối): commit range, bảng lệnh → kết quả thật, bảng DEMO-1…15 (đạt/không + bằng chứng), nghi lỗi sản phẩm, D-Z2-n cần Owner, việc chưa làm.
