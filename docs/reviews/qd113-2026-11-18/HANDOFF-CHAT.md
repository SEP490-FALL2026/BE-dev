# HANDOFF — chat điều phối QĐ-113 (18/11/2026, tối)

## 1. Trạng thái

| Hạng mục | Ở đâu | Trạng thái |
| --- | --- | --- |
| Quyết định | Docs `Decisions/project-decisions.md` `QĐ-113a` → `QĐ-113g`, BRD 4.14 | Docs `main` commit `65fccd1`, `cc7e3fe`, `bfe96ac`, `86bc4f6`, `cdc2d2f` — **chưa push** |
| Code BE-WDP | `Code/BE-WDP` nhánh `feat/qd113` @`96595331` (đã push origin WDP301-FA26-GR8/BE) | **CI run 44335381755 xanh toàn bộ** (8 lượt) |
| Code BE đồ án | `Code/BE-dev-software-license-management` nhánh `feat/qd113` @`3cbb2673` | Chép từ WDP (diff + sửa tay 2 file gate/doc); kiểm nhanh local xanh (typecheck, arch, gates 335, rules, http platform 190). **Không chạy CI theo Owner. Chưa push.** Stash cũ "qd113 P1 WIP moved to BE-WDP" có thể bỏ |
| Tài liệu API FE | Docs `Figma UI-UX/API-Integration` commit `987f90a`, `8865881`; `changes/2026-11-18-qd113.md#fe-man-can-sua` | Chưa push |
| Sổ tay | `NOTE MD/mainflows.md` (đồng bộ tới QĐ-113, bảng hóa đơn ở SBF-19) | Không trong git |
| File duyệt QĐ | `NOTE MD/QD-cho-duyet-truoc-prompt4.md` | Phần 1 = QĐ-113 (xong). Phần 2 = ~90 mục chờ Owner của Prompt 1/2/3/5 + seed, 12 mục "Owner đã chọn chưa ghi QĐ" |
| Deploy WDP | Owner đang làm | Bước 1 (drop DB + migrate + reconcile bằng image cũ) đã chạy; chờ kiểm `200`/`0` rồi merge `feat/qd113` → `dev` → `main` (CI tự deploy) → `seed.sh` → `--continue` ra exit 2 |
| Worktree tạm | `Code/BE-WDP-wt/p2`, `p34`, `p6`, `p7`, `p8` | Đã gộp vào `feat/qd113` — xóa được (`git worktree remove`) |

## 2. Nội dung QĐ-113 (đã code)

- a: gói `K1`/`K2`/`K4` có giá tham chiếu VND chưa thuế (>0, không bắt buộc); Request tính giá **thuê bao trước**, gói chưa có thuê bao có giá ⟹ giá tham chiếu; `priceSource` trên Request; case B chép báo giá đã duyệt (K1/K2). Giá tham chiếu không dùng cho chi phí seat, điểm điều chỉnh, hóa đơn, tiết kiệm.
- b: mỗi loại seat (Claude Team Standard/Premium) = một gói + một workspace; hóa đơn tách theo workspace (chỉ seed).
- c: ảnh đại diện phòng tải lên R2 (`PUT/DELETE /departments/:id/avatar`, `avatarUrl`). Ảnh cũ xóa sau commit, lỗi chỉ log (chấp nhận, D-1).
- d: người yêu cầu chỉ rút trước quyết định đầu tiên (`WITHDRAWAL_AFTER_DECISION` + `details.scope`); trưởng phòng rút Request bị chặn/chờ dự phòng; Request nhóm của trưởng phòng coi như chưa quyết tới khi Người duyệt chi quyết.
- e: `PATCH /employees/:id/first-placement` — sửa phòng/ngày lần xếp đầu khi còn ở tương lai và chưa dùng; trigger DB chỉ nới cho ca đó.
- f: `K1` giữ một bản ghi thuê bao (giá/chu kỳ), mỗi người một quyền.
- g: thuê bao **không có phòng đứng tên** — cột/trigger/bảng gán/CLI `ops:assign-subscription-owner` bị xóa (migration `20261118130000`); gia hạn giao IT Admin phụ trách thuê bao (không dùng được ⟹ IT Admin khác theo mã); danh sách gia hạn: IT Admin (`mine=true`) + Finance, **trưởng phòng 403** (Owner OK); IT Admin nào cũng nộp hóa đơn kỳ thuê bao; dashboard "kỳ chưa có hóa đơn" chỉ thuê bao mình phụ trách.
- Thêm (kỹ thuật): `PATCH /subscriptions/:id` `expectedUpdatedAt` ⟹ 409 `SUBSCRIPTION.STALE`; cấp quyền sang kỳ sau của kho chung hết seat ⟹ tự mua seat kỳ sau.
- Hai vai IT Admin: phụ trách **phòng** (cấp/thu hồi, mua thêm seat khi kho hết + hóa đơn lần mua, `K1` mua/hóa đơn tháng/hủy gia hạn) và phụ trách **thuê bao** (gia hạn, điều chỉnh seat, hóa đơn gia hạn, workspace). Mọi hóa đơn nộp Finance.

## 3. Việc còn lại

1. Hỗ trợ Owner deploy WDP (lệnh ở `docs/guides/seed.md` phần "Dựng lại VPS", đã gửi Owner). Lỗi seed ⟹ đọc `seed-reports/`.
2. FE sửa màn theo `changes/2026-11-18-qd113.md#fe-man-can-sua` (form mua thuê bao, dialog cấp phát, chi tiết thuê bao Finance, gia hạn Finance/IT, bỏ màn gia hạn của trưởng phòng, hộp lỗi ngừng phòng, dashboard IT, sinh lại client mobile).
3. Owner duyệt Phần 2 của `NOTE MD/QD-cho-duyet-truoc-prompt4.md` + câu mở: quyền `K1` kết thúc có giảm số lượng bản ghi `K1` không ⟹ ghi `QĐ-114`.
4. Prompt 4 (4a audit Fable read-only toàn flow + 4b FIX Sonnet + DEMO) và đợt đồng bộ tài liệu (US, Use Case, ERD, State Machine, sơ đồ MF-1/SBF-01/01a/15/17/19/20, Quy trình 1.10, Định nghĩa phạm vi) theo QĐ-113 + QĐ-114.
5. Push Docs `main` và nhánh BE đồ án khi Owner bảo; xóa worktree tạm.

## 4. Quy ước làm việc (Owner)

Trả lời tiếng Việt; Skill Preflight đầu mỗi prompt. Code = Sonnet (subagent), review/verify = Opus. Test ở máy chỉ bộ nhanh không cần DB;
http/integration/e2e/seed chạy CI GitHub (`gh workflow run ci.yml --ref <nhánh>`), được push nhánh feature, không push/merge `dev`/`main`.
Commit bằng git identity của Owner, không dòng co-author/attribution. Docs: commit thẳng `main`, không push trừ khi được bảo.
Quyết định nghiệp vụ mới ⟹ hỏi Owner từng câu (AskUserQuestion), ghi vào sổ QĐ khi Owner đồng ý.
