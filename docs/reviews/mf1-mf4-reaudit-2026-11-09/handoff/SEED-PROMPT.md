# Prompt cho chat Sonnet — cập nhật toàn bộ data seed theo MF-1, MF-4, MF-5 + Kho dùng chung

Mở Claude Code (Sonnet) tại `D:\FPT\FALL2026\Code\be-seed` (worktree riêng, nhánh `feat/seed-v4` tách từ `379dc011` — code đã gom đủ;
đã `pnpm install`, `prisma:generate`, có `.env` và `.env.seed.local`). Chạy NGAY được, song song với agent đang sửa nốt test ở `be-review`.
Dán khối dưới.

```text
Bạn cập nhật DATA SEED DEMO của BE SaaS-Sentry cho khớp code nghiệp vụ mới của 3 main flow MF-1, MF-4, MF-5 và Kho dùng chung. Trả lời tiếng
Việt. Thư mục: D:\FPT\FALL2026\Code\be-seed, nhánh feat/seed-v4 (CHỈ làm ở đây; KHÔNG đụng ../be-review — chat khác đang sửa
test ở đó; chat review sẽ gộp nhánh này). Không push, không merge dev, không deploy; chỉ DB LOCAL.

ĐỌC TRƯỚC: AGENTS.md, ARCHITECTURE.md, docs/rules/README.md; docs/guides/seed.md (cơ chế seed, reset, mã thoát); fixture hiện có
src/cli/seed/fixture/shared-demo-v3/ (README + code) và demo-fixture.types.ts; thiết kế kịch bản mới (đã viết, chưa code):
docs/workspace/items/qd103-seed-demo-v4/, qd103-seed-demo-v4-mf1/, qd103-seed-demo-v4-mf5/ (spec.md + plan.md — bảng kịch bản theo dòng).
Luật nghiệp vụ: docs/reviews/mf1-mf4-reaudit-2026-11-09/SPEC.md (§4, §4b, §6) và các service/policy trong src/modules — SEED PHẢI ĐI QUA
HTTP API ĐÚNG VAI như fixture v3 đang làm (không chèn SQL thẳng trừ chỗ fixture v3 đã làm vậy), để dữ liệu tạo ra đúng luật code.

MỤC TIÊU: fixture mới (đặt tên shared-demo-v4, giữ v3 để tham khảo hoặc thay hẳn nếu đơn giản hơn — ghi lý do) tạo đủ dữ liệu để demo từng bước
3 main flow theo từng vai, ở đủ trạng thái:
- Tổ chức: 5–7 phòng phẳng, mỗi phòng có trưởng phòng giữ MANAGER, 1 phòng KHÔNG có trưởng phòng; IT Admin phụ trách phòng; đúng 1 Finance,
  đúng 1 Người duyệt chi; Cost Center Unit cho mọi phòng trừ 1 phòng (để demo "chỉ lưu nháp"); nhân viên đủ để có nhóm ≤10.
- Danh mục + Kho: ứng dụng/gói K1 (gói tháng), K2 (kho dùng chung, có seat Trống và một gói đã hết seat), K4 (khóa, giá mua), K5 (nội bộ);
  mỗi (ứng dụng, gói) một thuê bao; một thuê bao gói năm có kỳ cam kết; giá theo tháng quy đổi; một gói giá USD (có tỷ giá).
- MF-4: năm hiện tại đã có phiên bản ngân sách ĐÃ DUYỆT cho mọi phòng có Cost Center (để MF-1 kiểm được); một phòng ngân sách sát mức để ra
  "dùng dự phòng", một phòng để ra "bị chặn"; kỳ lập ngân sách NĂM SAU đang mở: Trần năm, Trần từng phòng, Dự phòng kho; đề xuất BM-10 có đủ
  loại dòng Renew/Change/New/Cancel, ZBB, hạng, một dòng vượt Trần (cờ); một phiên bản đang chờ Người duyệt chi; một phiên bản bị yêu cầu sửa.
- MF-1: Request cá nhân chờ trưởng phòng; Request nhóm; Request trưởng phòng tự gửi (một bước) chờ Người duyệt chi; Request của phòng không
  trưởng phòng (một bước); Request đã duyệt nhu cầu chờ trình lô; lô đã trình chờ Người duyệt chi với đủ 3 kết quả kiểm (trong số cơ sở / dùng
  dự phòng đã xác nhận / bị chặn); Request dùng dự phòng CHƯA xác nhận; Request đã duyệt chi chờ IT cấp: một cái cấp được từ kho cho người PHÒNG
  KHÁC, một cái kho hết phải mua; Request K1; Request nội bộ K5 đã cấp thẳng; Request phần mềm mới chờ IT đánh giá; quyền đang chạy có thời hạn
  sắp vào cửa sổ tiếp tục 30 ngày; Request nháp ở phòng chưa có Cost Center.
- MF-5: dữ liệu usage nhập từ nhà cung cấp (file mẫu CSV theo template có sẵn) đã khớp danh tính; khuyến nghị G1 (seat Trống), G2 (người đã nghỉ
  còn giữ seat → IT), G3/G4 (không hoạt động) ở các trạng thái: chờ trưởng phòng, đã Giữ, đã Thu hồi đang trong ân hạn 7 ngày, Miễn trừ có hạn,
  một seat của chính trưởng phòng (tự quyết); một quyền có thời hạn còn ≤ 1 tháng (không bị đề xuất thu hồi).
MF-5 demo trong ngày (đã có trong code): Super Admin đặt tham số qua PUT /api/v1/operating-parameters/{key}:
GHOST_SEAT_REVOCATION_GRACE_DAYS = 0 (mặc định 7; đặt TRƯỚC khi trưởng phòng quyết) và RULE_SCHEDULE_G3_G4 = "DAILY"; seat cấp mới dưới 14 ngày
bị bỏ qua (GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS = 14) nên Assignment dùng cho MF-5 phải có ngày cấp lùi ≥ 90 ngày; sau khi nhập usage gọi
POST /api/v1/ghost-seat-rule-runs (IT Admin) để sinh khuyến nghị ngay. K4: dữ liệu kho khóa phải có khóa Trống và một gói K4 hết khóa.
Ngày tháng: tính tương đối theo ngày chạy seed (business today), không hard-code ngày tuyệt đối, để demo đúng vào bất kỳ ngày nào.
Mỗi tài khoản demo đúng một vai; mật khẩu và bí mật đọc từ .env.seed.local như v3, KHÔNG ghi vào repo.

CÁCH LÀM (Owner yêu cầu: code xong hết rồi mới chạy test một lần):
1. Code fixture + cập nhật/viết test của fixture (spec tương tự shared-demo-v3.spec.ts). Trong lúc code chỉ chạy `pnpm typecheck`.
2. Xong code: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm arch:check && pnpm rules:check && pnpm test:gates`, rồi test fixture.
3. Chạy thật trên DB local: dừng API/worker đang chạy; `pnpm seed:local` theo docs/guides/seed.md — DB đã có dữ liệu cũ (v3) thì wrapper sẽ hỏi
   reset: chọn reset bằng `--confirm-reset <tên database local trong .env>` (chỉ DB local, ENVIRONMENT=LOCAL_TEST). Nếu Prisma chặn AI chạy
   reset thì DỪNG và nhắn Owner chạy tay: `pnpm seed:local` rồi gõ tên database. Seed phải chạy hết exit 0.
4. Sau seed: khởi động API, đăng nhập lần lượt từng vai demo, gọi các API chính để xác nhận dữ liệu đúng trạng thái đã liệt kê ở trên (mỗi mục
   một lệnh gọi + kết quả rút gọn). Sai thì sửa fixture, reset và seed lại.
5. Viết lại README của fixture: bảng tài khoản (alias, vai, phòng), bảng dữ liệu theo từng MF, kịch bản demo từng bước (vai → màn → API).
   Cập nhật docs/guides/seed.md nếu tên fixture/lệnh đổi.
6. Commit: `feat(seed): demo v4 theo MF-1, MF-4, MF-5 và kho dùng chung`. Ghi báo cáo D:\FPT\FALL2026\Code\mf1-mf4-handoff\SEED-REPORT.md:
   lệnh + kết quả thật, bảng tài khoản (không mật khẩu), mục dữ liệu nào chưa tạo được và vì sao, TẠM CHỌN.
Gặp luật code không cho tạo một trạng thái (ví dụ API chặn) thì KHÔNG lách bằng SQL: ghi lại mục đó trong báo cáo và làm tiếp.
```

## Trả lời câu hỏi "seed có xóa data cũ rồi mới seed không?"

- Lệnh `seed apply` **không bao giờ tự xóa** dữ liệu. Nó từ chối chạy khi DB đang chứa một tổ chức khác fixture hoặc tổ chức dở dang.
- Việc xóa chỉ nằm ở hai wrapper và **luôn phải xác nhận**:
  - local: `pnpm seed:local` hỏi reset, phải gõ đúng tên database (hoặc `--confirm-reset <tên>`), chỉ khi `ENVIRONMENT=LOCAL_TEST`;
  - VPS: script reseed cần `SEED_ALLOW_RESET=true` trong `.env.seed` + gõ đúng tên `POSTGRES_DB`, và **dump backup trước** khi DROP.
- Vì fixture v4 khác v3, DB đang có dữ liệu v3 sẽ bị từ chối nếu không reset ⇒ thực tế **phải reset (xóa sạch) rồi seed mới**, trên cả local
  và VPS.
