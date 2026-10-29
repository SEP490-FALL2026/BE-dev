# Review G0–G6 trên baseline nghiệp vụ cuối `QĐ-87` → `QĐ-90` (Prompt 03, 26/10/2026)

- Loại: audit chỉ đọc mã sản phẩm + lập kế hoạch BE. Không sửa source, test, OpenAPI, Prisma, migration, cấu hình, Docs, FE/Mobile;
  không stage/commit/push.
- Người thực hiện: AI theo giao việc Owner (Prompt `Prompts/BE-stabilization-and-g0-g6-review-2026-10-25/03-review-docs-baseline-and-g0-g6.md`).
- Kết quả: **NOT ALIGNED** — 67 finding (6 Blocker, 22 High, 25 Medium, 14 Low) trên Docs pin cuối `e0cb5a0`: 61 lập trên pin
  `769bb64` + 6 của delta `QĐ-91`/`QĐ-92` ([mục 12](#12-delta-docs-769bb64e0cb5a0-qđ-91-qđ-92)); một hạng mục remediation
  [`g0-g6-final-business-baseline-remediation`](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md) và một Prompt 04.
- Inventory đầy đủ (một nguồn; danh sách chuẩn là bảng mục 3.0):
  [impact matrix](../../workspace/items/g0-g6-final-business-baseline-remediation/impact-matrix.md).

## 1. Pin và nguồn gốc

| Phía | Pin                                                                                                                                                                   | Bằng chứng                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE   | `dev = origin/dev = 7c28e75b448c5896a553827a8d16c93c96ce5535`, ahead/behind 0/0, index rỗng, không stash                                                              | `git fetch` chạy được; CI run `40311320867` (`quality`) success                                                                                                                       |
| BE   | Merge G5/G6 `0da8f56` (cha `471de5e` + `44aef331`); Prompt 02 `bf2c3e9`; sửa CI `7c28e75` (chỉ `NODE_OPTIONS=--max-old-space-size=4096` cho `pnpm check`)             | `git show --stat`; run `40308150278` của `bf2c3e9` đỏ vì ESLint hết heap (lint 156 s, lượt xanh trước ~58 s)                                                                          |
| BE   | G5/G6 là **một** commit `44aef33` (25/10/2026, 897 tệp, +142 858/−6 028) trên `7920ee5`; 37 hạng mục `g5-*`/`g6-*` dẫn Docs `72e1480`/BRD v3.53                       | không tệp nào trong `src`, `prisma`, `test` nhắc `QĐ-87` → `QĐ-90`                                                                                                                    |
| BE   | Production `main` = `8d2db2b` (16/10/2026), 5 migration; `dev` có 107 (60 migration của G5/G6)                                                                        | `git ls-tree`; e2e và integration của CI chỉ chạy trên `main` (`ci.yml:120-122,161-163`)                                                                                              |
| Docs | `main = origin/main = 769bb64e84afeb679eadd48c4abd451a7c879779` — Owner pin 26/10/2026 (**pin trước**; F01 → F61)                                                     | delta so với `3383795` (SHA ghi trong prompt) chỉ là sơ đồ; Decisions/BRD/Scope/US/rules không đổi; ERD Conceptual so cell: cùng 21 thực thể và mọi quan hệ                           |
| Docs | Sau khi audit xong (từ 19:09): worktree có `QĐ-91`, BRD v3.56, 1 555 AC, `BEH-14` **chưa commit** — ngoài baseline đã pin; Owner chọn P03-D16                         | [impact matrix mục 3.7](../../workspace/items/g0-g6-final-business-baseline-remediation/impact-matrix.md#37-docs-đi-tiếp-sau-pin-qđ-91-chưa-commit-lịch-sử-thay-bởi-mục-38) (lịch sử) |
| Docs | **Pin cuối:** `main = origin/main = e0cb5a0045c1db2b8d607fe3cddd46dc2aaa1f36` (ba commit `8bfae03`, `e6d2573`, `e0cb5a0`, 26/10/2026) — Owner disposition P03-D16 = A | `QĐ-91`, `QĐ-92`, BRD v3.57, 1 560 AC, Logical 3.3, `SM-01` → `SM-05`, `BEH-14`/`T-10`/`T-11`; delta audit [mục 12](#12-delta-docs-769bb64e0cb5a0-qđ-91-qđ-92)                        |
| Docs | Worktree có tệp `Diagrams/State-diagram/` chưa track (WIP chat khác)                                                                                                  | không phải nguồn authoritative; nguồn đọc qua `git show 769bb64:…` / tệp đã track trùng pin                                                                                           |

**Prompt 02 đóng theo nội dung:** `pnpm check` của CI xanh trên `7c28e75` (unit 222 suite / 3 411 test, typecheck, lint, gate kiến trúc và
kích thước, scripts 85/85); bước _Verify OpenAPI export_ xanh (`git diff --exit-code openapi.json`); `NO_EXAMPLE_RESPONSES = {}`
(`test/support/openapi-example-manifest.ts:331`); `H7-TEST-RV-08` đóng theo plan H7 (harness pipe fd 3). Inventory OpenAPI cuối: 296
operation trên 255 path (132 GET, 137 POST, 13 PUT, 12 PATCH, 2 DELETE). E2E và integration **không** chạy trên CI của `dev` — chạy ở
lượt gate cuối của review này (mục 8).

## 2. Thứ tự căn cứ

| Hạng | Nguồn                                                                                              | Ghi chú                                                                   |
| ---- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | Sổ quyết định `QĐ-87` → `QĐ-90` (+ làm rõ Owner 26/10/2026 của `QĐ-90b`, `QĐ-90c`)                 | đọc trực tiếp L2790–L2948 ở `769bb64`                                     |
| 2    | BRD v3.55                                                                                          | `FR-2.x`, `FR-3.x`, `FR-5.8`, `FR-5.15`, `FR-8.x`, `FR-9.8`, 5.12         |
| 3    | User Stories v0.15 (1 550 AC), `rules/domain-guardrails.md`, Định nghĩa phạm vi v1.36              | AC đã _(bỏ)_ chỉ chứng minh hành vi cũ đã gỡ                              |
| 4    | Main Flow `MF-2`, `MF-7`, `MF-5`, `MF-8`, `MF-4`; Use Case v5.0; Conceptual v5.2; Full Logical 3.2 | tên logical không phải contract; WF/UF là lịch sử (`QĐ-87i`)              |
| 5    | Handoff `organization-workforce-authority-2026-10-24`                                              | chỉ mục; câu _chưa Owner review/commit_ đã cũ (F61) — dùng bằng chứng Git |

Xung đột thật giữa hai nguồn authoritative chỉ có một: kết cục _cần sửa ngân sách_ (BRD `FR-3.20` vs `US-06-13` AC-11) — ghi câu hỏi
P03-D08, không chọn theo mã. _(26/10/2026, pin cuối `e0cb5a0`: xung đột không còn — BRD v3.57 `FR-3.20`, `QĐ-92d`(2), `US-06-13` AC-13 cùng
một đáp án; P03-D08 đóng theo nguồn. Ở pin cuối, hạng 1 thêm `QĐ-91`, `QĐ-92`; hạng 2 là BRD v3.57; hạng 3 là 1 560 AC; hạng 4 thêm
Logical 3.3 và State Machine `SM-01` → `SM-05`.)_

## 3. Phương pháp và skill

- Skill đã đọc đầy đủ và dùng: `superpowers:using-superpowers` (chọn workflow), `source-driven-development` (pin nguồn, không suy từ
  tóm tắt), `code-review-and-quality` (năm trục, mức độ), `api-and-interface-design` + `security-and-hardening` (contract, quyền, ranh
  giới tin cậy), `deprecation-and-migration` (backfill, enum, rollout/rollback), `spec-driven-development` +
  `planning-and-task-breakdown` (một spec/plan hợp nhất), `engineering:testing-strategy` (test matrix theo rủi ro),
  `superpowers:verification-before-completion` (tự kiểm trước báo cáo). Owner rule một work item/một Prompt 04 thắng mọi gợi ý chia nhỏ.
- Sáu agent **chỉ đọc** (không có quyền ghi) truy vết song song G0–G2, G3, G4, G5, G6 và contract/migration/H7; agent chính tích hợp,
  kiểm lại tại nguồn mọi finding Blocker/High (dòng mã trích ở impact matrix) và tự lập hạng mục — theo `AGENTS.md` (multi-agent chỉ
  cho phần độc lập, một agent chính sở hữu tích hợp và kiểm chứng).
- Delta Story/AC `72e1480` → `769bb64` sinh bằng công cụ chỉ đọc (`git show` các `EP-xx.md`).

## 4. Trạng thái theo G

| G   | Hạng mục chính                        | Kết luận                                                                                                                                                                                                  |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0  | `foundation-org-identity-boundary`    | Ranh giới danh tính–tổ chức `aligned`; liên kết phòng–Cost Center sai chiều (F01)                                                                                                                         |
| G1  | `us-01-*`, `h1`…`h5`                  | Đăng nhập, phiên, lời mời, khóa/mở khóa, chuyển giao, audit `aligned`; cài đặt (F09), `P28-05` (F18), Super Admin là đối tượng (F19)                                                                      |
| G2  | `g2-*`                                | **Actor ngược** (F10, F11), phòng bắt buộc Cost Center (F01, F16), chức vụ danh mục (F03), checklist (F14), ngừng phòng (F15), thông báo (F17)                                                            |
| G3  | `g3-*`, read-contract                 | Tiền/tỷ giá/hồ sơ hợp đồng/ngừng ứng dụng `aligned`; không có phòng sở hữu (F02), bộ chuẩn + phân bổ còn sống (F04, F05)                                                                                  |
| G4  | `g4-*`, `g6-revocation-by-grant-kind` | Bằng chứng hoàn tất, thử lại/đóng, `K1` `aligned`; chuyển làm tay (F08), duy nhất tác vụ (F07), phòng sở hữu Assignment (F20)                                                                             |
| G5  | `g5-*`                                | Bảy mã ngân sách, Finance rà soát, `INV-16`, định tuyến, lô `aligned`; **không có cổng tài chính/nháp** (F27), re-routing trả phí (F28), đua ngân sách (F31), bản nháp kẹt (F36)                          |
| G6  | `g6-*`                                | Căn cứ, dời/hủy, xác minh chỉ ở `BM-09`, `BM-11` `aligned`; **actor ngược** (F40), rà soát chỉ ngoài bộ chuẩn (F42), `STILL_NEEDED` (F43), chức vụ là sự kiện (F41), chuyển phòng tài khoản dịch vụ (F06) |

Trace Story/AC đầy đủ: [impact matrix mục 4](../../workspace/items/g0-g6-final-business-baseline-remediation/impact-matrix.md#4-trace-storyac-theo-g).

## 5. Số đếm

| Nhãn chính                  | Pin `769bb64` | Pin cuối `e0cb5a0` |
| --------------------------- | ------------- | ------------------ |
| aligned (dòng trace)        | 38            | 43                 |
| documentation drift         | 5             | 5                  |
| implementation gap          | 28            | 35                 |
| contract change             | 9             | 9                  |
| migration/backfill required | 6             | 6                  |
| ADR/Owner decision required | 4             | 4                  |
| business-source question    | 4             | 3                  |
| obsolete                    | 5             | 5                  |
| **Tổng finding**            | **61**        | **67**             |

## 6. Finding theo mức độ

Chi tiết (nguồn, mã, test, dữ liệu, wire, tái hiện) ở impact matrix mục 3. Phase là phase nội bộ của Prompt 04.

| Mức     | Finding                                                                                                                                                                                                                                                | Phase    | Phụ thuộc     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------- |
| Blocker | F01 phòng bắt buộc Cost Center, liên kết sai chiều                                                                                                                                                                                                     | P1, P2   | —             |
| Blocker | F02 thuê bao không có phòng sở hữu                                                                                                                                                                                                                     | P1, P3   | P03-D03       |
| Blocker | F10 ghi cơ cấu tổ chức chỉ IT Admin, không căn cứ                                                                                                                                                                                                      | P2       | —             |
| Blocker | F27 không có cổng _cấu hình tài chính chưa hoàn tất_, không có nháp                                                                                                                                                                                    | P1, P4   | F01, P03-D01  |
| Blocker | F40 sự kiện nhân sự và `BM-09` chỉ IT Admin                                                                                                                                                                                                            | P5       | —             |
| Blocker | F42 rà soát sau điều chuyển chỉ phủ công cụ ngoài bộ chuẩn                                                                                                                                                                                             | P5       | F04, F29      |
| High    | F03 chức vụ danh mục · F04 bộ chuẩn (lỗi sống: mọi Request bị đòi lý do) · F05 phân bổ · F06 chuyển phòng tài khoản dịch vụ                                                                                                                            | P1–P5    | P03-D04 → D07 |
| High    | F08 chuyển làm tay đòi bằng chứng · F09 cài đặt · F11 sửa hồ sơ · F15 ngừng phòng · F16 Cost Center · F17 thông báo · F19 Super Admin là đối tượng                                                                                                     | P1–P5    | P03-D02, D15  |
| High    | F20 phòng sở hữu Assignment · F28 re-routing trả phí · F29 kết cục điều chuyển · F31 đua ngân sách · F36 bản nháp phiên bản kẹt · F41 chức vụ là sự kiện · F43 `STILL_NEEDED`                                                                          | P1–P5    | F02           |
| High    | _Delta `e0cb5a0`:_ F62 không đóng cuối năm tài chính · F63 từ chối trả đề xuất về trưởng phòng, không lập lại từ cùng đề xuất · F65 Request chờ phiên bản rời trạng thái chờ, Finance không xử lý được · F67 không có thông báo vòng ngân sách/Finance | P1, P4   | F31, F33      |
| Medium  | F07, F12, F13, F14, F18, F21, F22, F24, F25, F26, F30, F32, F33, F34, F37, F44, F46, F49, F53, F54, F55, F58, F60; _delta:_ F64 sửa đổi khi phòng chưa có trưởng phòng, F66 lịch sử sửa phiên bản                                                      | P1–P6, — | P03-D09 → D15 |
| Low     | F23, F35, F38, F39, F45, F47, F48, F50, F51, F52, F56, F57, F59, F61                                                                                                                                                                                   | P3–P6, — | —             |

## 7. Tài liệu BE đã sửa trong lượt này

- `docs/roadmap.md`: đoạn cập nhật 26/10/2026 (Prompt 03); hàng hạng mục mới; trạng thái triển khai sửa theo bằng chứng Git (G5/G6
  `merged-dev` qua `0da8f56` → `bf2c3e9`; các hạng mục _commit `4cc9a47` trên `Bao_dev_be`_ và _local, chưa commit_ nay `merged-dev`, có
  trong `dev` `7c28e75`); ghi chú pin cũ ở năm scope map G2–G6.
- `docs/workspace/items/README.md`: đăng ký hạng mục mới.
- `docs/workspace/items/g0-g6-final-business-baseline-remediation/{spec,plan,test-matrix,impact-matrix}.md`: mới.
- Ghi chú ngày 26/10/2026 (AC mở lại, finding) ở spec các hạng mục chủ bị ảnh hưởng — danh sách ở mục _Changes_ của roadmap.
- Không sửa `AGENTS.md`/`ARCHITECTURE.md` (mô tả năng lực đổi khi mã đổi — Task 6.2 của Prompt 04).
- Lượt delta Docs cuối (26/10/2026): xem [mục 12.5](#125-tài-liệu-be-sửa-trong-lượt-delta).

## 8. Kiểm chứng cuối trên cây sản phẩm không đổi

Chạy một lượt sau khi audit, impact matrix và thiết kế remediation xong, trên BE `7c28e75` với mã sản phẩm **không đổi** (58 path
thay đổi = 53 sửa + 5 mới theo `git status --short -uall`, đều dưới `docs/`; số 55 ghi trước đây đếm hai thư mục mới thay cho năm tệp
bên trong), Windows 11 + Docker 29.1.2, PostgreSQL 17.11 cô lập `slm-p03-final-db` (`127.0.0.1:55432`, role
`ci_integration` thường + bootstrap riêng) theo `test/README.md`.

| Gate                                 | Lệnh                                                                                                                                         | Kết quả thực chạy                                                                                                                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chất lượng cục bộ                    | `NODE_OPTIONS=--max-old-space-size=4096 pnpm check` (như CI)                                                                                 | exit 0 (593 s): unit 222 suite / 3 411 test xanh; `rules:check` 287 tệp, 2 353 link, 0 lỗi; format, Prisma validate/generate, lint, typecheck, scripts, build xanh                                                                                                                                     |
| E2E                                  | `pnpm test:e2e`                                                                                                                              | exit 0 (387 s): 46 suite / 1 225 test xanh                                                                                                                                                                                                                                                             |
| OpenAPI                              | `pnpm openapi:export` ×2                                                                                                                     | trùng byte, sha256 `22b6bb7620a6e619…` = `openapi.json` đã commit (`git diff --exit-code` sạch)                                                                                                                                                                                                        |
| Integration (lượt 1)                 | `pnpm test:integration`                                                                                                                      | **bị ngắt** giữa chừng khi phiên Claude kết thúc (19:43); trước đó `catalog-standard-toolset-read-batching` đỏ 2 ca do 503 lúc dựng dữ liệu cùng cảnh báo _connection retired (client-side query timeout)_; container được Docker khởi động lại sau đó — không dùng làm bằng chứng                     |
| Integration (lượt 2, container mới)  | `pnpm test:integration`                                                                                                                      | exit 1 (2 137 s): **222 suite xanh, 1 bỏ qua thiết kế, 1 đỏ** — 3 006 test xanh, 4 bỏ qua, 7 đỏ; suite đỏ `database-stall.integration-spec.ts` lỗi ở `beforeAll`: `connect ETIMEDOUT 127.0.0.1:55432` (chưa tới assertion nào; lỗi `releaseHeld` là hệ quả afterEach); để sót CSDL `slm_5197475d_test` |
| Integration — chạy lại đúng suite đỏ | `jest --config ./test/config/jest.integration.cjs --runInBand test/integration/audit/database-stall.timing-spec.ts`                           | exit 0 (34 s): 7/7 xanh trên cùng container và cùng cây                                                                                                                                                                                                                                                |
| Drift schema (`DB-16`)               | CSDL rỗng `slm_ci_migration_drift` → `prisma migrate deploy` → `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` | 107 migration áp xong; `No difference detected`, exit 0                                                                                                                                                                                                                                                |
| Vai runtime H7                       | `database-roles-provision`, `database-roles-refusals`, `database-roles-upgrade-rehearsal`, `database-runtime-role-app` trong integration     | xanh trong lượt 2 (chỉ `database-stall` đỏ; suite bỏ qua thiết kế là `object-storage-real` — cần endpoint S3)                                                                                                                                                                                          |
| Tài liệu                             | `pnpm rules:check`, `pnpm rules:format`, `git diff --check`                                                                                  | 0 lỗi (lần cuối 287 tệp, 2 354 link); Prettier sạch; diff sạch                                                                                                                                                                                                                                         |
| Dọn dẹp                              | `docker rm -f slm-p03-final-db`                                                                                                              | 0 container `slm-p03-*` (container `redis-server` có sẵn không chạm), 0 tiến trình Jest; CSDL sót bị xóa cùng container; biến môi trường chỉ đặt trong lệnh                                                                                                                                            |

**Phân loại lỗi integration: môi trường, không phải sản phẩm.** Lỗi là kết nối TCP tới cổng Docker hết thời gian ở bước dựng suite
(không assertion nào chạy), suite chạy lại riêng xanh 7/7 trên cùng cây và container, cùng lớp với `P02-INT-IO` (I/O Docker/WSL2 nghẽn
khi suite lớn). Không có lượt integration đầy đủ xanh liền một mạch trong review này — báo đúng như vậy; Prompt 04 chạy lại integration
đầy đủ ở gate cuối. Ghi nhận phụ: khi kết nối hết thời gian **trong** `provisionDisposableDatabase`, harness không biết tên CSDL để xóa
(`afterAll` chỉ xóa khi đã có `database`) — đưa vào test-matrix gate cuối của Prompt 04 kiểm 0 CSDL `slm_*` sót sau lượt.

## 9. Bàn giao contract FE/Mobile

Không chạy lệnh FE/Mobile. Danh sách operation gỡ/đổi vai/đổi trường ở
[impact matrix mục 6](../../workspace/items/g0-g6-final-business-baseline-remediation/impact-matrix.md#6-contract-và-bàn-giao-femobile);
FE/Mobile sinh lại client khi bắt đầu nối API, sau khi Prompt 04 xong.

## 10. Prompt 27

**`deferred`.** Fixture tổ chức/danh tính chưa ổn định: liên kết phòng–Cost Center đảo chiều (F01), chức vụ thành chữ tự do (F03), actor
ghi tổ chức/nhân sự đổi sang Super Admin (F10, F11, F40), lệnh cài đặt đổi tập bản ghi (F09). Đánh giá lại sau Checkpoint 2 của Prompt 04;
không thêm kịch bản danh mục/Request/ngân sách/license chỉ vì G5/G6 đã có.

## 11. Bước kế

Disposition _chặn_ đã trả lời: Owner 27/10/2026 chọn A cho P03-D01 → P03-D07, P03-D09, P03-D11 ([mục 14](#14-disposition-owner-27102026-và-đóng-prompt-03);
[spec](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#owner-dispositions)); P03-D08 đóng theo nguồn, P03-D16 đã trả lời. Owner commit tài liệu Prompt 03 (gồm các
lượt delta, khép lựa chọn hiện thực, đóng và sửa review `P03-RV-01` → `P03-RV-03`) rồi chạy đúng một Prompt 04: **bản tương thích**
trước, một điểm dừng nội bộ `expansion-ready-owner-action` cho việc của Owner/operator ([mục 15](#15-review-p03-rv-01--d03-mở-rộng--gán--thu-hẹp),
[mục 16](#16-review-p03-rv-02--migration-a-tương-thích-runtime-cũ), [mục 17](#17-review-p03-rv-03--bản-tương-thích-cho-mọi-migration-thu-hẹpphá-hủy)), rồi
phase P0 → P7. Chủ của từng finding trong bảng chuẩn impact matrix mục 3.0 (task + dòng test/bằng chứng,
hoặc nhãn không triển khai) ở [plan § Phủ finding](../../workspace/items/g0-g6-final-business-baseline-remediation/plan.md#phủ-finding).

## 12. Delta Docs `769bb64..e0cb5a0` (`QĐ-91`, `QĐ-92`)

Lượt tiếp của **cùng** Prompt 03 (26/10/2026), không phải Prompt 03A: Owner pin Docs cuối và chọn P03-D16 = A. Chỉ audit nguồn của delta;
không audit lại G0–G6, không đổi mã sản phẩm.

### 12.1 Pin và skill

| Phía       | Pin                                                             | Bằng chứng                                                                                                         |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Docs       | `main = origin/main = e0cb5a0045c1db2b8d607fe3cddd46dc2aaa1f36` | `git rev-parse HEAD origin/main`; `git log 769bb64..e0cb5a0`: `8bfae03`, `e6d2573`, `e0cb5a0` (26/10/2026); 95 tệp |
| Docs trước | `769bb64e84afeb679eadd48c4abd451a7c879779`                      | pin của F01 → F61                                                                                                  |
| BE         | `dev = 7c28e75b448c5896a553827a8d16c93c96ce5535`                | mã sản phẩm không đổi; cây chỉ có tài liệu Prompt 03 (`git status`)                                                |

Skill đọc đầy đủ và dùng trong lượt này: `superpowers:using-superpowers` (chọn bộ skill), `source-driven-development` (đọc nguồn ở
`git show e0cb5a0:…`, không dùng tóm tắt), `code-review-and-quality` (đối chiếu mã, mức độ), `api-and-interface-design` +
`security-and-hardening` (wire, quyền ở service — F13), `deprecation-and-migration` (enum không hoàn tác, chỉ mục, dữ liệu cũ),
`spec-driven-development` + `planning-and-task-breakdown` (cập nhật một spec/plan; quy ước `tasks/plan.md` của skill nhường cho thư mục
hạng mục của repo), `engineering:testing-strategy` (dòng test theo rủi ro), `documentation-and-adrs` (ghi lịch sử có ngày),
`superpowers:verification-before-completion` (mục 12.6). Agent chính tự đọc nguồn và mã, không agent phụ.

### 12.2 Không chỉ là sơ đồ

Delta có quyết định (`QĐ-91a` → `QĐ-91f`, `QĐ-92a` → `QĐ-92d`), BRD v3.57, guardrails, 10 AC mới (1 550 → 1 560), Logical 3.3, State
Machine và handoff `BEH-14`/`T-10`/`T-11` — phân loại mọi nhóm tệp ở
[impact matrix mục 10](../../workspace/items/g0-g6-final-business-baseline-remediation/impact-matrix.md#10-phạm-vi-delta-docs-769bb64e0cb5a0).
`SM-01`, `SM-01a`, `SM-02`, `SM-03`, `SM-05` chỉ dẫn `QĐ` ≤ `QĐ-90`; các `SOURCE-GAP` của chúng là điểm mở có sẵn — không finding BE.

### 12.3 Kết quả theo mục yêu cầu

| Hạng mục kiểm                                            | Kết luận                                                                                                                                          | Finding  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Vòng đời đề xuất (`QĐ-91a`)                              | trạng thái _đã nộp/bị trả lại/đã rút/đã dùng_ có; thiếu _đóng — hết năm_; đề xuất mới sau khi bị từ chối bị chặn                                  | F62, F63 |
| Vòng đời phiên bản (`QĐ-91a`, `QĐ-91b`, `QĐ-91d`)        | duyệt = hiện hành + bị thay cùng giao dịch aligned; yêu cầu sửa trả chính bản aligned; thiếu _hết hiệu lực_ + cờ; thiếu lịch sử trước/sau         | F62, F66 |
| Đóng cuối năm (`QĐ-91c`, `QĐ-91e`)                       | không có; phiên bản của năm đã kết thúc còn duyệt được                                                                                            | F62      |
| Trưởng phòng đổi/vắng (`QĐ-91f`)                         | nộp lại/rút theo trưởng phòng hiện tại, người nộp gốc, xung đột theo người nộp aligned; thiếu thông báo (sơ bộ mục 3.7 ghi _khoảng trống_ là sai) | F67      |
| Phiên bản tiếp theo sau khi bị từ chối (`QĐ-92c`)        | từ chối trả đề xuất về `RETURNED` (phương án `D9` đã loại); không lập lại từ cùng đề xuất; không liên kết                                         | F63      |
| Request chờ phiên bản bị từ chối/hết hiệu lực (`QĐ-92a`) | rời trạng thái chờ khi bị từ chối; không có thao tác Finance khi đang chờ; không sự kiện hết hiệu lực                                             | F65, F33 |
| Người nhận thông báo (`QĐ-92b`)                          | không có mã nào cho ngân sách/vòng Finance (gồm dòng 18, 40, 41, 47 có từ trước — Prompt 03 bỏ sót)                                               | F67      |
| Phòng chưa có trưởng phòng (`QĐ-92d`(1)(2))              | sửa đổi tạo được — sai; _cần sửa ngân sách_ bị từ chối đúng nhưng vì lý do sai; `INSUFFICIENT_BUDGET` có trưởng phòng bị từ chối sai              | F64, F33 |
| Phiên bản đầu chỉ từ `BM-10` (`QĐ-92d`(3))               | aligned                                                                                                                                           | —        |
| Logical 3.3 `BudgetProposal`, R25, R26                   | R25 có (`budget_versions.proposal_id`); R26 + `UNIQUE` thiếu; Logical ghi _chưa hiện thực_ dù BE có bảng                                          | F63, F61 |

### 12.4 Đối chiếu F01 → F61 và Owner disposition

- Mở rộng (cùng lỗi): F33 (P03-D08 đóng theo nguồn; vế kiểm lại), F36 (cách sửa _đóng `CANCELLED`_ trái `QĐ-91a` — đổi thành bản nháp
  tách), F13 (`budgets`), F61 (câu _chưa Owner review/commit_ ở dòng 7, 9, 11, 494 của handoff `e0cb5a0`; Logical _chưa hiện thực_).
- Mới: F62 → F67 (4 High, 2 Medium). Tổng 67 = 6 Blocker, 22 High, 25 Medium, 14 Low; phủ 67/67 ở plan § _Phủ finding_.
- Disposition: P03-D16 = A (pin `e0cb5a0`); P03-D08 đóng theo nguồn; P03-D15 ghi rõ không chi phối F67; không câu hỏi mới. Còn chặn:
  P03-D01 → P03-D07, P03-D09, P03-D11.

### 12.5 Tài liệu BE sửa trong lượt delta

Impact matrix (đầu tệp, mục 1, 2, 3.0, F13, F33, F36, F61, 3.7 lịch sử, 3.8 mới, 4, 5, 6, 7, 8, 9.1 mới, 10 mới), spec (pin, phạm vi theo
bảng chuẩn, mục F, mục I mới, test, disposition, DoD, Changes), plan (pin, Before coding, Task 0.1, 1.7, 4.5 → 4.9, Phủ finding), test
matrix (pin, Phase 1, 4, 6, diễn tập), báo cáo này (đầu tệp, mục 1, 2, 5, 6, 7, 11, 12), `docs/roadmap.md` (đoạn ngày, ghi chú scope map
G5, hàng hạng mục), `docs/workspace/items/README.md` (hàng hạng mục), ghi chú ngày ở spec `g5-budget-proposal-and-review`,
`g5-budget-version-decision`, `g5-budget-check-and-finance-review`, `g5-request-status-notifications`. Ngoài repo BE: Prompt 04, tracker,
README và `tasks/todo.md` của thư mục prompt. Không sửa mã, test, Prisma, migration, OpenAPI, cấu hình, Docs authoritative, FE, Mobile.

### 12.6 Kiểm chứng

Mã sản phẩm không đổi ⟹ không chạy lại unit, e2e, integration (theo yêu cầu lượt này). Chỉ kiểm tài liệu:

| Kiểm                | Lệnh                                                                                                                                                                                              | Kết quả                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link, rule tài liệu | `pnpm rules:check`                                                                                                                                                                                | exit 0 — `BE: 287 files, 2374 links, 0 errors` (lượt cuối, sau mọi sửa)                                                                                                                  |
| Định dạng           | `pnpm rules:format`; `pnpm exec prettier --check` tệp báo cáo này (ngoài glob của `rules:format`)                                                                                                 | exit 0 — _All matched files use Prettier code style!_; chỉ chạy `prettier --write` trên đúng 11 tệp đã sửa                                                                               |
| Khoảng trắng        | `git diff --check`; quét Python cho 5 tệp chưa track của hạng mục, báo cáo này và tệp của thư mục prompt (ngoài repo)                                                                             | exit 0; 18 tệp, 0 khoảng trắng cuối dòng, 0 trộn CRLF/LF, 0 marker xung đột                                                                                                              |
| Phủ finding         | script chỉ đọc ở scratchpad: bảng chuẩn mục 3.0 ↔ nguồn/mã ở chi tiết ↔ phase ↔ plan § _Phủ finding_ ↔ dòng test matrix ↔ mục 7 cho finding P1; Prompt 04/plan không dùng dải cố định làm phạm vi | 67 finding, 67 dòng phủ, 0 lỗi (lượt đầu bắt 11 finding cũ thiếu dòng _Nguồn_ — đã thêm); đối chứng gài ba lỗi (bỏ dòng phủ, bỏ dòng test, bỏ dòng mục 7) đều bị bắt, bản sao tạm đã xóa |
| Cây BE              | `git status --short -uall`, `git diff --cached --name-only`, `git stash list`, `git rev-parse HEAD`                                                                                               | 58 path đều dưới `docs/` (53 sửa + 5 mới), 0 path sản phẩm, index rỗng, 0 stash, `HEAD = 7c28e75`                                                                                        |
| Không chạy          | unit, e2e, integration, OpenAPI export, diễn tập migration                                                                                                                                        | không đổi mã/test/Prisma/migration/OpenAPI; bằng chứng gate sản phẩm ở mục 8 còn hiệu lực cho `7c28e75`                                                                                  |

## 13. Khép lựa chọn hiện thực còn ngỏ (26/10/2026, cùng Prompt 03)

Lượt tiếp của **cùng** Prompt 03 và cùng hạng mục (không 03A/04A, không hạng mục mới); không audit lại; không đổi mã sản phẩm. Thiết kế
chốt ở [spec mục J](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#j-thiết-kế-đã-chốt-cho-f63-f65-f66-26102026-prompt-03-tiếp)
và tên chốt ở [spec mục K](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#k-tên-chốt--mã-lỗi-cột-khóa-mã-thông-báo-26102026-prompt-03-tiếp).
Skill: như mục 12.1 (đọc đầy đủ trong cùng phiên), trọng tâm `deprecation-and-migration` (đối soát dữ liệu cũ, chặn khi mơ hồ, rollback bằng
khôi phục), `api-and-interface-design` (contract một mã một status), `security-and-hardening` (quyền ở service, không lộ Audit Trail),
`engineering:testing-strategy`, `superpowers:verification-before-completion`.

| Chủ đề                   | Chốt                                                                                                                                                                                                                                                                                                                                                                                                                                                | Nơi ghi                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| F63 — đề xuất kế tiếp    | `BudgetProposal.successorOfProposalId` (FK `RESTRICT`, `UNIQUE` — chuỗi tuyến tính; Logical 3.3 `revision` không cho nhánh), `succeededAt`; CHECK, trigger kiểm cùng Cost Center/năm, đề xuất trước `REVIEWED` có phiên bản mới nhất `REJECTED`; constraint trigger hoãn; `budget_proposals_open_key` mới; hệ thống tự nối, body `budgetProposalSubmit` không đổi; `BudgetVersion.rejectedPredecessorId` giữ là liên kết phiên bản riêng            | spec J.1; plan Task 1.7, 4.7; test matrix P1 F63 ×6, P4 F63 ×3         |
| F63 — dòng `RETURNED` cũ | dấu vết tất định (đúng một quyết định `REJECTED` khớp người/lý do/thời điểm); R1 → `REVIEWED`; R2 → `REVIEWED` + bản nộp lại thành kế tiếp; Audit `SYSTEM` có trước/sau; ca mơ hồ ⟹ `ops:preflight` `BLOCKED` chỉ ID, migration `RAISE` trước mọi ghi; rollback = khôi phục `pg_dump`                                                                                                                                                               | spec J.2; plan Task 1.7; test matrix P1, diễn tập bước 4; Prompt 04 §1 |
| F65 — contract           | **mở rộng** `financeReviewComplete` cho Request `AWAITING_BUDGET` (body/kết cục giữ nguyên, không operation thứ hai); bước rà soát mở-và-đóng trong cùng giao dịch; `ASSESSED` chạy lại kiểm tra (`FINANCE_OUTCOME_WHILE_WAITING`); 403 `SPEND.NOT_FINANCE`, `SPEND.OWN_REQUEST`; 404; 409 `SPEND.REVIEW_NOT_OPEN`, `SPEND.ALREADY_AWAITING_BUDGET`, `SPEND.REVIEWER_IS_APPROVER`, `SPEND.PLAN_LINE_NOT_UPDATED`; 422; khóa dòng Request; lặp ⟹ 409 | spec J.3; plan Task 4.8; test matrix P1 F65, P4 F65 ×4                 |
| F66 — lưu và đọc         | bảng chỉ ghi thêm `budget_version_history` của capability (không dùng `audit_events` làm read model); Audit trước/sau thật + một dòng lịch sử cùng giao dịch; `GET /budget-versions/{id}/history` `budgetVersionHistoryList`, `pageSize` ≤ 100, `seq` giảm dần, chỉ Finance và người quyết phiên bản (policy service)                                                                                                                               | spec J.4; plan Task 4.10; test matrix P1 F66, P4 F66 ×5                |
| Khép thêm khi rà         | spec K (tên chốt); F32 mã `SPEND.REVIEWER_IS_APPROVER`; F67 bảng `held_department_notifications` và phân chia bộ chiếu ↔ `notifyInApp`; F51 gate `test/gates/migration-order.gate-spec.ts`; F02 (D03 = A) CLI `ops:assign-subscription-owner`; bỏ câu cũ _dữ liệu F63 giữ làm lịch sử_                                                                                                                                                                          | spec F, I, mục disposition; plan Task 1.2, 4.9, 6.3                    |

**Phủ:** plan § _Phủ finding_ thêm cột _Chủ schema/contract_ cho cả 67 finding (một chủ, không _hoặc_). Script chỉ đọc: 67 dòng phủ, 0 lỗi;
đối chứng sáu lỗi gài (bỏ dòng phủ, bỏ dòng test, bỏ dòng mục 7, chủ mơ hồ, mở lại lựa chọn ở spec J, bỏ một dòng test F63) đều bị bắt bằng
thông báo lỗi của script — lượt đầu phát hiện script vỡ khi in tiếng Việt trên console Windows, đã ép UTF-8 rồi chạy lại.

**Khép thêm khi rà toàn gói:** spec mục K chốt mọi tên còn để _Prompt 04 đặt_ hoặc _có mã_ — F12 (`EmployeeTechnicalView`, phòng khác 404),
F16, F23, F27 (`FINANCE.SETUP_INCOMPLETE` thành tên chốt), F30, F31 (khóa advisory), F36 (`detached_at`), F37, F39, F47 (cả `ops:inspect` lẫn
migration tiến), F48 (bảng đếm theo năm), F62 (enum, cột, Audit, sweeper), F64, mã hộp thông báo F17/F24/F67.

**Còn ngỏ ngoài chín disposition Owner:** **không có** lựa chọn hiện thực nào. Một việc không phải lựa chọn thiết kế: nếu `ops:preflight` gặp
ca mơ hồ của J.2 trên CSDL thật, Owner/operator xử lý từng **ID** được nêu (dữ liệu, không phải thiết kế).

### 13.1 Kiểm chứng

| Kiểm                                                                                   | Kết quả                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check`                                                                     | exit 0 — `BE: 287 files, 2387 links, 0 errors` (gồm neo mới spec J.1 → J.4, K)                                                                                                                          |
| `pnpm rules:format`; `prettier --check` báo cáo này                                    | exit 0; chỉ `prettier --write` trên đúng tệp đã sửa (4 tệp hạng mục, báo cáo này)                                                                                                                       |
| `git diff --check`; quét Python 18 tệp (5 tệp chưa track, báo cáo, tệp thư mục prompt) | exit 0; 0 khoảng trắng cuối dòng, 0 trộn CRLF/LF, 0 marker                                                                                                                                              |
| Phủ finding (script chỉ đọc ở scratchpad)                                              | 67 finding, 67 dòng phủ, mỗi dòng có task + dòng test + chủ schema/contract duy nhất; không còn câu chữ _hoặc operation riêng_, _(dự kiến)_, _nếu tách_, _hoặc cột trên_ ở spec J/plan/Prompt 04; 0 lỗi |
| Đối chứng gài lỗi                                                                      | 6/6 bị bắt bằng thông báo của script, 0 bản sao tạm sót                                                                                                                                                 |
| Cây                                                                                    | BE 58 path đều dưới `docs/`, 0 path sản phẩm, index rỗng, 0 stash, `HEAD = 7c28e75`; Docs `e0cb5a0`, 0 thay đổi                                                                                         |
| Không chạy                                                                             | unit, e2e, integration, OpenAPI export, diễn tập migration (không đổi mã/test/Prisma/migration/OpenAPI)                                                                                                 |

## 14. Disposition Owner 27/10/2026 và đóng Prompt 03

Lượt đóng của **cùng** Prompt 03 và cùng hạng mục (không 03A/04A, không hạng mục mới); không audit lại; không đổi mã sản phẩm. Giữ đúng 58
path tài liệu BE. Hệ quả chốt ở [spec mục L](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#l-hệ-quả-của-disposition-owner-27102026).
Skill (đọc đầy đủ trong lượt này): `using-superpowers` (quy trình), `planning-and-task-breakdown` (task, phụ thuộc, checkpoint),
`security-and-hardening` (lệnh thủ tục: tách người, phân quyền ở service, đóng khi lỗi, không lộ bí mật/dữ liệu cá nhân),
`deprecation-and-migration` (gỡ bảng, bản sao lưu, migration hai bước, dòng chờ), `documentation-and-adrs` (ghi quyết định và hệ quả),
`superpowers:verification-before-completion`.

| Mã                         | Owner          | Hệ quả chốt                                                                                                                                                                                                                                                                                                                                                                                                         | Nơi ghi                                                                  |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| P03-D01                    | A              | `AccessRequestState.DRAFT` (Cost Center và `submitted_at` NULL chỉ khi nháp, trigger không có việc cho nháp); bốn operation `accessRequestDraftSave`, `accessRequestDraftList`, `accessRequestDraftSubmit`, `accessRequestDraftDelete`; trình chạy lại mọi cổng                                                                                                                                                     | spec L.1; plan Task 1.6, 4.1; test matrix P1 F27, P4 F27 ×3              |
| P03-D02                    | A              | `pnpm ops:record-super-admin-event <mode>` — chỉ ghi sự kiện nhân sự có kiểm soát khi Super Admin là đối tượng; không đổi người giữ vai, vai, mật khẩu, phiên, khóa; không thay `REASSIGN`; phiếu + người phê duyệt + người chạy + môi trường + căn cứ; tách người; Audit `OPERATOR`; mã thoát 0/2/1; đầu ra chỉ ID; người giữ vai đã rời: sự kiện → chặn theo quy tắc _đã nghỉ việc_ → `ops:recover transfer-role` | spec L.2; plan Task 1.8, 2.6, 5.1, 5.5; test matrix P1/P2 F19, P5 F19 ×5 |
| P03-D03                    | A              | migration (A) cột NULL + bảng gán chỉ ghi thêm, (B) NOT NULL có `RAISE`; lệnh `pnpm ops:assign-subscription-owner` (capability `catalog`); hai lượt `migrate deploy` với `prisma migrate resolve --rolled-back` ở giữa — _thay bởi review `P03-RV-01` ngày 27/10/2026 (mục 15): mở rộng → gán → thu hẹp, không `migrate resolve`_                                                                                   | spec L.3; plan Task 1.2; test matrix P1 F02 ×3, diễn tập bước 3          |
| P03-D04, P03-D05           | A              | `employees.job_title` từ giai đoạn hiện hành; `job_title_name` chỉ đọc; trigger cấm dòng mới của loại đã bỏ; dòng chờ hủy trên bản đang chạy trước deploy, preflight chặn                                                                                                                                                                                                                                           | spec L.4; plan Task 1.3; test matrix P1 F03 ×2, F41 ×2                   |
| P03-D06                    | A              | bỏ bảy bảng và hai cột; dòng chuyển phòng chờ hủy trước deploy; `pg_dump` trước bước phá hủy là tài liệu sao lưu được bảo vệ (không Git, không artifact CI, vị trí sao lưu được bảo vệ, bằng chứng chỉ SHA-256 + thời điểm + revision + tham chiếu vị trí); preflight đóng khi lỗi, rollback bằng khôi phục                                                                                                         | spec L.5; plan Task 1.4; test matrix P1 F04–F06, F06, gate cuối          |
| P03-D07                    | A              | gỡ trực tiếp 17 operation và trường liệt kê, 404, không 410/cửa sổ deprecation                                                                                                                                                                                                                                                                                                                                      | spec L.6; impact matrix mục 6                                            |
| P03-D09                    | A              | `subscriptionUpdate` 409 `FINANCE.SETUP_INCOMPLETE` cho bốn kiểu tăng/kéo dài khi phòng sở hữu chưa có Cost Center                                                                                                                                                                                                                                                                                                  | spec L.7; plan Task 3.1; test matrix P3 F26                              |
| P03-D11                    | A              | giá chỉ từ thuê bao đang hoạt động của phòng Request, không thì giá gói/báo giá                                                                                                                                                                                                                                                                                                                                     | spec L.8; plan Task 4.5; test matrix P4 F38                              |
| P03-D10, P03-D12 → P03-D15 | mặc định A giữ | không chặn; đổi về sau là quyết định Owner mới                                                                                                                                                                                                                                                                                                                                                                      | spec L.9                                                                 |

**Làm rõ khi ghi hệ quả (không phải câu hỏi mới):** (1) trình tự cũ _gán phòng sở hữu rồi mới `migrate deploy`_ của test matrix không chạy
được vì cột chưa tồn tại trước migration — nay là hai lượt deploy _(thay bởi review `P03-RV-01`, mục 15)_; (2) CHECK hiện có buộc dòng `REJECTED`/`CANCELLED` có người dùng thực
hiện, nên dòng chờ của loại bị gỡ hủy trên bản đang chạy trước deploy, preflight và migration chặn khi còn; (3) lệnh gán thuộc `catalog`
(chủ bảng) thay `installation`; (4) ghi sự kiện bằng phiếu cần cột người thực hiện là phiếu (Task 1.8) vì các cột người dùng đang NOT NULL;
(5) dòng cũ ở plan _Task 4.6 → 4.9_ của phân công P4 sửa thành _Task 4.6 → 4.10_.

**Trạng thái:** `planning-closed-local` / `ready-for-owner-commit` — 0 disposition chặn; Prompt 04 không cần placeholder hay câu hỏi lại.
Việc vận hành không phải lựa chọn thiết kế: ca mơ hồ của J.2 và danh sách thuê bao cần gán của L.3 xử lý theo **ID** trên CSDL thật.

### 14.1 Kiểm chứng

| Kiểm                                                                | Kết quả                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check` (gồm kiểm liên kết và neo)                       | exit 0 — `BE: 287 files, 2430 links, 0 errors` (thêm neo spec mục L từ plan, impact matrix, roadmap, báo cáo)                                                                                                                    |
| `pnpm rules:format`; Prettier trên mọi tệp chạm                     | exit 0; `prettier --write` đúng 7 tệp BE (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index) và 4 tệp thư mục prompt (Prompt 04, tracker, README, `tasks/todo.md`) bằng `.prettierrc` của BE                 |
| `git diff --check`; `git diff --cached --check`; quét Python 18 tệp | exit 0; exit 0, index rỗng; 0 khoảng trắng cuối dòng, 0 trộn CRLF/LF, 0 marker                                                                                                                                                   |
| Phủ finding (`coverage_check.py`, chỉ đọc)                          | 67 finding, 67 dòng phủ (fix 58, deferred 5, documentation-only 2, out-of-scope 1, Docs-owned 1); mỗi dòng có task, dòng test/bằng chứng và một chủ schema/contract; 0 lỗi                                                       |
| Sáu đối chứng gài lỗi của phủ finding                               | 6/6 bị bắt bằng thông báo của script; 0 bản sao tạm sót                                                                                                                                                                          |
| Đóng disposition (`disposition_check.py`, chỉ đọc)                  | 9/9 mục chặn = A có ngày; 5 mục không chặn giữ mặc định A; không còn chữ chờ Owner/placeholder (lệnh chưa đặt tên, _nếu A_, _theo P03-Dxx_ thiếu câu trả lời, ô _Nếu B_, _Task 4.6 → 4.9_); L.2/L.5 đủ điều kiện hợp đồng; 0 lỗi |
| Bảy đối chứng gài lỗi của đóng disposition                          | 7/7 bị bắt (placeholder lệnh, trạng thái lùi về _Có_, dòng P4 cũ, ô dự phòng B, bỏ câu _không thay `REASSIGN`_, bỏ luật không commit bản sao lưu, Prompt 04 hỏi lại); 0 bản sao tạm sót                                          |
| Cây                                                                 | BE `HEAD = 7c28e75`, 58 path (53 sửa + 5 mới) — danh sách trùng từng dòng với trước lượt này, 0 path ngoài `docs/`, index rỗng, 0 stash; Docs `e0cb5a0`, 0 thay đổi                                                              |
| Không chạy                                                          | unit, e2e, integration, OpenAPI export, diễn tập migration (không đổi mã, test, Prisma, migration, OpenAPI, cấu hình)                                                                                                            |

## 15. Review `P03-RV-01` — D03 mở rộng → gán → thu hẹp

Lượt sửa review trong **cùng** Prompt 03 (27/10/2026, prompt `03-continuation-close-owner-dispositions-and-d03-rollout.md`); không audit lại,
không mở lại F01 → F67, không đổi câu trả lời Owner, không đổi mã sản phẩm. `P03-RV-01` là sửa review, **không** phải finding chuẩn mới:
D03 và test của nó vẫn thuộc F02. Skill (đọc đầy đủ trong lượt này): `superpowers:using-superpowers`, `source-driven-development`,
`code-review-and-quality`, `deprecation-and-migration`, `security-and-hardening`, `spec-driven-development`, `planning-and-task-breakdown`,
`engineering:testing-strategy`, `documentation-and-adrs`, `superpowers:verification-before-completion` — không thay thế tên nào.

**Lỗi:** trình tự D03 của mục 14 để migration (B) lỗi có chủ đích, rồi operator chạy `prisma migrate resolve --rolled-back`, gán và deploy
lại — một dòng `_prisma_migrations` lỗi, `P3009` và một lượt deploy hỏng trở thành đường bình thường; trái hợp đồng preflight (`READY` =
lượt deploy chạy được, `BLOCKED` dừng **trước** migration). Nguồn Prisma: `migrate resolve` dùng để khôi phục migration lỗi, baseline hoặc đối
soát hotfix tay ([resolve](https://docs.prisma.io/docs/cli/migrate/resolve),
[failed migration](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing#failed-migration)); `migrate deploy`
áp mọi migration đang chờ ([deploy](https://docs.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy)).

**Sửa:** [spec L.3](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02) và [plan Task 1.2a, Checkpoint E, Task 1.2b, Task
1.2c](../../workspace/items/g0-g6-final-business-baseline-remediation/plan.md#mốc-tương-thích--chạy-trước-mọi-phase-review-p03-rv-01-p03-rv-02-p03-rv-03):

| Mốc     | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                           | Chủ                                                                     | Task               | Test                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------ | ----------------------------------------------------- |
| Mở rộng | revision riêng, làm đầu tiên: migration (A) cột NULL + bảng gán chỉ ghi thêm; trigger `subscriptions_owner_guard` và `subscriptionCreate` bắt buộc `ownerDepartmentId` (không thêm thuê bao không chủ, dòng cũ giữ nguyên); đọc `ownerDepartmentId` nullable; lệnh gán; preflight `READY` trước (A), deploy exit 0 — _thay bởi review `P03-RV-02` (mục 16): (A) chỉ cộng thêm, không trigger trên `subscriptions`_ | `catalog/subscription`, `catalog/subscription-owner-assignment` (agent) | 1.2a, Checkpoint E | P1 F02 mở rộng, bản mở rộng; diễn tập bước 3          |
| Gán     | Owner commit/push/CI/deploy; operator gán từng ID theo căn cứ mua/hợp đồng; preflight `BLOCKED` `SUBSCRIPTION_OWNER_UNASSIGNED` tới khi đủ rồi `READY`                                                                                                                                                                                                                                                             | Owner/operator                                                          | 1.2b               | P1 F02 mốc gán, lệnh gán                              |
| Thu hẹp | sau khi tiếp tục cùng Prompt 04: migration (B) kiểm 0 thiếu/xung đột trước mọi ghi, chép + Audit `SYSTEM`, `SET NOT NULL`, bất biến F20; áp ở lượt deploy đầu; CSDL chưa qua mở rộng ⟹ `SUBSCRIPTION_OWNER_EXPANSION_REQUIRED` trước migration; CSDL trống một lượt                                                                                                                                                | `catalog/subscription` (agent)                                          | 1.2c               | P1 F02 thu hẹp, chặn, CSDL trống; diễn tập bước 4 → 6 |

**Trước → sau (câu chữ):**

- Spec L.3: _"Hai migration tiến liền nhau trong Phase 1 (Task 1.2)"_ và _"Trình tự trên CSDL có thuê bao: … `migrate deploy` (áp (A), dừng ở
  (B); (B) rollback, không ghi) → gán từng thuê bao → `pnpm exec prisma migrate resolve --rolled-back <(B)>` … → `migrate deploy`"_ →
  _"Trình tự mở rộng → gán → thu hẹp … bước gán dữ liệu phải nằm giữa hai revision"_ với ba mốc trên và câu **Cấm cho D03**.
- Plan: _"Task 1.2: Phòng sở hữu của thuê bao"_ (Verify _"deploy dừng ở (B), 0 ghi; gán; `prisma migrate resolve --rolled-back`"_) và
  Checkpoint 1 _"`pnpm prisma migrate deploy` (dừng ở migration (B) …) → … `migrate resolve --rolled-back` …"_ → Task 1.2a, Checkpoint E
  (`expansion-ready-owner-action`), Task 1.2b, Task 1.2c; Checkpoint 1 _"khôi phục mốc đã gán … `migrate deploy` (exit 0 ở lượt đầu) … lịch
  sử migration sạch"_.
- Test matrix: hai dòng P1 F02 _"deploy áp (A), dừng ở (B)"_ và _"… → `prisma migrate resolve --rolled-back` → …"_, bước diễn tập 3 cũ →
  bảy dòng P1 F02 (mở rộng, bản mở rộng, mốc gán, lệnh gán, thu hẹp, chặn, CSDL trống) và bước 3 → 6 mới.
- Prompt 04: bullet D03 _"a populated database needs two `migrate deploy` runs with `prisma migrate resolve --rolled-back` between them"_
  và bước 5 _"`prisma migrate deploy` stopping at the subscription-owner migration (B) → … `prisma migrate resolve --rolled-back` …"_ →
  § 1A (một điểm dừng nội bộ, việc Owner/operator, tiếp tục cùng prompt, **Forbidden for D03**) và bước 5 mới.

**Việc Owner/operator giữa mốc mở rộng và mốc thu hẹp:** (1) review và commit đúng các path mốc mở rộng Prompt 04 báo; push `dev`; chờ CI
xanh; (2) deploy commit đó bằng quy trình deploy thường (sao lưu → `ops:preflight` `READY` kèm danh sách → `migrate deploy` exit 0) lên mọi
CSDL có dữ liệu sẽ nhận bản cuối; (3) trên từng CSDL `pnpm ops:preflight` ⟹ `BLOCKED` `SUBSCRIPTION_OWNER_UNASSIGNED` liệt kê ID; (4) với
mỗi ID, theo căn cứ mua/hợp đồng đã duyệt: `pnpm ops:assign-subscription-owner --subscription <id> --department <mã phòng> --basis <tham
chiếu> --operator <tham chiếu> --environment SHARED`; (5) chạy lại `pnpm ops:preflight` tới khi `READY`; (6) ghi tracker: SHA commit mốc và CI
run, CSDL đã deploy, số ID đã gán, đầu ra `READY` (chỉ ID), SHA-256 bản sao lưu — hoặc ghi rằng ngoài CSDL diễn tập local không có CSDL có
dữ liệu; rồi cho tiếp tục **cùng** Prompt 04.

**Trạng thái:** `planning-closed-local` / `ready-for-owner-commit`. Chín câu trả lời Owner, P03-D08, P03-D16, mặc định không chặn và mọi
thiết kế J/K/L khác giữ nguyên.

### 15.1 Kiểm chứng

| Kiểm                                                      | Kết quả                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nguồn Prisma (WebFetch tài liệu chính thức)               | `migrate resolve`: _"Recover from failed migrations"_, baseline, đối soát hotfix tay; _"can only be used with a failed migration"_. `migrate deploy`: _"applies all pending migrations"_. Sau migration lỗi: _"further migrations using `prisma migrate deploy` are impossible"_ tới khi khôi phục           |
| `pnpm rules:check` (gồm liên kết và neo)                  | exit 0 — `BE: 287 files, 2434 links, 0 errors` (neo mới: mục 15, plan _Mốc mở rộng D03_)                                                                                                                                                                                                                     |
| `pnpm rules:format`; Prettier trên mọi tệp chạm           | exit 0; 7 tệp BE (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index) và 3 tệp thư mục prompt (Prompt 04, tracker, README) bằng `.prettierrc` của BE                                                                                                                                      |
| `git diff --check`; `git diff --cached --check`           | exit 0; exit 0; index rỗng, 0 stash                                                                                                                                                                                                                                                                          |
| Phủ finding (`coverage_check.py`) + sáu đối chứng gài lỗi | 67 finding, 67 dòng (fix 58, deferred 5, documentation-only 2, out-of-scope 1, Docs-owned 1), 0 lỗi; 6/6 bị bắt                                                                                                                                                                                              |
| Đóng disposition (`disposition_check.py`) + bảy đối chứng | 9/9 mục chặn = A có ngày, 0 lỗi; 7/7 bị bắt                                                                                                                                                                                                                                                                  |
| Trình tự D03 (`rollout_check.py`, mới, chỉ đọc)           | 10 văn bản kế hoạch: 0 dùng `migrate resolve` cho D03, 0 câu migration lỗi có chủ đích hay deploy dừng giữa chừng; ba mốc đều có chủ, task, dòng test; Prompt 04 đúng một điểm dừng `expansion-ready-owner-action` và tiếp tục cùng prompt; diễn tập bước 3, 4, 6 kết thúc với lịch sử migration sạch; 0 lỗi |
| Sáu đối chứng của trình tự D03                            | 6/6 bị bắt: đưa lại `migrate resolve`, bỏ điểm dừng mở rộng, cho (B) chạy trước khi gán xong, bỏ đường CSDL trống, đưa lại câu _dừng ở (B)_, bỏ phụ thuộc Task 1.2c → 1.2b; 0 bản sao tạm sót                                                                                                                |
| Cây BE và hash                                            | `HEAD = dev = origin/dev = 7c28e75`, 0/0; 58 path (53 sửa + 5 mới) — danh sách trùng từng dòng với preflight, 0 path ngoài `docs/`; 7 path đổi hash (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index), 51 path trùng byte                                                              |
| Thư mục prompt                                            | 3 tệp đổi (Prompt 04, tracker, README); prompt continuation, Prompt 03, `tasks/*` trùng byte                                                                                                                                                                                                                 |
| Docs                                                      | `main = origin/main = e0cb5a0`, sạch lúc preflight. Trong lượt này `Diagrams/system-architecture/SYSTEM-ARCHITECTURE.drawio` bị lưu lúc 10:33:38 kèm `.$SYSTEM-ARCHITECTURE.drawio.bkp` (bản lưu của trình sửa draw.io, ngoài lượt này); lượt này không đọc-ghi Docs, không hoàn tác                         |
| Không chạy                                                | unit, e2e, integration, OpenAPI export, diễn tập migration thật (không đổi mã, test, Prisma, migration, OpenAPI, cấu hình)                                                                                                                                                                                   |

## 16. Review `P03-RV-02` — migration (A) tương thích runtime cũ

Lượt sửa review cuối trong **cùng** Prompt 03 (27/10/2026, prompt `03-final-correction-close-d03-expansion-runtime-compatibility.md`);
không audit lại, không đổi câu trả lời Owner, không đổi mã sản phẩm. `P03-RV-02` là sửa review dưới F02, **không** phải F68 hay quyết định
Owner mới. Skill (đã nạp đầy đủ trong phiên, nội dung không đổi): `superpowers:using-superpowers`, `source-driven-development`,
`code-review-and-quality`, `deprecation-and-migration`, `planning-and-task-breakdown`, `spec-driven-development`,
`engineering:testing-strategy`, `superpowers:verification-before-completion`.

**Lỗi:** mục 15 đặt trigger chặn `owner_department_id` NULL trên `subscriptions` vào migration (A). Image `7c28e75` không gửi phòng, còn H7
chạy sao lưu → preflight → `migrate deploy` → `reconcile` **trước** khi recreate `api`/`worker` (`scripts/ops/deploy-release.sh`: bước
`migrate deploy` rồi `ops:db-roles reconcile` trước khi promote/recreate) và phục hồi image trước khi deploy lỗi
(`docs/guides/containers.md` _Deploys after H7_) ⟹ `subscriptionCreate` của image cũ nhận `23514` trong cửa sổ migrate → recreate và sau
một lượt deploy lỗi — trái bất biến mở rộng/thu hẹp (runtime trước và sau đều hợp lệ trên schema đang có).

**Sửa:** [spec L.3](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02), [plan](../../workspace/items/g0-g6-final-business-baseline-remediation/plan.md#mốc-tương-thích--chạy-trước-mọi-phase-review-p03-rv-01-p03-rv-02-p03-rv-03):

| Mốc     | Nội dung                                                                                                                                                                                                                                                                                                                                     | Chủ                                                                                                         | Task               | Test                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| Mở rộng | (A) chỉ cộng thêm: cột NULL, FK nullable, chỉ mục, bảng gán chỉ ghi thêm với luật riêng của bảng; **không** trigger, CHECK, `NOT NULL` trên `subscriptions`; image `7c28e75` vẫn tạo/sửa/đọc; bất biến ghi mới ở ứng dụng mở rộng (`subscriptionCreate` bắt buộc `ownerDepartmentId`); preflight và lệnh gán probe schema trước mọi truy vấn | `catalog/subscription`, `catalog/subscription-owner-assignment`, `installation/migration-preflight` (agent) | 1.2a, Checkpoint E | P1 F02 mốc mở rộng, hình dạng ghi `7c28e75`, runtime cũ thật, bản mở rộng chạy, probe; diễn tập bước 3 |
| Gán     | kiểm kê sống tính lại mỗi lần chạy, gồm dòng gán thiếu, dòng muộn và dòng image cũ tạo sau phục hồi/rollback; bản cuối chỉ deploy khi bản đang chạy là bản mở rộng và preflight `READY`                                                                                                                                                      | Owner/operator                                                                                              | 1.2b               | P1 F02 kiểm kê sống, lệnh gán                                                                          |
| Thu hẹp | (B) là migration đầu tiên của bản cuối và một mình đặt ràng buộc CSDL: chép + Audit `SYSTEM`, `NOT NULL`, `subscriptions_owner_immutable`, `license_assignments_owner_department_guard`, CHECK seat cá nhân; runtime mở rộng hợp lệ trên (A) + (B); CSDL trống một lượt                                                                      | `catalog/subscription`, `licensing` (agent)                                                                 | 1.2c               | P1 F02 thu hẹp, rollback về bản mở rộng, chặn, CSDL trống; diễn tập bước 4 → 7                         |

**Trước → sau (câu chữ):**

- Spec L.3: _"**Không thêm thuê bao không chủ:** trigger `subscriptions_owner_guard` — `BEFORE INSERT`: `owner_department_id IS NULL` ⟹
  `RAISE …`"_ (trong mốc mở rộng) → _"**(A) tương thích runtime cũ:** (A) không đặt trigger, CHECK hay `NOT NULL` nào trên `subscriptions`"_
  và _"**Bất biến ghi mới ở tầng ứng dụng, từ khi bản mở rộng chạy**"_; thêm _Bất biến mở rộng/thu hẹp_, _Probe schema trước mọi truy vấn_,
  _kiểm kê sống_, điều kiện _bản đang chạy là bản mở rộng_; (B) _"là migration đầu tiên của bản cuối … và một mình đặt ràng buộc CSDL"_ kèm
  guard F02/F20 và _Runtime mở rộng hợp lệ trên (A) + (B)_.
- Plan: Task 1.2a _"(migration đầu tiên của Prompt 04; trigger `subscriptions_owner_guard` và trigger của bảng gán)"_ → _"chỉ cộng thêm —
  … không trigger, CHECK hay `NOT NULL` nào trên `subscriptions`"_, Verify thêm hình dạng ghi `7c28e75`, `pg_trigger`, probe và đối chứng
  bỏ probe; Checkpoint E thêm runtime `7c28e75` thật và runtime mở rộng; Task 1.2b thêm phục hồi/rollback image cũ và điều kiện bản đang
  chạy; Task 1.2c _"Depends on: Task 1.1, Task 1.2b"_ → _"Task 1.2b, Checkpoint 0 … task đầu tiên của Phase 1"_ và chuyển lên đầu Phase 1.
- Test matrix: bảy dòng P1 F02 → mười một (thêm hình dạng ghi `7c28e75`, runtime cũ thật, probe, kiểm kê sống, rollback về bản mở rộng);
  diễn tập bước 3 → 6 cũ → 3 → 7 (runtime cũ và rollback có chủ đích ở bước 3; bước (B) riêng với runtime mở rộng ở bước 4).
- Prompt 04: § 1A _"migration (A), the `subscriptions_owner_guard` trigger, …"_ → _"migration (A), `ownerDepartmentId` required on
  `subscriptionCreate` (application level) …"_ cùng hai bullet mới _Migration (A) is additive only…_ và _Schema probe_; bước 5 bắt đầu bằng (B)
  riêng với runtime mở rộng; **Forbidden for D03** thêm trigger/CHECK/`NOT NULL` ở (A).

**Việc Owner/operator giữa mốc mở rộng và mốc thu hẹp** (như mục 15, thêm hai điều): (1) commit đúng các path mốc mở rộng Prompt 04 báo,
push `dev`, chờ CI xanh; (2) deploy commit đó bằng quy trình thường lên mọi CSDL có dữ liệu sẽ nhận bản cuối — nếu deploy lỗi và H7 phục hồi
image cũ, hoặc bản mở rộng bị rollback, image cũ vẫn chạy; deploy lại bản mở rộng và gán cả các thuê bao nó tạo (preflight kế liệt kê); (3)
`pnpm ops:preflight` ⟹ `BLOCKED` `SUBSCRIPTION_OWNER_UNASSIGNED` liệt kê ID; (4) mỗi ID theo căn cứ mua/hợp đồng đã duyệt: `pnpm
ops:assign-subscription-owner --subscription <id> --department <mã phòng> --basis <tham chiếu> --operator <tham chiếu> --environment SHARED`;
(5) chạy lại `pnpm ops:preflight` tới khi `READY` **trong khi image đang chạy là image mở rộng**; (6) ghi tracker: SHA commit mốc và CI run,
CSDL đã deploy và image đang chạy, số ID đã gán, đầu ra `READY` (chỉ ID), SHA-256 bản sao lưu — hoặc ghi rằng ngoài CSDL diễn tập local không
có CSDL có dữ liệu; rồi cho tiếp tục **cùng** Prompt 04.

**Giới hạn còn lại:** (a) migration sau (B) của bản cuối (F01, F03, F04 → F06 có bước phá hủy) không tương thích ngược; rollback qua chúng
vẫn là khôi phục bản sao lưu (`DB-05`, L.5) như trước — `P03-RV-02` chỉ bảo đảm (A) với image cũ và (B) với image mở rộng; (b) trên (A) + (B),
image mở rộng ghi seat lệch phòng với thuê bao (điều `QĐ-89a` cấm) bị trigger F20 từ chối không ghi gì, nhưng image đó chưa ánh xạ lỗi này
thành 4xx riêng; (c) diễn tập dựng runtime `7c28e75` và runtime mở rộng từ `git archive` trong thư mục tạm — cần cài phụ thuộc ở đó.

**Trạng thái:** `planning-closed-local` / `ready-for-owner-commit`. `P03-RV-01` và `P03-RV-02` đều đóng.

### 16.1 Kiểm chứng

| Kiểm                                                       | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nguồn H7 (đọc mã và runbook)                               | `scripts/ops/deploy-release.sh`: sao lưu → `ops:preflight` (image ứng viên) → `migrate deploy` → `ops:db-roles reconcile`, rồi mới promote và recreate `api`/`worker`/`caddy`; lỗi trước promote in _"the running containers are unchanged"_; lỗi sau promote phục hồi image trước (`docs/guides/containers.md` _Deploys after H7_) ⟹ image cũ chạy trên schema đã migrate                                       |
| `pnpm rules:check` (gồm liên kết và neo)                   | exit 0 — `BE: 287 files, 2434 links, 0 errors`                                                                                                                                                                                                                                                                                                                                                                   |
| Kiểm neo độc lập (`anchor_check.py`, slug kiểu GitHub)     | 256 liên kết `#…` trong 7 tài liệu BE chạm, 0 thiếu (gồm neo mục 16 và plan _Mốc mở rộng D03_)                                                                                                                                                                                                                                                                                                                   |
| `pnpm rules:format`; Prettier trên mọi tệp chạm            | exit 0; 7 tệp BE (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index) và 3 tệp thư mục prompt (Prompt 04, tracker, README) bằng `.prettierrc` của BE                                                                                                                                                                                                                                          |
| `git diff --check`; `git diff --cached --check`            | exit 0; exit 0; index rỗng, 0 stash                                                                                                                                                                                                                                                                                                                                                                              |
| Phủ finding (`coverage_check.py`) + sáu đối chứng          | 67 finding, 67 dòng (fix 58, deferred 5, documentation-only 2, out-of-scope 1, Docs-owned 1; F02 `P1 F02 ×11`), 0 lỗi; 6/6 bị bắt                                                                                                                                                                                                                                                                                |
| Đóng disposition (`disposition_check.py`) + bảy đối chứng  | 9/9 mục chặn = A có ngày, 0 lỗi; 7/7 bị bắt                                                                                                                                                                                                                                                                                                                                                                      |
| Trình tự D03 (`rollout_check.py`, mở rộng cho `P03-RV-02`) | 10 văn bản kế hoạch: 0 `migrate resolve`, 0 câu migration lỗi chủ đích, 0 tên trigger (A) cũ; (A) chỉ cộng thêm, runtime cũ hợp lệ, probe schema, kiểm kê sống, điều kiện bản đang chạy là bản mở rộng, (B) đầu tiên của bản cuối và một mình đặt guard, runtime mở rộng hợp lệ trên (A) + (B); ba mốc đủ chủ/task/test; Prompt 04 đúng một điểm dừng; diễn tập bước 3, 4, 5, 7 kết thúc với lịch sử sạch; 0 lỗi |
| Mười đối chứng của trình tự D03                            | 10/10 bị bắt: sáu của `P03-RV-01` (đưa lại `migrate resolve`, bỏ điểm dừng, (B) trước khi gán xong, bỏ CSDL trống, câu _dừng ở (B)_, bỏ phụ thuộc 1.2c → 1.2b) và bốn của `P03-RV-02` (đưa lại guard chủ sở hữu vào (A), bỏ phủ phục hồi image cũ, truy vấn schema chưa có mà không probe, cho (B) khi chưa `READY`/bản đang chạy chưa là bản mở rộng); 0 bản sao tạm sót                                        |
| Cây BE và hash                                             | `HEAD = dev = origin/dev = 7c28e75`, 0/0; 58 path (53 sửa + 5 mới) — danh sách trùng từng dòng với preflight, 0 path ngoài `docs/`; 7 path đổi hash (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index), 51 path trùng byte                                                                                                                                                                  |
| Thư mục prompt                                             | 3 tệp đổi (Prompt 04, tracker, README); prompt final correction, continuation, Prompt 03, `tasks/*` trùng byte                                                                                                                                                                                                                                                                                                   |
| Docs                                                       | `main = origin/main = e0cb5a0`; cây đã bẩn từ trước lượt này do hai tệp sơ đồ (`Diagrams/system-architecture/SYSTEM-ARCHITECTURE.drawio`, `Diagrams/functional-decomposition-diagram/saas-sentry-functional-decomposition.drawio.png`) — không do lượt này, không đọc-ghi, không hoàn tác                                                                                                                        |
| Không chạy                                                 | unit, e2e, integration, OpenAPI export, diễn tập migration thật (không đổi mã, test, Prisma, migration, OpenAPI, cấu hình)                                                                                                                                                                                                                                                                                       |

## 17. Review `P03-RV-03` — bản tương thích cho mọi migration thu hẹp/phá hủy

Lượt sửa review trong **cùng** Prompt 03 (27/10/2026, prompt `03-closure-close-final-release-runtime-compatibility.md`); không audit lại,
không đổi câu trả lời Owner, không đổi mã sản phẩm. `P03-RV-03` là sửa review gắn F01, F03, F04 → F06, F20, **không** phải F68 hay quyết
định Owner mới. Skill (đọc đầy đủ trong phiên): `superpowers:using-superpowers`, `agent-skills:source-driven-development`,
`agent-skills:code-review-and-quality`, `agent-skills:api-and-interface-design`, `agent-skills:security-and-hardening`,
`agent-skills:deprecation-and-migration`, `agent-skills:spec-driven-development`, `agent-skills:planning-and-task-breakdown`,
`engineering:testing-strategy`, `superpowers:verification-before-completion`.

**Lỗi:** `P03-RV-02` làm (A) an toàn cho `7c28e75`, nhưng bản cuối vẫn chạy (B) rồi các migration phá hủy F01, F03, F04 → F06 **trước** khi
ứng dụng tương ứng được recreate. H7 chạy sao lưu → preflight → `migrate deploy` → `reconcile` rồi mới promote/recreate, chờ sẵn sàng tối đa
120 s + 20 s ổn định, và khi lỗi sau đó dựng lại image trước trên CSDL đã migrate, không hoàn tác migration (`scripts/ops/deploy-release.sh`;
`docs/guides/containers.md` _Deploys after H7_) ⟹ image mở rộng (đang chạy hoặc được phục hồi) vẫn đọc `departments.cost_center_id`,
`job_titles`, bảy bảng bộ chuẩn/phân bổ/chuyển phòng mà bản cuối đã xóa; mục 16 ghi điều này là _giới hạn_ và dựa vào khôi phục `pg_dump`.
Sau (B), seat lệch phòng trên image mở rộng bị trigger F20 từ chối thành 500 chưa ánh xạ. Đọc thêm mã `7c28e75`: Cost Center tự do
(`createDepartmentBlockedBy: NO_FREE_COST_CENTER`) là dữ liệu bình thường ⟹ `cost_centers.department_id NOT NULL` tuyệt đối của spec A cũ không
áp được cho dữ liệu đó và image tương thích được phục hồi không còn tạo được phòng/Cost Center.

**Sửa** ([spec L.10](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03), mục K dòng F20, L.3 → L.6; [plan](../../workspace/items/g0-g6-final-business-baseline-remediation/plan.md#mốc-tương-thích--chạy-trước-mọi-phase-review-p03-rv-01-p03-rv-02-p03-rv-03)):

| Ranh giới                                | Nội dung                                                                                                                                                                                                                              | Chủ                                                                                           | Task                                                   | Test                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `7c28e75` → bản tương thích              | migration chỉ cộng thêm/nới (A, liên kết Cost Center → phòng, `employees.job_title`, tám giá trị enum, cột người thực hiện nullable, `detached_at`) + trigger đồng bộ hai chiều; `7c28e75` vẫn ghi/đọc, đọc được dòng bản tương thích | `catalog`, `organization`, `personnel`, `requests`, `budgets`, `licensing` (agent)            | 1.2a, 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a; Checkpoint E | P1 F01, F03, F62/F65, F63/F36; diễn tập bước 3                                                              |
| Điểm dừng `expansion-ready-owner-action` | hủy chuyển phòng chờ trên `7c28e75`; deploy bản tương thích; gán thuê bao; từ chối/hủy dòng chờ L.4; mọi cổng hợp đồng `READY` khi image đang chạy là image tương thích; ghi SHA image                                                | Owner/operator                                                                                | 1.2b                                                   | P1 F06; diễn tập bước 3, 7                                                                                  |
| Bản tương thích → bản cuối               | mọi migration thu hẹp/phá hủy tương thích image tương thích: không xóa thứ nó nhắc, ràng buộc mới nhận mọi ghi của nó, đồng thuận từ vựng/ngữ nghĩa; F20 422 trước trigger; H7 phục hồi không khôi phục CSDL                          | `licensing`, `organization`, `personnel`, `catalog`, `finance`, `requests`, `budgets` (agent) | 1.2c, 1.1, 1.3, 1.4, 1.6, 1.7, 1.8                     | P1 F20, F02/F20 (từng migration, phục hồi H7), F01/F03 (đồng thuận schema), F04–F06; diễn tập bước 4 → 6, 8 |

**Thứ tự phase trước → sau:**

- Trước: Task 1.2a (chỉ D03) → Checkpoint E (dừng) → Task 1.2b → P0 → P1 (1.2c (B), 1.1 F01 phá hủy + đọc mới, 1.3 F03 phá hủy, 1.4 F04 → F06
  phá hủy, 1.5, 1.6 giá trị + cấu trúc, 1.7 giá trị + cấu trúc, 1.8) → P2 … (gỡ API F03 ở 2.4, F04/F05 ở 3.1, F04 Request ở 4.2, F06 ở 5.3; F20
  service ở 3.2) → P7.
- Sau: **bản tương thích** — Task 1.2a → 1.1a → 1.3a → 1.4a → 1.9a → 3.2a → 4.7a → Checkpoint E (dừng một lần) → Task 1.2b → P0 → P1 (1.2c (B),
  1.1, 1.3, 1.4 chỉ thu hẹp/xóa; 1.5; 1.6, 1.7 chỉ cấu trúc; 1.8) → P2 … P7; mỗi migration của P1 có bằng chứng image tương thích trước/sau.

**Đối tượng chuyển qua điểm dừng:** (F02) (A), `ownerDepartmentId`; (F20) guard service + mapper 422; (F01) `cost_centers.department_id`,
`linked_at`, CHECK `cost_centers_link_together`, `cost_centers_one_active_per_department`, nới `departments.cost_center_id`, hàm kiểm nhận NULL,
`departments_cost_center_link_forward`, `cost_centers_department_link_backward`, đọc qua liên kết mới, 409 `FINANCE.SETUP_INCOMPLETE` khi phòng
không có Cost Center; (F03, F41) `employees.job_title`, nới bốn cột `job_title_id`, `employees_job_title_forward`, `job_title_id_backfill`, gỡ
`jobTitle*`, từ chối loại đã bỏ 422; (F04 → F06) gỡ 12 operation, `outsideStandard*`, mọi đọc bảy bảng, phạm vi rà soát mọi quyền; (từ vựng)
tám giá trị enum, mười cột người thực hiện nullable, ẩn `DRAFT`; (F63, F36) từ chối giữ `REVIEWED`, `detached_at`. Ở lại bản cuối: (B), bỏ
cột/bảng/trigger của F01, F03, F04 → F06, cấu trúc của Task 1.6 → 1.8, F47, bộ đếm F48 (cấp số không trùng sequence cũ).

**Hợp đồng F20 chốt:** 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` — policy service của `licensing/assignment` trước khi ghi;
`provisioningTaskGrant`; dòng nhập seat `ERROR` cùng mã; trigger `license_assignments_owner_department_guard` `RAISE … CONSTRAINT =` tên trigger
và mapper dịch sang cùng mã; ví dụ OpenAPI và test dùng đúng mã này.

**Trước → sau (câu chữ):**

- Spec L.3: _"Chỉ ghi seat lệch phòng với thuê bao — điều `QĐ-89a` cấm — bị trigger F20 từ chối, không ghi gì. Giới hạn: các migration **sau**
  (B) của bản cuối (F01, F03, F04 → F06 có bước phá hủy) không tương thích ngược; rollback qua chúng vẫn là khôi phục bản sao lưu"_ → _"Seat
  lệch phòng … bị guard service của bản tương thích từ chối 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` **trước** khi ghi …
  Mọi migration **sau** (B) của bản cuối … cũng tương thích với image này theo mục L.10; khôi phục bản sao lưu chỉ là đường khẩn cấp"_.
- Spec A: _"`cost_centers.department_id` NOT NULL, `linked_at` NOT NULL"_ → _"cùng có hoặc cùng NULL; NULL **chỉ** ở dòng chưa từng gắn phòng
  của dữ liệu trước bản cuối"_. Spec L.4, L.5, L.6 thêm _Thời điểm_; L.5 thêm _"chỉ khi operator chủ động rollback qua ranh giới phá hủy"_;
  mục L.10 mới; mục K thêm dòng F20.
- Plan: mục _Mốc mở rộng D03_ → _Mốc tương thích_ (Task 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a mới cạnh 1.2a); Checkpoint E thêm `prisma migrate
diff` chứng minh `@ignore`/`@@ignore` (UNVERIFIED trong tài liệu Prisma), gate tĩnh; Task 1.2b thêm hủy chuyển phòng trên `7c28e75`, dọn L.4,
  mọi cổng hợp đồng; Task 1.1, 1.3, 1.4 chỉ còn thu hẹp/xóa; Task 1.6, 1.7 bỏ migration giá trị; Task 4.2 chỉ kiểm lại; Checkpoint 1 thêm
  bước 4, 5 và đồng thuận schema; bảng _Phủ finding_ cập nhật F01, F03 → F06, F20, F27, F29, F36, F41, F42, F62, F63, F65.
- Test matrix: Phase 1 thêm mười ba dòng ranh giới (F20; F02/F20 ×3; F01 ×2; F01/F03; F03; F03/F41; F04–F06; F06; F62/F65; F63/F36), Phase 5
  thêm F48; diễn tập 3 → 7 cũ thành 3 → 8 (bước 4 _image tương thích qua từng migration_, bước 5 _phục hồi H7 giả lập_); gate cuối thêm dòng
  ranh giới.
- Prompt 04: § 1A _"Internal expansion checkpoint — D03 expand → assign → contract"_ → _"Internal compatibility checkpoint — expand, cut over,
  assign, clean up"_ (bảy task, F20, `@ignore` UNVERIFIED, bảy việc Owner/operator, **Forbidden** thêm migration cuối xóa đối tượng image tương
  thích còn nhắc và bằng chứng phục hồi chỉ health); § 3 bước 5 thêm từng migration với runtime tương thích thật, phục hồi H7 giả lập, gate
  đồng thuận schema, ca chuyển phòng chờ sót.

**Việc Owner/operator giữa mốc tương thích và bản cuối:** (1) trên `7c28e75` hủy mọi `service_account_moves` `PENDING` (lý do L.5); (2) commit
đúng các path bản tương thích Prompt 04 báo, push `dev`, chờ CI xanh; (3) deploy bằng quy trình thường lên mọi CSDL có dữ liệu sẽ nhận bản
cuối — deploy lỗi/rollback ⟹ image cũ vẫn chạy, deploy lại và gán cả thuê bao nó tạo; chuyển phòng chờ do image cũ tạo sau preflight ⟹ rollback
có chủ đích về `7c28e75`, hủy, deploy lại; (4) `pnpm ops:preflight` liệt kê mọi cổng hợp đồng mở; (5) gán từng thuê bao theo căn cứ, từ chối
`BM-09` `JOB_TITLE_CHANGE` chờ và hủy điều chuyển chờ chỉ đổi chức vụ (lý do L.4), ca mơ hồ J.2 theo ID; (6) chạy lại `pnpm ops:preflight` tới
khi `READY` **trong khi image đang chạy là image tương thích**; (7) ghi tracker SHA commit, CI run, CSDL, `releases/current-image` + SHA image,
số ID đã gán, số dòng đã hủy/từ chối, `READY` (chỉ ID), SHA-256 bản sao lưu; rồi cho tiếp tục **cùng** Prompt 04.

**Không cần điểm dừng thứ hai:** mọi đối tượng phá hủy đặt được vào spec L.10. Ràng buộc duy nhất phải đổi là `cost_centers.department_id NOT
NULL` tuyệt đối — thay bằng _NULL chỉ ở dòng chưa từng gắn phòng_, không suy diễn, không xóa; luật _Cost Center lập cho một phòng_ giữ ở
`costCenterCreate` của bản cuối. Đây là hệ quả rollout của F01, không đổi disposition Owner; Owner xem lại khi review tài liệu.

**Giới hạn còn lại (thật):** (a) thời gian chạy bản tương thích: phòng tạo kèm Cost Center tự do và chức vụ bắt buộc như `7c28e75`; lập lại
phiên bản/đề xuất kế tiếp sau khi bị từ chối chờ bản cuối (409 hiện có); (b) dòng bản cuối ghi trong cửa sổ sẵn sàng rồi image tương thích được
phục hồi: đọc được, thao tác chỉ có ở bản cuối chờ bản cuối deploy lại; sửa phiên bản do image tương thích được phục hồi chỉ ở Audit Trail,
không có dòng `budget_version_history`; (c) rollback có chủ đích về `7c28e75` sau khi bản cuối đã chạy là đường khẩn cấp bằng `pg_dump`; (d)
việc Prisma Migrate giữ đối tượng `@ignore`/`@@ignore` chưa có nguồn chính thức — Checkpoint E chứng minh bằng `prisma migrate diff`, không
rỗng ⟹ dừng.

**Trạng thái:** `planning-closed-local` / `ready-for-owner-commit`. `P03-RV-01`, `P03-RV-02`, `P03-RV-03` đều đóng. _(27/10/2026: đoạn **Không cần điểm dừng thứ hai** và giới hạn (a) của mục này bị thay bởi [mục 18](#18-review-p03-rv-04--cost-center-luôn-thuộc-một-phòng-và-bước-kích-hoạt) — review `P03-RV-04`: không còn ngoại lệ Cost Center thiếu phòng.)_

### 17.1 Kiểm chứng

| Kiểm                                                                | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nguồn H7 (đọc mã và runbook)                                        | `scripts/ops/deploy-release.sh`: sao lưu (`slm-pre-migrate-…dump`) → `ops:preflight` (image ứng viên, exit 2 dừng) → `migrate deploy` → `ops:db-roles reconcile` (lỗi ⟹ _"the running containers are unchanged"_) → promote (`releases/current-image` đổi trước recreate) → recreate `api`/`worker`/`caddy` → sẵn sàng `READY_TIMEOUT=120` + cửa sổ ổn định 20 s → `recover()` dựng lại image trước; runbook _Deploys after H7_: _"No migration is rolled back: the database keeps them and the dump taken before them is the way back for the data"_                                                                                                                                                 |
| Nguồn mã `7c28e75` (chỉ đọc)                                        | Cost Center tự do là dữ liệu bình thường: `onboarding.service.ts:111` (`NO_FREE_COST_CENTER`), `cost-center.repo.ts:227` (`countFreeUnits`); phòng chỉ gắn Cost Center khi tạo (`department.service.ts:71-83`); `access_requests.outside_standard BOOLEAN NOT NULL DEFAULT false` (`20261023120000_requests_outside_standard_flag/migration.sql:3`); bốn FK `job_title_id` → `job_titles`; mã `BM09-<năm>-<6 chữ số>` (`20261024230000_personnel_notices/migration.sql:46`); operation ghi Assignment với tới: `provisioningTaskGrant`, `seatBaselineImport*`                                                                                                                                         |
| Nguồn Prisma (WebFetch tham chiếu schema chính thức)                | `@ignore`: _"Ignored fields are excluded from the generated Prisma Client"_, `create` tắt với trường bắt buộc không `@default`; `@@ignore`: _"Ignored models are excluded from the generated Prisma Client"_; trang **không** nói Prisma Migrate có quản lý tiếp ⟹ ghi **UNVERIFIED**, Checkpoint E chứng minh bằng `prisma migrate diff`                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm rules:check` (gồm liên kết và neo)                            | exit 0 — `BE: 287 files, 2456 links, 0 errors`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Kiểm neo độc lập (`anchor_check.py`)                                | 281 liên kết `#…` trong 7 tài liệu BE chạm, 0 thiếu (gồm neo mục 17, spec L.10, plan _Mốc tương thích_)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm rules:format`; Prettier trên mọi tệp chạm                     | exit 0; 7 tệp BE và 3 tệp thư mục prompt (Prompt 04, tracker, README) bằng `.prettierrc` của BE                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `git diff --check`; `git diff --cached --check`                     | exit 0; exit 0; index rỗng, 0 stash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Phủ finding (`coverage_check.py`) + sáu đối chứng                   | 67 finding, 67 dòng (fix 58, deferred 5, documentation-only 2, out-of-scope 1, Docs-owned 1), 0 lỗi; 6/6 bị bắt — sau khi chỉnh hệ số `P1 F01 ×5`, `F03 ×5`, `F06 ×4`, `F41 ×3`, `F36 ×2`, `F63 ×7` theo đúng số dòng (đối chứng bỏ một dòng F63 lúc đầu lọt vì dòng `F63/F36` mới)                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Đóng disposition (`disposition_check.py`) + bảy đối chứng           | 9/9 mục chặn = A có ngày, 0 lỗi; 7/7 bị bắt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Trình tự rollout (`rollout_check_rv03.py`, mở rộng cho `P03-RV-03`) | 10 văn bản kế hoạch: 0 `migrate resolve`, 0 migration lỗi chủ đích, 0 câu _không tương thích ngược; rollback qua chúng_; L.3 giữ thiết kế `P03-RV-01/02`; L.10 đủ bất biến, bảng 9 dòng, mỗi đối tượng F01/F03/F04 → F06 có bước cộng thêm, chuyển ứng dụng (`@ignore`/`@@ignore`) và bước thu hẹp; mục K F20 có mã 422, mapper, không 500; bảy task tương thích trước Checkpoint E, Task 1.1/1.3/1.4 phụ thuộc task tương thích và (B); test matrix đủ dòng ranh giới; diễn tập 3, 4, 5, 6, 8 kết thúc với lịch sử sạch; Prompt 04 đúng một điểm dừng; tracker mỗi `P03-RV-*` một dòng, một trạng thái đóng; 0 lỗi (lượt đầu bắt một thiếu sót thật — dòng F03 của L.10 chưa nêu `@ignore` — đã sửa) |
| Mười sáu đối chứng của trình tự rollout                             | 16/16 bị bắt: mười của `P03-RV-01/02` và sáu của `P03-RV-03` — migration phá hủy trước khi chuyển ứng dụng (bỏ phụ thuộc Task 1.1 → 1.1a), image tương thích còn nhắc đối tượng bị xóa (bỏ `@@ignore`), phục hồi chỉ kiểm health, F20 từ chối ở CSDL không ánh xạ, trạng thái tracker mâu thuẫn, điểm dừng thứ hai; 0 bản sao tạm sót                                                                                                                                                                                                                                                                                                                                                                 |
| Cây BE và hash                                                      | `HEAD = dev = origin/dev = 7c28e75`, 0/0; 58 path (53 sửa + 5 mới) — danh sách trùng từng dòng với preflight, 0 path ngoài `docs/`; 7 path đổi hash (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index), 51 path trùng byte; kiểu xuống dòng của từng tệp giữ nguyên                                                                                                                                                                                                                                                                                                                                                                                                              |
| Thư mục prompt                                                      | 3 tệp đổi (Prompt 04, tracker, README); Prompt 03, ba prompt sửa review, `tasks/*` không chạm (thời điểm sửa giữ nguyên từ trước lượt; thư mục không phải repo Git nên không có hash nền)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Docs                                                                | `main = origin/main = e0cb5a0`; hai tệp sơ đồ bẩn từ trước lượt này (`Diagrams/system-architecture/SYSTEM-ARCHITECTURE.drawio`, `Diagrams/functional-decomposition-diagram/saas-sentry-functional-decomposition.drawio.png`) — không do lượt này, không đọc-ghi, không hoàn tác                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Không chạy                                                          | unit, e2e, integration, OpenAPI export, Docker smoke, diễn tập migration thật (không đổi mã, test, Prisma, migration, OpenAPI, cấu hình)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## 18. Review `P03-RV-04` — Cost Center luôn thuộc một phòng và bước kích hoạt

Lượt sửa review trong **cùng** Prompt 03 (27/10/2026, prompt `03-authority-correction-close-cost-center-ownership-drift.md`); không audit lại,
không đổi câu trả lời Owner P03-D01 → P03-D16, không đổi mã sản phẩm. `P03-RV-04` là sửa review gắn F01, **không** phải F68 hay quyết định
nghiệp vụ mới. Skill (đọc đầy đủ trong phiên): `superpowers:using-superpowers`, `agent-skills:source-driven-development`,
`agent-skills:code-review-and-quality`, `agent-skills:api-and-interface-design`, `agent-skills:security-and-hardening`,
`agent-skills:deprecation-and-migration`, `agent-skills:spec-driven-development`, `agent-skills:planning-and-task-breakdown`,
`engineering:testing-strategy`, `superpowers:verification-before-completion`.

**Lỗi:** mục 17 để `cost_centers.department_id`/`linked_at` NULL **vĩnh viễn** cho Cost Center chưa từng gắn phòng (spec A, L.10), test matrix chấp
nhận Cost Center tự do trên schema cuối và báo cáo gọi đó là điều Owner xem lại. Nguồn pin `e0cb5a0`, `Decisions/project-decisions.md` `QĐ-87d`(1):
Finance tạo Cost Center `Unit` **cho** một Department đã có; _"mỗi Cost Center thuộc **đúng một** Department suốt vòng đời, không chuyển sang phòng
khác"_. Department được thiếu Cost Center; chiều ngược lại không phải trạng thái nghiệp vụ cuối hợp lệ.

**Chứng minh một image không đủ cho hai cửa sổ H7** (đọc mã `7c28e75`, chỉ đọc — [spec L.11](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04)):

- `7c28e75` không đọc được phòng thiếu Cost Center: `department.repo.ts:36` inner join `cost_centers c ON c.id = d.cost_center_id` (phòng biến khỏi
  danh sách, chi tiết 404), `department.dto.ts:56` bắt buộc `costCenter`, `organization.prisma:144` `costCenterId String` không null,
  `import-lookup.repo.ts:28` inner join, `access-request.service.ts:100` dùng `unit.costCenter.id`. `7c28e75` không đổi Cost Center của phòng
  (`department.dto.ts:19`) và không kích hoạt lại Cost Center.
- Cửa sổ 1 (deploy bản tương thích lỗi ⟹ H7 dựng lại `7c28e75` trên CSDL đã migrate, `deploy-release.sh` `recover()`): image ứng viên đã nhận traffic
  không được ghi phòng thiếu Cost Center. Cửa sổ 2 (deploy bản cuối lỗi ⟹ dựng lại image tương thích trên schema đã thu hẹp): image tương thích
  phải tạo phòng không Cost Center — đường tạo phòng duy nhất khi Cost Center tự do bị cấm.
- Tạo phòng trong cửa sổ 1 chỉ còn: từ chối; ghi dòng `7c28e75` không đọc được; hoặc Cost Center trước phòng (trái `QĐ-87d`). Bật theo schema bế
  tắc: Cost Center chưa có phòng hợp lệ cần Super Admin tạo phòng trước, mà bản cuối bị chặn tới khi liên kết xong.

**Quyết định Owner (27/10/2026, hỏi trong phiên Prompt 03):** chọn _bước kích hoạt_ (khuyến nghị) — vẫn một bản tương thích, một điểm dừng
`expansion-ready-owner-action`, thêm một bước của operator trong Task 1.2b; phương án _deploy boundary thứ hai_ bị loại. Đây là duyệt cơ chế
rollout theo yêu cầu của prompt, không phải disposition nghiệp vụ mới.

**Sửa** ([spec A, L.10, L.11, K](../../workspace/items/g0-g6-final-business-baseline-remediation/spec.md#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04); [plan](../../workspace/items/g0-g6-final-business-baseline-remediation/plan.md#task-11a-bản-tương-thích--liên-kết-cost-center--phòng-cost-center-luôn-có-phòng-bước-kích-hoạt-f01-review-p03-rv-03-p03-rv-04)):

| Ranh giới                  | Nội dung                                                                                                                                                                                                                                                                               | Chủ                    | Task                   | Test                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Bản tương thích (F01)      | liên kết NULL chuyển tiếp + trigger đồng bộ + `cost_centers_department_link_once`; bảng `cost_center_department_links`, `cost_center_direction_activations`; `costCenterCreate`/`departmentCreate` contract cuối (409 trước kích hoạt); lệnh `ops:cost-center-direction`; kiểm kê sống | `organization` (agent) | 1.1a; Checkpoint E     | P1 F01 (bản tương thích, cửa sổ 1, `activate`, `link`, đua); diễn tập bước 3             |
| Bước kích hoạt và liên kết | sau khi H7 báo sẵn sàng: `activate`; Super Admin tạo phòng thật nếu thiếu; Finance phê duyệt `link` từng Cost Center theo căn cứ; mọi cổng `READY` khi bản tương thích đang chạy                                                                                                       | Owner/operator         | 1.2b                   | P1 F01 (`activate`, `link`, preflight `BLOCKED`); diễn tập bước 3, 7                     |
| Bản cuối (F01)             | `DO $$` trước mọi ghi, `SET NOT NULL`, bỏ cột/trigger cũ; image tương thích tạo phòng/Cost Center sau mỗi migration và sau phục hồi H7                                                                                                                                                 | `organization` (agent) | 1.1, 2.2; Checkpoint 1 | P1 F01 (migration thu hẹp, cửa sổ 2, CSDL trống, đối chứng); P2 F01; diễn tập bước 4 → 8 |

**Thứ tự phase F01 trước → sau:**

- Trước (`P03-RV-03`): Task 1.1a (liên kết nullable + đồng bộ; bản tương thích giữ luật `7c28e75`: `departmentCreate` gắn Cost Center tự do,
  `costCenterCreate` tự do) → Checkpoint E → Task 1.2b (không có bước F01) → P1 Task 1.1 (chép nốt liên kết, bỏ cột cũ, `department_id` nullable
  vĩnh viễn cho dòng chưa từng gắn phòng) → P2 Task 2.2 (`costCenterCreate` + `departmentId`, `departmentCreate` bỏ `costCenterId`).
- Sau: Task 1.1a (liên kết nullable chuyển tiếp + đồng bộ + link-once; hai bảng; `costCenterCreate`/`departmentCreate` contract cuối, 409 trước
  kích hoạt; lệnh `ops:cost-center-direction`; kiểm kê sống) → Checkpoint E (dừng một lần) → Task 1.2b (deploy → H7 sẵn sàng → `activate` → Super
  Admin tạo phòng thiếu → Finance `link` từng ID → gán thuê bao, dọn L.4 → `READY`) → P1 Task 1.2c (B) → Task 1.1 (`RAISE` trước mọi ghi, `SET NOT
NULL`, bỏ cột/trigger cũ) → P2 Task 2.2 (bỏ cổng kích hoạt ở bản cuối, các ghi tổ chức còn lại).

**Cơ chế chuyển tiếp:** migration của bản tương thích chỉ cộng thêm/nới — `cost_centers.department_id`/`linked_at` nullable chỉ cho dòng `7c28e75`
ghi; trigger tiến gắn Cost Center khi `7c28e75` tạo phòng; trigger ngược giữ _mọi Cost Center `ACTIVE` có phòng là cột cũ của phòng đó_ nên
`7c28e75` không coi nó là tự do và đọc phòng với Cost Center hiện hành; `cost_centers_department_link_once` chỉ chặn đổi/xóa liên kết đã có (không
ghi nào của `7c28e75`). Bản tương thích không có đường tạo Cost Center thiếu phòng; `departmentCreate` 409 tới khi tổ chức có dòng kích hoạt.

**Hợp đồng preflight/resolution:** kiểm kê sống (probe trước, tính lại mỗi lần, chỉ ID) `COST_CENTER_UNLINKED` cho mọi `department_id IS NULL` —
gồm dòng `7c28e75` tạo sau migration hay sau phục hồi; `COST_CENTER_LINK_MISMATCH` (lưới an toàn); `COST_CENTER_DIRECTION_NOT_ACTIVATED` (bản cuối
`BLOCKED`); `COST_CENTER_DIRECTION_EXPANSION_REQUIRED` cho CSDL bỏ qua bản tương thích. Resolution duy nhất: `pnpm ops:cost-center-direction link`
(capability `organization/cost-center-direction`; một Cost Center mỗi lần; Finance phê duyệt; căn cứ có thẩm quyền; tách người ở `SHARED`; một giao
dịch, khóa phòng rồi Cost Center; Audit `OPERATOR`; đầu ra chỉ UUID; mã thoát 0/2/1; không suy diễn, không mặc định, không hàng loạt, không tự
ngừng/xóa; thiếu phòng ⟹ Super Admin tạo phòng thật trước). Migration thu hẹp `RAISE` chỉ ID trước mọi ghi khi còn cổng, rồi `SET NOT NULL`, rồi
mới bỏ liên kết phía phòng.

**Trước → sau (câu chữ):**

- Spec A: _"`linked_at` cùng có hoặc cùng NULL; NULL **chỉ** ở dòng chưa từng gắn phòng của dữ liệu trước bản cuối"_ → _"bản cuối
  `cost_centers.department_id` và `linked_at` **NOT NULL** … không Cost Center nào ở schema cuối thiếu phòng"_.
- Spec L.10 dòng F01: cột bản cuối _"`cost_centers.department_id` **giữ nullable chỉ cho dòng chưa từng gắn phòng**"_ → _"`RAISE` … rồi
  `department_id`, `linked_at` `SET NOT NULL` … Không Cost Center nào thiếu phòng"_; cột chuyển ứng dụng _"giữ luật `7c28e75`: `departmentCreate`
  gắn một Cost Center `UNIT` tự do, `costCenterCreate` tạo Cost Center tự do"_ → contract cuối; đoạn _Không cần điểm dừng thứ hai_ → _Số ranh giới
  deploy_; bất biến 1, 4 và giới hạn (a), (d); mục L.11 mới; mục K dòng F01.
- Test matrix: _"Cost Center tự do hợp lệ (`department_id`, `linked_at` cùng NULL)"_ → _"201 phòng `costCenter: null`; 201 Cost Center có
  `departmentId`"_; Phase 1 F01 từ 5 lên 12 dòng (cửa sổ 1, `activate`, `link`, đua, preflight `BLOCKED`, migration thu hẹp, cửa sổ 2, CSDL trống,
  đối chứng gài lỗi); diễn tập bước 2, 3, 4, 6, 7, 8.
- Plan: Task 1.1a, 1.1, 1.2b, 2.2, 2.3, Checkpoint E, Checkpoint 1, bảng _Phủ finding_ F01 (`1.1a, 1.2b, 1.1, 2.2`, `P1 F01 ×12`).
- Prompt 04: § 1 cổng F01; § 1A _ranh giới đã chứng minh_, mục _F01 authority_, việc Owner/operator 1 → 9 (thêm 4 kích hoạt, 6 liên kết),
  **Forbidden** thêm; lựa chọn đã chốt; § 3 bước 5.

**Giới hạn còn lại (thật):** trước kích hoạt không tạo được phòng (409 có biên, Owner chấp nhận); kích hoạt không hoàn tác — sau đó rollback có chủ
đích về `7c28e75` là đường khẩn cấp (`pg_dump`); `activate` không tự kiểm được trạng thái host — operator xác nhận H7 đã báo sẵn sàng, bằng chứng ở
Audit và tracker; bảng kích hoạt ở lại bản cuối tới khi image tương thích hết là đích phục hồi (bỏ là việc sau, ngoài gói).

**Trạng thái:** `planning-closed-local` / `ready-for-owner-commit`. `P03-RV-01` → `P03-RV-04` đều đóng.

### 18.1 Kiểm chứng

| Kiểm                                                                                             | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nguồn quyết định (đọc nguyên văn ở pin)                                                          | `git -C Docs show e0cb5a0:Decisions/project-decisions.md`, dòng `QĐ-87d`: _"Super Admin tạo Department **trước**; Finance tạo Cost Center `Unit` **cho** một Department đã có … mỗi Cost Center thuộc **đúng một** Department suốt vòng đời, không chuyển sang phòng khác"_; Docs `main = origin/main = e0cb5a0`                                                                                                                                                                                                                                                          |
| Nguồn mã `7c28e75` (chỉ đọc)                                                                     | `department.repo.ts:36` inner join phòng–Cost Center; `department.dto.ts:15,19,56` (`costCenterId` bắt buộc khi tạo, không sửa được, `costCenter` bắt buộc khi đọc); `organization.prisma:144`; `import-lookup.repo.ts:28`; `access-request.service.ts:100`; `cost-center.service.ts` không có kích hoạt lại; `departments.controller.ts` `departmentCreate` chỉ `IT_ADMIN`; `deploy-release.sh` preflight chạy bằng image ứng viên, `recover()` dựng lại image trước                                                                                                     |
| Quyết định Owner                                                                                 | hỏi trong phiên: _Activation step (Recommended)_ được chọn; _Extra deploy boundary_ và _Stop_ không chọn                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm rules:check`                                                                               | exit 0 — `BE: 287 files, 2461 links, 0 errors`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Kiểm neo độc lập (`anchor_check.py`)                                                             | 290 liên kết `#…`, 0 thiếu (gồm neo spec L.11, plan Task 1.1a, mục 18)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Kiểm bảng (`table_check.py`)                                                                     | 72 bảng trong 10 tệp chạm: 0 dòng lệch số ô do lượt này (một dòng ghi chú một ô có sẵn từ `HEAD` ở items index) — sau khi sửa một lỗi thật: tên lệnh viết với dấu gạch đứng giữa hai mode nằm trong ô bảng bị Prettier tách thành cột mới, nay viết `` `ops:cost-center-direction` (`activate`, `link`) ``                                                                                                                                                                                                                                                                |
| `pnpm rules:format`; Prettier trên mọi tệp chạm                                                  | exit 0; 7 tệp BE và 3 tệp thư mục prompt bằng `.prettierrc` của BE; kiểu xuống dòng CRLF của từng tệp giữ nguyên                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `git diff --check`; `git diff --cached --check`                                                  | exit 0; exit 0; index rỗng, 0 stash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Phủ finding (`coverage_check.py`) + đối chứng                                                    | 67 finding, 67 dòng (fix 58, deferred 5, documentation-only 2, out-of-scope 1, Docs-owned 1), 0 lỗi — `P1 F01 ×12` khớp 12 dòng F01 Phase 1; đối chứng bị bắt                                                                                                                                                                                                                                                                                                                                                                                                             |
| Đóng disposition (`disposition_check.py`) + đối chứng                                            | 9/9 mục chặn = A có ngày, 0 lỗi (lỗi trạng thái tracker do Owner mở `P03-RV-04` trước lượt đã hết); đối chứng bị bắt                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Rollout/authority (`rollout_check_rv04.py`, mới — thay `rollout_check_rv03.py`, giữ mọi kiểm cũ) | đọc `QĐ-87d`(1) từ pin bằng `git show`; cấm mọi câu _NULL chỉ ở dòng chưa từng gắn phòng_, _giữ nullable_, Cost Center tự do ở bản tương thích/bản cuối, _never linked may stay_; kiểm spec A, L.10 (bảng 9 dòng, ô tách theo dấu gạch đứng chưa thoát), L.11, K F01; plan Task 1.1a/1.1/1.2b/Checkpoint E, phụ thuộc Task 1.1 → 1.1a, 1.2b, 1.2c; test matrix 12 dòng F01 và diễn tập 2 → 8; Prompt 04 (một điểm dừng, một bước kích hoạt, không deploy boundary thứ hai, việc 1 → 9); báo cáo mục 17/18; tracker `P03-RV-01` → `P03-RV-04` mỗi mã một dòng đóng — 0 lỗi |
| Hai mươi sáu đối chứng của rollout/authority                                                     | 26/26 bị bắt: mười sáu của `P03-RV-01` → `03` và mười của `P03-RV-04` — cột cuối nullable lại, chấp nhận Cost Center tự do ở bản cuối, bỏ dòng muộn khỏi kiểm kê, suy diễn phòng/hàng loạt, phục hồi F01 chỉ kiểm health, nguồn `QĐ-87d` bị nới (_tối đa một_), câu _NULL chỉ ở dòng chưa từng gắn phòng_ quay lại, deploy boundary thứ hai ẩn, kích hoạt trước khi H7 báo sẵn sàng, tracker `P03-RV-04` mở; 0 bản sao tạm sót                                                                                                                                            |
| Cây BE và hash                                                                                   | `HEAD = dev = origin/dev = 7c28e75`, 0/0; 58 path (53 sửa + 5 mới) — danh sách trùng từng dòng với preflight, 0 path ngoài `docs/`; 7 path đổi hash (spec, plan, test matrix, impact matrix, báo cáo, roadmap, items index), 51 path trùng byte                                                                                                                                                                                                                                                                                                                           |
| Thư mục prompt                                                                                   | 3 tệp đổi (Prompt 04, tracker, README); Prompt 03 và các prompt sửa review, `tasks/*` không chạm                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Docs                                                                                             | `main = origin/main = e0cb5a0`; hai tệp sơ đồ bẩn từ trước lượt này — không do lượt này, không đọc-ghi, không hoàn tác                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Không chạy                                                                                       | unit, e2e, integration, OpenAPI export, Docker smoke, diễn tập migration thật (lượt chỉ lập kế hoạch/tài liệu)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
