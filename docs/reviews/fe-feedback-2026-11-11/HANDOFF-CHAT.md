# Bàn giao chat điều phối (Opus) — 12/11/2026 tối (bản 2)

> Cho chat điều phối **mới** làm tiếp từ chat cũ (sắp cạn context). Đọc hết file trước khi làm gì. File này chỉ là bản đồ + trạng thái;
> nguồn thật ở các file được dẫn. Bản 1 (13/11 sáng) còn trong lịch sử Git.

## 1. Luật làm việc của Owner (bắt buộc)

- **Luôn trả lời tiếng Việt**; giữ tiếng Anh cho tên file, đường dẫn, code, lệnh.
- **Skill Preflight** mỗi lượt (`D:\FPT\FALL2026\CLAUDE.md`): một process skill + domain/review skill + một verification skill, đọc
  `SKILL.md`, liệt kê ở đầu báo cáo.
- Quyết định nghiệp vụ chưa có nguồn: **hỏi Owner từng điểm** (AskUserQuestion), có phương án A/B và khuyến nghị đứng đầu.
- **Repo BE:** chat điều phối **không commit/push** — Owner tự commit; đưa Owner lệnh commit chuẩn (`git add -- <đường dẫn>` chỉ phần
  của mình). Sửa code nhỏ khi audit thì để chưa commit.
- **Repo Docs:** việc xong thì tự commit `main`, **không push** trừ khi Owner bảo. Sửa nghiệp vụ Docs chỉ khi Owner nói "đồng bộ".
- **Đợt này không làm** Use Case, FDD, ERD, State Machine, Context (để cuối).
- Quy trình code: **một chat Sonnet** chạy tuần tự prompt trong `SONNET-PROMPTS.md` → sau mỗi prompt Owner nhắn "audit …" → chat Opus
  review/verify/sửa/test đầy đủ (mẫu ở §5).
- Không lộ email/thông tin cá nhân Owner ra dịch vụ ngoài.

## 2. Đường dẫn

| Thứ                 | Nơi                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Repo BE             | `D:\FPT\FALL2026\Code\BE-dev-software-license-management`, nhánh `feat/mf2-mf3` (đã push tới `06bfa6f9`)                             |
| Repo Docs           | `D:\FPT\FALL2026\Docs`, `main @ 5ef039c` — **chưa push** 2 commit: `2ba9e1e` (`QĐ-112`), `5ef039c` (tài liệu API FE)                 |
| Tài liệu API cho FE | `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` (generator `tools/build-api-docs.mjs`, test `node --test tools/test/*.test.mjs`) |
| Log chat Sonnet     | `D:\FPT\FALL2026\NOTE MD\logs.txt` (Owner dán báo cáo của Sonnet vào đây)                                                            |
| Memory              | `C:\Users\Asus\.claude\projects\d--FPT-FALL2026\memory\project_fe_feedback_2026_11_11.md`                                            |

Thư mục kế hoạch BE (`docs/reviews/…`):

| Thư mục                   | Nội dung                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `be-bugfix-2026-11-12/`   | SPEC v1.2, PLAN, HANDOFF-CODE (CO-1…CO-10 Owner đã trả lời), **AUDIT.md** (biên bản audit gói bug — mẫu cho các lượt audit sau)             |
| `mf2-mf3-2026-11-10/`     | SPEC v2.3 (S1–S17, P1–P29, gói X0…RD, Z), **PLAN v2.4** (thêm gói #18 `AUDIT-LEFT` AL.1–AL.5), QD-110-DRAFT, HANDOFF-CODE                   |
| `fe-feedback-2026-11-11/` | SPEC/PLAN v2.1, QD-111-DRAFT, OWNER-REVIEW (A–F), POLICY-SEED-DRAFT (đã duyệt + cột Đối chiếu), R8…R16, SONNET-PROMPTS (4 prompt), file này |

## 3. Đã xong (tới 12/11 tối)

1. **Docs:** `QĐ-110`, `QĐ-111` đồng bộ (`373bb6b`); `QĐ-112a–e` (`2ba9e1e`): bộ chính sách gắn các bước có checklist, duyệt 8 chính sách
   (`Requiments/Bộ chính sách khởi tạo.md` 1.0), bỏ nhãn _(đề xuất)_ GEN-6/14 SAAS-10/11, tham số là mặc định nội bộ, ghi nhận thuế
   (`QĐ-97d`/`QĐ-60a` đã đúng, code `invoice.policy.ts` đúng). BRD 4.13, Quy trình 1.10.
2. **Owner duyệt:** OWNER-REVIEW A–D giữ A hết; CS-1…8 A; DX-01…25 (A trừ DX-13 B, DX-15 B; áp DX-22). Báo cáo nguồn
   `D:\FPT\FALL2026\reports\Đối chiếu chính sách SaaS Sentry.md` (bản sao `R16-POLICY-SOURCES.md`), thuế
   `D:\FPT\FALL2026\reports\Thuế trong Request và cam kết - đối chiếu thực tế.md`.
3. **Prompt 1 (sửa bug) xong + audit xong**, Owner commit `06bfa6f9` (đã push). Audit sửa F1–F6 (xem `be-bugfix-2026-11-12/AUDIT.md`):
   vị từ IT Admin dùng được loại người đã nghỉ; `/it-admins` phân trang SQL; bảng ghost seat luôn chặn theo phòng (`QĐ-111ax`,
   `departmentScope` giữ, mặc định `MINE`); K4 không khóa không hỏi `keyDisposition`; seed đọc khuyến nghị gộp qua IT Admin.
   Owner chốt: hàng đợi ghost seat trưởng phòng **giữ họ tên** người giữ.
4. Tài liệu API FE commit `5ef039c` theo BE `06bfa6f9` (378 operation, check OK, test 45/45).

## 4. Đang chạy / việc kế tiếp

- **Sonnet đang chạy prompt 2** (MF-2/MF-3 theo SPEC v2.3 + PLAN v2.4: X0 → … → RD → `AUDIT-LEFT`, bỏ Z). Khi xong Owner nhắn
  **"audit MF-2/MF-3"** ⟹ làm theo §5, ghi `mf2-mf3-2026-11-10/AUDIT.md`.
- Sau đó: prompt 3 (feedback FE, SPEC v2.1, bỏ Z2) → "audit feedback FE" → prompt 4 (pha cuối: full test, API thật, **gói Z + Z2 =
  sửa seed một lần**, `HANDOFF-REVIEW.md`) → chat Opus review cuối.

### Lộ trình sau prompt 4 (Owner đã đồng ý)

1. **Kiểm khoảng trống:** rà từng `MF-1…5`, `SBF-*`, kho xem phần nào chưa có code hoặc sai nghiệp vụ ⟹ danh sách cho Owner chọn.
2. **Implement nốt các luồng phụ còn thiếu** của MF-1/2/3/4/5/kho theo danh sách Owner chọn ở bước 1 (SPEC/PLAN mới → Sonnet → audit).
3. **Đợt "để sau"** (`QĐ-110` mục H): `SBF-20`, nhắc việc, K4 theo thiết bị, `US-07-14`, khép kỳ chi phí, bản tóm tắt định kỳ,
   `KPI-2`; **pha B** cuối cùng: drop bảng/cột cũ của bàn giao, tài khoản dịch vụ, Business Owner.
4. **Seed:** mỗi đợt có gói Z riêng cập nhật seed (không có lượt "làm lại seed" riêng).
5. **Tài liệu còn nợ:** Use Case, FDD, ERD, State Machine, Context cho `QĐ-110/111/112`; vài link chết tới `SBF-07` ở Use Case; câu cũ
   `OQ-111AO-1` "chờ Owner" ở `BE-UserStory/src/EP-01.md`, `EP-10.md`, `user-stories-and-epics.md`; BRD dòng ~2103/2109 còn "`QĐ-01` →
   `QĐ-109`".

**Không làm** (Owner đã loại, cần QĐ mới mới đổi): tự cấp quyền theo danh sách phòng, mẫu BM-09 mới, điều khiển Google/M365.

## 5. Mẫu một lượt audit (đã dùng cho gói bug)

1. Đọc log Sonnet + `HANDOFF-CODE.md` của gói; `git log`/`git status` (không còn `src/` chưa commit).
2. 2–3 agent review **chỉ đọc** song song chia theo vùng code, mỗi agent đọc SPEC/PLAN/HANDOFF + rules BE, trả finding có mức độ +
   mutation đề xuất. Tự đọc migration/SQL/phân quyền/test bị sửa.
3. Điểm nghiệp vụ ⟹ hỏi Owner A/B. Sửa nhỏ tự làm (không commit) + test; sửa lớn ⟹ prompt cho Sonnet.
4. Mutation thủ công (script `mutate.py`: thay chuỗi, chạy test, khôi phục) cho từng chỗ sửa.
5. Full test **sau khi agent dừng chạy jest**. Môi trường:
   - DB test: `docker run --name slm-test-db -d -p 127.0.0.1:35432:5432 -e POSTGRES_USER=ci_bootstrap -e POSTGRES_PASSWORD=ci-bootstrap-only -e POSTGRES_DB=postgres postgres:17-alpine -c fsync=off -c synchronous_commit=off -c full_page_writes=off`
     rồi `CREATE ROLE ci_integration LOGIN NOSUPERUSER CREATEDB … PASSWORD 'ci-integration-only'` (test/README.md). Cổng 55432 **bị
     Windows chặn**.
   - `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:35432/postgres`; **không** export
     `TEST_DATABASE_BOOTSTRAP_URL` chung (làm đỏ test script bootstrap) — chỉ cho `test:integration:serial`.
   - Chạy: `pnpm check` → `test:http --maxWorkers=4` → `test:integration --maxWorkers=4` (50 % lõi + agent chạy song song ⟹
     `TransientDatabaseError` giả) → `:serial` → `:timing` → `test:flows`. Suite đỏ do tải: chạy lại `--maxWorkers=2`.
   - `seed:local`: `.env.seed.local` trỏ `127.0.0.1:55432/slm_smoke` (user `ci_integration`) ⟹ tạo `slm_smoke` trong container 35432,
     đổi tạm cổng (sao lưu file), `pnpm seed:local -- --continue`, khôi phục file. Lần gần nhất: 50 bước, exit 0.
6. Mô tả OpenAPI **không** được chứa mã nội bộ (`QĐ-…`) — test `openapi-presentation` chặn.
7. `pnpm openapi:export`, `arch:routes`, `arch:graph`; tài liệu API FE: `node tools/build-api-docs.mjs` (+ `--check`, `--compare
coverage-manifest.json`), sửa annotation/CHANGELOG, test 45/45; commit Docs `docs(api)` **sau khi Owner commit BE** (ghi đúng sha +
   sha256 `openapi.json` ở README và CHANGELOG).
8. Ghi `AUDIT.md` của gói; đưa Owner lệnh commit; cập nhật memory.
