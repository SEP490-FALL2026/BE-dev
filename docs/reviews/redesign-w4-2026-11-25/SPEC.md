# SPEC — Đợt 4 thiết kế lại: phiếu nhiều mục (25/11/2026, bản 1)

- **Trạng thái:** Proposed **bản 1** — chờ Owner trả lời [§12](#12-câu-hỏi-owner-oq-w4-n) và duyệt SPEC/PLAN. Sonnet/Gemini chỉ code khi Owner đã duyệt
  **và** đợt 3 đã vào `dev` **và** đã có `DELTA-W3-FINAL.md` (PLAN — _Nền và nhánh_).
- **Nền đọc code:** `origin/int/redesign-w3` `444e6fc3` (= `dev` có đợt 1 + đợt 2 + **B1 của đợt 3**, P1–P8 xong). Đợt 3 còn P10 → P23 (B2, B3) đang
  làm và **cũng sửa module `requests`** (giá Request, cấp, giải phóng seat, `K1`, `K4`). Đợt 4 **dựa trên đợt 3 hoàn tất**; mọi `file:line` dưới đây
  đọc trên `444e6fc3`, người code xác nhận lại sau delta check ([§10](#10-phụ-thuộc-đợt-3-và-delta-check)).
- **Nguồn (thứ tự thẩm quyền):** (1) sổ QĐ `Docs/Decisions/project-decisions.md` tới `QĐ-119e` — chính: `QĐ-115aa`, `QĐ-115ab`, `QĐ-115ac`,
  `QĐ-115ad`, `QĐ-116e`, `QĐ-116az`, `QĐ-117k`, `QĐ-114q`, `QĐ-116f`, `QĐ-113d`, `QĐ-116b`, `QĐ-116c`, `QĐ-118o`, `QĐ-110i`, `QĐ-111aq`,
  `QĐ-114b`, `QĐ-82j`, `QĐ-82l`(16), `QĐ-61b`, `QĐ-104b`, `QĐ-106g`, `QĐ-118d`; ranh giới đợt 5: `QĐ-115aj`, `QĐ-116a`, `QĐ-116ab`, `QĐ-117d`,
  `QĐ-118a`; cắt/hoãn: `QĐ-118c`; (2) sổ phiên `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` (W3 B-gọn, W1-Q3, CUT-7); (3) BRD (`FR-3.2`,
  `FR-3.20`, `FR-3.21`, `FR-11.2`), _Quy trình và chính sách theo main flow_ (`MF-1`), User Stories `EP-05` (`US-05-04` AC-23, `US-05-08` AC-12 →
  AC-16, `US-05-22` AC-13, `US-05-25` AC-1 → AC-10), `EP-06` (`US-06-01` AC-35, AC-36, `US-06-14` AC-23, AC-24), `EP-16`; (4) research
  `W3-request-nhieu-goi.md`, `V3-verify-W4b-W3.md`, `AUDIT-B-request-duyet-ai-quyen.md` (chỉ đề xuất — chỗ chưa thành QĐ ghi rõ); (5) code `444e6fc3`;
  (6) mẫu `docs/reviews/redesign-w3-2026-11-22/` (SPEC/PLAN bản 2.4, CODE-PROMPT) và `redesign-w2-2026-11-22/FIX-PLAN-W2.md` (lỗi hay gặp).
- **Phân đợt:** `redesign-w1-2026-11-22/SPEC.md` §2.2 dòng 45: "Phiếu nhiều mục; ghi chú bắt buộc khi gửi lại (FIX-PL2-Q3, `QĐ-114q`, P-1) | Đợt 4";
  dòng 46: "AI W4c … | Đợt 5". `QĐ-118a` giữ "đối chiếu chính sách và xác nhận lần hai (`QĐ-116a`, `QĐ-115aj`)" trong **đợt 5**.
- **Cách kiểm:** tác giả đọc code bằng `Read`/`grep` trên worktree `444e6fc3` (chỉ đọc), không chạy test/build/DB. `file:line` tính từ
  `src/modules/` nếu không ghi khác. Chỗ tác giả tự chốt ghi **Tự chốt** + căn cứ ([§14](#14-tự-chốt-theo-nguồn)). Luật nghiệp vụ chưa có QĐ
  **không** tự quyết — thành câu `OQ-W4-n`.

## Mục lục

| Tệp                              | Nội dung                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [SPEC.md](SPEC.md)               | Mục tiêu, phạm vi, mục W4-xx, dữ liệu + migration, kiến trúc, thứ tự khóa, hành vi đúng, API, tác động, test, OQ |
| [PLAN.md](PLAN.md)               | Gói, hai làn song song, cửa C1/C2, file từng gói, tự kiểm chéo, lệnh kiểm, điều kiện xong                       |
| [CODE-PROMPT.md](CODE-PROMPT.md) | Prompt dán sẵn cho người code (Sonnet/Gemini, Neon), LUẬT CỨNG, Skill Preflight, điều kiện DỪNG                |

## 1. Mục tiêu

Người mới vào cần nhiều phần mềm một lúc. Đợt này cho người xin gửi **một phiếu** gồm tối đa **6 mục**, mỗi mục là **một Request hiện có** (phương án
B-gọn, `QĐ-115aa`): ngân sách, khoản cam kết, cấp phát, `KPI-2`, bản ghi phê duyệt và Audit Trail **vẫn theo từng Request**; phiếu chỉ là vỏ bọc,
trạng thái phiếu suy từ các mục. Kèm theo: trưởng phòng / Người duyệt chi **quyết nhiều mục của cùng phiếu trong một lần** với **một** checklist
(`QĐ-115ab`, `QĐ-116e`); rút cả phiếu hoặc từng mục (`QĐ-115ac`); kiểm ngân sách **theo thứ tự mục** (`QĐ-116az`(2), `QĐ-117k`); **ghi chú trả lời
bắt buộc khi gửi lại** sau _Trả về_ cho mọi Request (`QĐ-114q`, `QĐ-116az`(3), `QĐ-116f`).

**Thành công** khi: mỗi mục W4-xx có test chứng minh tiêu chí (unit đỏ trước; integration/http **chạy thật** trên Docker của làn `tech` hoặc CI
GitHub, không viết mù); Request đơn lẻ, Request nhóm, lô chi không đổi hành vi (trừ chỗ ghi **Phá vỡ** ở [§8.2](#82-operation-đổi)); bộ kiểm nhanh
xanh từng gói; CI GitHub full xanh trên `int/redesign-w4` (trừ dòng `FIX-TEST-*.md`); `prisma migrate diff` không drift.

## 2. Phạm vi

### 2.1. Trong phạm vi

Bảng [§3](#3-bảng-mục-w4-xx).

### 2.2. Ngoài phạm vi

| Việc                                                                                                                         | Đợt / lý do                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Xác nhận lần hai** khi trả lời _Có_ trái kết quả hệ thống kiểm (`QĐ-115aj`), đối chiếu câu có luật dữ liệu `1.2-08`/`1.7-08` (`QĐ-116a`), _x/y_ (`QĐ-117d`), mobile hiện cặp lệch (`QĐ-116ab`), cờ cho Finance (`QĐ-116aa`) | **Đợt 5** (`QĐ-118a` giữ trong đợt 5). Ranh giới: [§7.13](#713-ranh-giới-với-đợt-5-xác-nhận-lần-hai-ai) |
| Phân tích AI phiếu nhiều gói (so hai lý do — `QĐ-115ae`(4), `QĐ-115al`), giới hạn 6 Request mỗi lần gọi model                | Đợt 5                                                                                        |
| Request tiếp tục nhóm; **tách dòng** Request nhóm của người vừa thành trưởng phòng (`QĐ-118c`(1)(2), `QĐ-118o`)              | **Bỏ** ở đợt 7 (`QĐ-118c`) — dòng ở lại Request nhóm như hiện có                             |
| Case B, Request tiếp tục, Request nhóm, `K5` trong phiếu                                                                     | Không vào phiếu (`QĐ-115aa`, `QĐ-115ad`) — gửi riêng như hiện có                             |
| Thay lô của trưởng phòng bằng phiếu ở bước duyệt chi (Request hai bước vẫn theo lô)                                          | `US-05-25` _Out of scope_; `US-06-14`                                                        |
| Phiếu nháp; route kiểm trước phiếu (`/request-tickets/check`); mobile gửi phiếu                                              | Không có QĐ (V3:259 chỉ đề xuất); `US-05-25` _Kênh: Web_, _Out of scope_ "mobile gửi phiếu" |
| Nút _Chọn tất cả thứ tôi chưa có_ (W3-Q8); đổi tên nút _Hỏi người xin_ → _Hỏi trưởng phòng_, câu hỏi điền sẵn                 | FE (BE không đổi: _Trả về_ ở 1.7 đã về hàng đợi trình của trưởng phòng)                      |
| Dọn cột chết `access_requests.delegated_batch_id`                                                                            | Không đụng (không dùng lại cho phiếu — **Tự chốt** T-W4-1)                                    |
| Sửa User Stories/BRD/sơ đồ                                                                                                   | Docs, ngoài repo BE                                                                          |

### 2.3. Giả định

1. Đợt 3 (B1 + B2 + B3) đã squash vào `dev` khi tách `int/redesign-w4`; mọi luật giá/kho của đợt 3 áp cho từng mục **qua đường gửi Request đơn
   hiện có** (`RequestFactsService.assess`), đợt 4 không viết lại luật tiền.
2. Một mục = một dòng `access_requests` `type = GRANT`, `branch = PAID_IN_CATALOG`, một người thụ hưởng (chính người xin) — cùng hình dạng Request
   đơn do `POST /access-requests` tạo.
3. Dữ liệu demo dựng lại bằng seed sau đợt; migration chạy được trên DB demo (bảng mới, cột nullable — không backfill).

## 3. Bảng mục W4-xx

| Mục   | Nội dung                                                                                                   | Nguồn chính                                                          | Cỡ | Làn  | Gói      |
| ----- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -- | ---- | -------- |
| W4-01 | Dữ liệu phiếu: bảng `request_tickets`, cột `ticket_id`/`ticket_position` trên `access_requests`            | `QĐ-115aa`, `US-05-25` AC-1, AC-4                                    | S  | biz  | B1       |
| W4-02 | Gửi phiếu: kiểm trước từng mục, tối đa 6, chỉ gói trả phí trong danh mục, trùng gói trong phiếu, GH-1/GH-2 theo mục, có vi phạm ⟹ không gửi mục nào | `QĐ-115aa`, `QĐ-115ac`, `QĐ-116e`, `QĐ-116az`(1), `QĐ-104b`, `QĐ-106g` | M | biz | B2 |
| W4-03 | Phiếu của trưởng phòng: mục một bước, kiểm ngân sách khi gửi theo thứ tự mục, mục bị chặn không phải vi phạm | `QĐ-116e`, `QĐ-116az`(2), `QĐ-117k`(1)                               | S  | biz  | B2       |
| W4-04 | Xem phiếu, trạng thái suy ra; tham chiếu phiếu trên chi tiết Request và các danh sách                       | `QĐ-115aa`, `US-05-25` AC-4                                          | M  | tech | T2       |
| W4-05 | Trưởng phòng quyết nhu cầu nhiều mục cùng phiếu, một checklist cho lần quyết (1.2)                         | `QĐ-115ab`, `US-05-04` AC-23                                         | M  | biz  | B3       |
| W4-06 | Người duyệt chi quyết nhiều mục cùng phiếu (Request một bước), một checklist (1.7)                         | `QĐ-116e`, `QĐ-115ab`, `US-06-01` AC-36                              | M  | biz  | B4       |
| W4-07 | Mục cùng phiếu giữ thứ tự phiếu khi trình lô, khi chuyển một bước vì người xin thành trưởng phòng          | `QĐ-117k`(2)(3), `QĐ-116az`(2), `QĐ-116c`                            | S  | biz  | B4       |
| W4-08 | Rút cả phiếu (từng mục độc lập) và rút từng mục                                                            | `QĐ-115ac`, `QĐ-113d`, `US-05-08` AC-14                              | S  | biz  | B6       |
| W4-09 | Ghi chú trả lời bắt buộc khi người xin gửi lại (mọi Request; mỗi mục một ghi chú)                          | `QĐ-114q`, `QĐ-116az`(3), `US-05-02` AC-24, `US-05-25` AC-10         | M  | biz  | B5       |
| W4-10 | Ghi chú trả lời bắt buộc khi trưởng phòng trình lại Request bị _Trả về_ ở 1.7                              | `QĐ-116f`, `QĐ-114q`, `US-06-14` AC-24                               | S  | biz  | B5       |
| W4-11 | Người quyết thấy ghi chú trả lời mới nhất trên chi tiết Request                                           | `QĐ-114q`, `US-06-01` AC-35                                          | S  | tech | T3       |
| W4-12 | _(chờ OQ-W4-2)_ Trưởng phòng rút mọi Request ở hàng đợi trình, lý do bắt buộc                               | `QĐ-116b`, `US-05-08` AC-15, `US-06-14` AC-23                        | S  | biz  | B6       |
| W4-13 | Mobile: 4 tác vụ với mục của phiếu (test, không route mới)                                                 | `QĐ-61b`, `QĐ-82l`(16), `QĐ-116ab`                                   | S  | tech | T4       |
| W4-14 | Ca biên tổ chức: người xin vừa thành trưởng phòng, phòng không có trưởng phòng, IT phụ trách (QĐ-118)       | `QĐ-116c`, `QĐ-110i`, `QĐ-118d`                                      | S  | biz+tech | B4, T4 |
| W4-15 | Seed phiếu demo                                                                                            | `US-05-25` TS-1, TS-6                                                | S  | tech | T5       |
| W4-16 | Chốt đợt: generator, module card, bảng khóa (ngoại lệ E5)                                                   | `database-business.md`                                               | S  | mỗi làn | B7, T6 |

Tổng: **16 mục**. Chi tiết hành vi ở [§7](#7-hành-vi-đúng).

## 4. Từ vựng

| Từ                    | Nghĩa (wire / code)                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| _Phiếu_               | `request ticket` · bảng `request_tickets` · vỏ bọc, **không** có số tiền, quyết định hay trạng thái lưu riêng           |
| _Mục_                 | `ticket item` = một Request (`access_requests`) có `ticket_id`; vị trí `ticketPosition` 1…6 theo thứ tự người xin chọn   |
| _Lần quyết_           | một lần gọi route quyết nhiều mục: một checklist được chấm một lần, ghi **một bản cho từng mục** đã quyết               |
| _Ghi chú trả lời_     | `reply note` · bảng `access_request_replies` · chữ thuần 1…1000 ký tự, lưu kèm lần gửi lại / trình lại                   |
| _Vi phạm của mục_     | lỗi mà Request đơn sẽ bị **từ chối** khi gửi (GH-1, GH-2, đã giữ quyền, gói không hợp lệ, thời gian dùng…) ⟹ cả phiếu không gửi |
| _Kết cục của mục_     | điều Request đơn **vẫn được tạo** (bị chặn ngân sách, thiếu giá ở Request một bước, đứng chờ trưởng phòng) ⟹ mục vẫn tạo |

## 5. Mô hình dữ liệu mới và migration

Migration cuối trên `dev` sau đợt 3 dự kiến là `20261203000300_w3_personal_rights_allocations`. Đợt 4 dùng dải **`20261210…`** (luôn lớn hơn,
`DB-15`); chỉ làn `biz` viết migration. Lúc merge `dev` có migration số ≥ dải ⟹ đổi tên (chỉ khi chưa deploy).

| #  | Migration                                    | Bảng/cột                                                                                                                                         | Hoàn tác được? | Rủi ro dữ liệu |
| -- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------- |
| M1 | `20261210000000_w4_request_tickets`          | `request_tickets`; `access_requests.ticket_id`, `ticket_position` + CHECK + unique + index + trigger bất biến                                    | Có (drop)      | Không (nullable, không backfill) |
| M2 | `20261210000100_w4_access_request_replies`   | enum `AccessRequestReplyKind`; bảng `access_request_replies` chỉ ghi thêm (trigger), index                                                       | Có (drop)      | Không          |

**M1** (`prisma/models/requests.prisma`, model `RequestTicket` + hai trường ở `AccessRequest`; quan hệ ngược ở `organization.prisma`):

```sql
CREATE TABLE request_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  requester_employee_id uuid NOT NULL REFERENCES employees(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  submitted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_tickets_requester_submitted_idx ON request_tickets (requester_employee_id, submitted_at DESC, id);
ALTER TABLE access_requests ADD COLUMN ticket_id uuid REFERENCES request_tickets(id), ADD COLUMN ticket_position smallint;
ALTER TABLE access_requests ADD CONSTRAINT access_requests_ticket_pair CHECK ((ticket_id IS NULL) = (ticket_position IS NULL)),
  ADD CONSTRAINT access_requests_ticket_position_range CHECK (ticket_position IS NULL OR ticket_position BETWEEN 1 AND 6),
  ADD CONSTRAINT access_requests_ticket_kind CHECK (ticket_id IS NULL OR (type = 'GRANT' AND branch = 'PAID_IN_CATALOG'));
CREATE UNIQUE INDEX access_requests_ticket_position_key ON access_requests (ticket_id, ticket_position) WHERE ticket_id IS NOT NULL;
-- trigger BEFORE UPDATE OF ticket_id, ticket_position: đổi giá trị ⟹ RAISE (mục không rời/đổi phiếu)
```

- Không lưu trạng thái, số mục, số tiền trên phiếu (`QĐ-115aa`: "trạng thái phiếu suy từ các mục"; `US-05-25` AC-4: "không lưu trạng thái riêng").
- Không mã hiển thị phiếu — chờ **OQ-W4-3**. Nếu Owner chọn có mã: thêm cột + sequence ở M1 trước khi đẩy (chưa merge thì sửa được).
- `request_tickets` chỉ **chèn**, không route nào sửa/xóa ⟹ không vào bảng khóa.

**M2** (`QĐ-114q`: "lưu kèm lần gửi lại để người quyết và AI so trước–sau"):

```sql
CREATE TYPE "AccessRequestReplyKind" AS ENUM ('REQUESTER_RESUBMISSION', 'HEAD_RESUBMISSION');
CREATE TABLE access_request_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  request_id uuid NOT NULL REFERENCES access_requests(id),
  kind "AccessRequestReplyKind" NOT NULL,
  returned_step_id uuid NOT NULL REFERENCES access_request_steps(id),  -- bước đã đóng với quyết định RETURNED mà ghi chú trả lời
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  author_employee_id uuid NOT NULL REFERENCES employees(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_request_replies_request_idx ON access_request_replies (request_id, created_at DESC, id);
CREATE UNIQUE INDEX access_request_replies_step_key ON access_request_replies (returned_step_id);  -- một lần trả về, một ghi chú
-- trigger chặn UPDATE/DELETE (chỉ ghi thêm)
```

- Thêm `access_request_replies` vào `RUNTIME_TABLE_EXCEPTIONS` (`src/infrastructure/database/database-role-judgement.ts`) với `SELECT, INSERT`
  nếu gate H7 đòi (tiền lệ `seat_changes`, đợt 3). Migration **không** nêu tên vai DB.
- Comment đầu file ghi SQL đảo; không down migration (`DB-05`). Sau mỗi migration `pnpm prisma:validate && pnpm prisma:generate`.

## 6. Kiến trúc

### 6.1. Capability (module `requests`, theo `docs/rules/module-structure.md`)

| Capability                           | Loại                      | File chính (`m/requests/…`)                                                                                         | Ghi chú |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| **mới** `request-ticket/`            | lõi, không controller     | `request-ticket.repo.ts`, `.types.ts`, `.policy.ts` (+spec), `.errors.ts`, `.http-errors.ts`, `.dto.ts`               | writer duy nhất của `request_tickets`; luật thuần (trần, trùng, GH-2 cộng dồn, thứ tự, trạng thái suy ra) |
| **mới** `request-reply/`             | lõi, không controller     | `request-reply.repo.ts`, `request-reply.types.ts`                                                                   | writer duy nhất của `access_request_replies`; dùng bởi `request-intake`, `spend-submission`, `request-view` |
| **mới** `request-ticket-submission/` | có controller             | `request-tickets.controller.ts`, `request-ticket-submission.service.ts` (+spec), `request-ticket-precheck.service.ts` (+spec), `.mapper.ts` | gọi `request-intake` (không controller — được import) |
| **mới** `request-ticket-view/`       | có controller             | `request-ticket-view.controller.ts`, `request-ticket-view.service.ts` (+spec), `.mapper.ts`, `.dto.ts`                | làn `tech` |
| `need-decision/` (sửa)               | có controller             | **mới** `ticket-need-decisions.controller.ts`, `ticket-need-decision.service.ts` (+spec); `need-decision.service.ts` tách `decideJudged` | cùng capability với `NeedDecisionService` (capability có controller không được capability khác import) |
| `spend-approval/` (sửa)              | có controller             | **mới** `ticket-spend-decisions.controller.ts`, `ticket-spend-decision.service.ts` (+spec), `spend-item-outcome.policy.ts` (+spec) | ánh xạ kết quả từng mục tách khỏi `spend-batch-decision.service.ts` (LUẬT CỨNG 2) |
| `withdraw/` (sửa)                    | có controller             | **mới** `ticket-withdrawals.controller.ts`, `ticket-withdrawal.service.ts` (+spec)                                   | gọi `WithdrawalService` từng mục |
| `request-intake/` (sửa)              | không controller          | `access-request.service.ts` tách _kiểm_ / _ghi_; `request-resubmission.service.ts`; **mới** `request-resubmission.dto.ts` | refactor giữ mọi lần kiểm |
| `spend-submission/` (sửa)            | có controller             | `spend-batch.service.ts`; **mới** `spend-batch-order.policy.ts` (+spec)                                              | thứ tự mục cùng phiếu, ghi chú trình lại |

- Thư mục `access-request/`, `group-request/`, `spend/`, `assessment/` đã đủ **25 file**: chỉ sửa, không thêm file.
- Không cạnh module mới, không extension point mới. Cần cạnh khác ⟹ **dừng hỏi**.
- Không import ngoài `public/` của module khác; mọi đọc trong `runner.run` qua `tx`; một `@Injectable` mỗi file; spec cạnh file.

### 6.2. Thứ tự khóa

Bảng chuẩn ở `docs/rules/database-business.md` mục _Thứ tự khóa chuẩn_ (đợt 3 P23 viết lại bảng gộp — đọc bản sau đợt 3). Đợt 4 **không thêm tầng**:

| Luồng                                  | Đường khóa                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gửi phiếu (một tx)                     | employee `FOR SHARE` (1) → advisory `requests.limits:<emp>` (2) → department `FOR SHARE` (2) → **chèn** `request_tickets` → từng mục theo `ticket_position`: chèn Request, `SpendRoutingService.start` (khóa Request vừa chèn (4), CC-year (10) nếu kiểm ngân sách) |
| Quyết nhiều mục 1.2 / 1.7              | chấm checklist (không khóa) → **mỗi mục một tx** với đường khóa hiện có của quyết lẻ (Request (4) → … → CC-year (10)); không khóa phiếu                                 |
| Rút cả phiếu                           | mỗi mục một tx: tác vụ cấp (3a) → Request (4) như `withdrawal-preconditions.service.ts:41-42`                                                                          |
| Trình lô có mục cùng phiếu             | `lockAll` theo id (4) **không đổi**; chỉ đổi **thứ tự xử lý** sau khi đã giữ khóa                                                                                       |
| Chuyển một bước (người xin thành trưởng phòng) | khóa không đổi; thứ tự kiểm ngân sách các mục cùng phiếu theo `ticket_position`                                                                                 |
| Gửi lại / trình lại kèm ghi chú        | như hiện có (Request (4) trước CC-year (10)); chèn `access_request_replies` không chờ khóa                                                                              |

- **Ngoại lệ E5 (mới, B7 ghi vào rule):** gửi phiếu khóa CC-year (10) khi kiểm mục _k_ rồi mới khóa Request (4) của mục _k+1_. **An toàn** vì Request
  của mục _k+1_ do chính tx chèn, chưa commit, không tx nào khác thấy hay chờ được. Hệ quả: không luồng nào được khóa Request **đã commit** sau CC-year.
- Luồng tranh chấp mới có integration 2 connection, barrier, lặp 20, không `40P01` ([§11.3](#113-đồng-thời)).
- Comment đầu mỗi service mới ghi thứ tự khóa của nó.

## 7. Hành vi đúng

Nhân vật dùng chung (theo `US-05-25`): `E1` nhân viên phòng `P-DES` (Cost Center `CC-DES`); `H1` trưởng phòng `P-DES`; `C1` Người duyệt chi; `IT1`
IT Admin phụ trách `P-DES`; `IT2` IT Admin phụ trách các phòng khác; GH-2 `weeklyLimit` = 10. Mỗi ca là test **bắt buộc**.

### 7.1. W4-01 Dữ liệu phiếu

- **Nguồn:** `QĐ-115aa`; `US-05-25` AC-1, AC-4. **Hiện trạng:** chưa có khái niệm phiếu; `access_requests.plan_id` một gói
  (`prisma/models/requests.prisma:162-283`); `delegated_batch_id` không file nào đọc/ghi.
- **Hành vi đúng:** M1 ở §5. `AccessRequestRecord` (`access-request/access-request.types.ts`) thêm `ticket: { id, position } | null`;
  `AccessRequestRepo.insert` nhận `ticket?: { id, position }` (writer duy nhất giữ nguyên). `RequestTicketRepo`: `insert`, `findById`,
  `itemsOf(ticketId)` (id, position, state, routingMode, planId — một câu, sắp `ticket_position`).
- **Tiêu chí:** (1) integration: CHECK `ticket_pair`, `ticket_position_range`, `ticket_kind` (Request `GROUP_GRANT` có `ticket_id` ⟹ 23514);
  (2) unique `(ticket_id, ticket_position)` ⟹ 23505; (3) trigger: `UPDATE access_requests SET ticket_id = …` ⟹ lỗi; (4) Request đơn cũ `ticket = null`.

### 7.2. W4-02 Gửi phiếu

- **Nguồn:** `QĐ-115aa`, `QĐ-115ac`, `QĐ-116e`, `QĐ-116az`(1), `QĐ-104b`, `QĐ-106g`; `US-05-25` AC-1 → AC-3, AC-5, AC-8; `US-05-22` AC-13.
- **Hiện trạng:** `request-intake/access-request.service.ts:63-136` gửi **một** Request, ném lỗi ở vi phạm đầu tiên (`requireNotHeld`,
  `termRefusal`, `limits.requireForOne`) rồi chèn — muốn "trả lỗi từng mục" cần lượt kiểm trước riêng (V3:209). GH-1/GH-2 ở
  `request-limits/request-limits.policy.ts` (`judgeNewRequestLimits`).
- **Hành vi đúng:**
  1. Route mới `POST /request-tickets`, thân `{ items: [{ planId, businessReason, termMonths? }] }` (mỗi mục cùng trường và cùng ràng buộc của
     `submitBodySchema`, `access-request/access-request.dto.ts:32`; Zod giới hạn kỹ thuật 1…20 mục để có biên).
  2. Lỗi **cấp phiếu** (không gắn mục, cùng mã/status như Request đơn): Super Admin (`ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` 403), bên bị loại
     (`REQUEST_PARTY.INELIGIBLE` 422), chưa xếp phòng / chưa tới ngày bắt đầu (`ACCESS_REQUEST.NO_DEPARTMENT`, `EMPLOYEE.NOT_STARTED` 409), phòng
     không có Cost Center hiện hành (`FINANCE.SETUP_INCOMPLETE`), thân sai (422 `VALIDATION_ERROR` — gồm mục thiếu `businessReason`, path
     `items.<i>.businessReason`), **quá 6 mục** (422 `REQUEST_TICKET.TOO_MANY_ITEMS`, `details: { max: 6, count }`), **dưới số mục tối thiểu** (chờ
     **OQ-W4-1**; nếu B: 422 `REQUEST_TICKET.TOO_FEW_ITEMS`).
  3. **Kiểm trước từng mục** (một tx, sau khóa employee + advisory limits + phòng), theo thứ tự `position` = chỉ số trong `items` + 1. Mỗi mục nhận
     **lý do đầu tiên** theo đúng thứ tự kiểm của Request đơn, thêm hai lý do mới:
     - lỗi của gói do `assess` ném (`PLAN_NOT_FOUND`, `APPLICATION_RETIRED`, `PLAN_BOUND_TO_DEVICE`, `NOT_PRICEABLE` nếu `assess` ném) — giữ mã;
     - **`NOT_PAID_IN_CATALOG`** (mới): `branch ≠ PAID_IN_CATALOG` (gói `K5`/nội bộ miễn phí) — `QĐ-115aa`, `QĐ-115ad`;
     - `ALREADY_HOLDS_ACCESS`; `TERM_*` (`src/core/term-limit.ts`);
     - `OPEN_REQUEST_EXISTS` (GH-1 với Request mở đã có);
     - **`DUPLICATE_IN_TICKET`** (mới, GH-1 trong phiếu): cùng `planId` với một mục đứng trước ⟹ mục sau bị nêu, `details` có `duplicateOfPosition`;
       cùng ứng dụng khác gói (khác loại seat) ⟹ hợp lệ (`QĐ-116az`(1));
     - `OPEN_LIMIT_REACHED` (GH-2 theo mục): mục _i_ bị nêu khi `sentThisWeek + (số mục đứng trước không bị nêu và không miễn) ≥ weeklyLimit`; mục
       miễn (`TRANSFER_GRACE`, `ROLE_ENDED`) không đếm, như Request đơn.
  4. Có **ít nhất một mục bị nêu** ⟹ **không gửi mục nào**, 422 `REQUEST_TICKET.ITEMS_REFUSED`, `details.items: [{ position, planId, reason,
     duplicateOfPosition?, openRequestId?, resetsOn? }]` — liệt kê **mọi** mục bị nêu (như `GROUP_REQUEST.LINES_REFUSED`,
     `group-request/group-request.http-errors.ts:73-76`). Không gì được ghi (tx rollback).
  5. Không mục nào bị nêu ⟹ chèn `request_tickets` (người xin, phòng, `submitted_at`), rồi **từng mục theo `position`**: phần _ghi_ của Request đơn
     (chèn Request với `ticket`, audit `ACCESS_REQUEST.SUBMITTED` + `NEED_STEP_ROUTED`, `SpendRoutingService.start`) — mọi kết cục của Request đơn giữ
     nguyên cho mục (§4 _Kết cục của mục_). Thêm một audit `REQUEST_TICKET.SUBMITTED` (resource `REQUEST_TICKET`, `after: { requestIds, planIds }`) —
     **Tự chốt** T-W4-2.
  6. Trả 201 `{ ticket }` (dạng của `requestTicketGet`, [§8.1](#81-operation-mới)), message `REQUEST_TICKET.SUBMITTED`.
  7. Thông báo: giữ thông báo hiện có **của từng Request** (chờ **OQ-W4-4**).
- **Refactor (LUẬT CỨNG 2):** `AccessRequestService.submitWithin` tách thành `judgeWithin` (trả kết quả kiểm, không ném lỗi của mục) + `writeWithin`
  (ghi); `submitWithin` = judge → ném lỗi đầu tiên như cũ → write. Mọi lần kiểm cũ giữ cùng điều kiện, cùng mã; test cũ xanh không đổi kỳ vọng.
- **Tiêu chí** (`it.each` ở `request-ticket.policy.spec.ts` + integration `request-ticket-submit.integration-spec.ts`):

| Ca | Given                                                                  | When                         | Then                                                                                     |
| -- | ---------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| A  | `E1` chưa giữ gì, tuần đã gửi 0                                         | phiếu Figma Org, Miro Business, Notion Plus | 201; 3 Request `ticketPosition` 1,2,3, mỗi Request bước nhu cầu giao `H1`, phiếu không có số tiền (AC-1) |
| B  | như A                                                                  | 7 mục                        | 422 `REQUEST_TICKET.TOO_MANY_ITEMS` `{max:6,count:7}`, 0 Request; bỏ còn 6 ⟹ 201 (AC-5)   |
| C  | như A                                                                  | mục 2 `businessReason: "  "` | 422 `VALIDATION_ERROR` path `items.1.businessReason`, 0 Request (AC-2)                   |
| D  | gói `K5` nội bộ                                                        | phiếu Figma + gói `K5`       | 422 `ITEMS_REFUSED` `[{position:2, reason:NOT_PAID_IN_CATALOG}]` (AC-3)                   |
| E  | —                                                                      | Figma Org — Full ×2          | 422 `[{position:2, reason:DUPLICATE_IN_TICKET, duplicateOfPosition:1}]` (AC-8)           |
| F  | —                                                                      | Figma Org — Full + Figma Org — Dev | 201, 2 Request (AC-8)                                                             |
| G  | `E1` đã gửi 8 trong tuần, đang giữ Figma                                | Miro, Notion, Figma          | 422 `[{position:3, reason:ALREADY_HOLDS_ACCESS}]`; bỏ Figma ⟹ 201, GH-2 tuần = 10; phiếu 1 mục sau đó ⟹ 422 `[{position:1, reason:OPEN_LIMIT_REACHED}]` (`US-05-22` AC-13) |
| H  | `E1` đã gửi 9                                                          | Miro, Notion                 | 422 `[{position:2, reason:OPEN_LIMIT_REACHED, resetsOn}]` (mục 1 không bị nêu)            |
| I  | `E1` có Request Miro đang chờ                                          | Miro, Notion                 | 422 `[{position:1, reason:OPEN_REQUEST_EXISTS, openRequestId}]`                          |
| J  | Super Admin                                                            | phiếu 2 mục                  | 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`                                          |
| K  | phòng `P-DES` không có Cost Center hiện hành                           | phiếu 2 mục                  | lỗi cấp phiếu `FINANCE.SETUP_INCOMPLETE` (cùng status như Request đơn), 0 Request         |
| L  | `P-DES` không có trưởng phòng (`QĐ-110i`)                              | phiếu 2 mục                  | 201; 2 Request `WAITING_CONTROLLED`, bước nhu cầu `WAITING` `NO_DEPARTMENT_HEAD`           |
| M  | gói `K4` `DEVICE_KEY`                                                   | phiếu Figma + gói đó         | 422 `[{position:2, reason:PLAN_BOUND_TO_DEVICE}]`                                        |

### 7.3. W4-03 Phiếu của trưởng phòng

- **Nguồn:** `QĐ-116e`, `QĐ-116az`(2), `QĐ-117k`(1); `US-05-25` AC-6, AC-9.
- **Hiện trạng:** người xin là trưởng phòng ⟹ `ONE_STEP` `REQUESTER_IS_HEAD` (`access-request/routing.policy.ts:35-45`); kiểm ngân sách ngay khi
  gửi; bị chặn/thiếu giá ⟹ `AWAITING_REQUESTER_REVISION` (`m/requests/README.md:319-321`). Số _Request đang chờ duyệt chi_ đọc từ DB
  (`spend/budget-check.repo.ts:191` `pendingFor`) ⟹ trong cùng tx, mục đã mở bước chi được đếm khi kiểm mục sau.
- **Hành vi đúng:** không luật mới ngoài **thứ tự**: các mục ghi và kiểm **theo `position`** trong một tx (W4-02 bước 5). Mục bị chặn / thiếu giá là
  _kết cục_, không phải vi phạm. Chỉ mục **qua** kiểm tra (trong số cơ sở, hoặc dùng dự phòng — Request một bước sang Người duyệt chi kèm cờ) mới trừ
  vào _còn lại_ cho mục sau; mục bị chặn không trừ (`QĐ-117k`(1)) — đúng theo cách `pendingFor` đếm Request `AWAITING_SPEND_DECISION`.
- **Tiêu chí** (integration `request-ticket-head.integration-spec.ts`; số của `US-05-25` AC-9, dự phòng `CC-DES` = 0):

| Ca | Given (`CC-DES` còn lại năm nay)        | When `H1` gửi                                    | Then                                                                                         |
| -- | --------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| A  | 3.000.000                               | mục 1 Miro 2.000.000, mục 2 Notion 1.500.000      | mục 1 `AWAITING_SPEND_DECISION`; mục 2 `AWAITING_REQUESTER_REVISION` (bị chặn); 201         |
| B  | 3.000.000                               | mục 1 Notion 1.500.000, mục 2 Miro 2.000.000      | mục 1 qua; mục 2 bị chặn (giết đột biến "kiểm theo id/không theo thứ tự")                    |
| C  | 3.500.000                               | Miro 2.000.000, Notion 1.500.000                  | cả hai qua (biên đúng bằng còn lại)                                                          |
| D  | 3.000.000                               | Miro, Notion, mục 3 thiếu lý do                   | 422 `VALIDATION_ERROR`, 0 Request (vi phạm ≠ bị chặn — AC-6)                                 |
| E  | ca A xong; `C1` từ chối mục 1           | —                                                | mục 2 **vẫn** `AWAITING_REQUESTER_REVISION`, không tự kiểm lại (`QĐ-117k`(2))               |

### 7.4. W4-04 Xem phiếu và tham chiếu phiếu

- **Nguồn:** `QĐ-115aa`; `US-05-25` AC-4. V3:243-249 đề xuất 5 nhãn — **chưa thành QĐ**; dùng hai giá trị của `US-05-25` AC-4 (**Tự chốt** T-W4-3).
- **Hành vi đúng:**
  - `GET /request-tickets/{id}`: thấy phiếu khi người gọi xem được **ít nhất một** mục theo `canViewRequest` (`access-request/access-request.policy.ts`);
    không ⟹ 404 `REQUEST_TICKET.NOT_FOUND`. `items` chỉ gồm mục người gọi xem được, sắp `position`; `status` tính trên **mọi** mục:
    `DONE` khi mọi mục ở `ENDED_STATES` (`access-request/access-request.types.ts:273`), ngược lại `IN_PROGRESS`. Không đọc N+1 (một câu join gói).
  - Thêm (chỉ thêm trường) `ticket: { id, position, itemCount } | null` vào: `accessRequestGet`, mục của `GET /me/access-requests`, `GET /need-decisions`,
    `GET /spend-approvals`. `itemCount` = số mục của phiếu.
  - `items` là mảng lồng có biên (≤ 6, CHECK M1): cần mục `NESTED_ARRAYS` `requestTicketGet#items` ở `test/gates/api-collection-contract.gate-spec.ts`
    — **Owner duyệt**; gate từ chối ⟹ dừng hỏi (phương án: subresource phân trang `GET /request-tickets/{id}/items`).
- **Tiêu chí:** (1) `R1` cấp xong, `R2` bị từ chối, `R3` chờ duyệt chi ⟹ `IN_PROGRESS`, 3 mục kèm `state`; `R3` từ chối ⟹ `DONE` (AC-4);
  (2) `IT2` (không xem được mục nào) ⟹ 404; (3) `H1` thấy đủ 3 mục; (4) Request đơn ⟹ `ticket: null` ở cả 4 operation.

### 7.5. W4-05 Trưởng phòng quyết nhu cầu nhiều mục (1.2)

- **Nguồn:** `QĐ-115ab`; `US-05-04` AC-23. **Hiện trạng:** `need-decision/need-decision.service.ts:51-102` quyết **một** Request: khóa, kiểm người
  quyết (`checkNeedDecision`), chấm checklist `1.2` rồi ghi một bản (`subjects: [{kind:'ACCESS_REQUEST', id}]`). Khuôn nhiều mục có sẵn ở lô chi:
  `spend-approval/spend-batch-decision.service.ts` (chấm một lần, mỗi Request một tx, kết quả từng mục, `RETRYABLE`, `ALREADY_DECIDED` — W1-16).
- **Hành vi đúng:**
  1. Route mới `POST /request-tickets/{id}/need-decisions`, thân `{ requestIds: uuid[] (1…6, không trùng), decision: APPROVE|REJECT|RETURN, reason?,
     checklist }`. FE chọn sẵn mọi mục còn chờ (BE nhận danh sách tường minh — **Tự chốt** T-W4-4).
  2. Phiếu người gọi không xem được ⟹ 404 `REQUEST_TICKET.NOT_FOUND`. Chấm checklist `1.2` **một lần** trước mọi mục (lỗi `POLICY.*` ⟹ không ghi
     gì): có _Không_ ⟹ _Duyệt_ bị khóa như quyết lẻ; _Từ chối_ / _Trả về_ chỉ áp **các mục đã chọn**.
  3. Từng `requestId` theo **`ticket_position`** (không theo thứ tự thân), **mỗi mục một tx**, gọi `NeedDecisionService.decideJudged(tx…, judged)`
     (tách từ `decide`; `decide` = chấm rồi `decideJudged` — LUẬT CỨNG 2). Ghi checklist **một bản cho mục đó** trong tx của mục.
  4. Kết quả từng mục `{ requestId, outcome: APPROVED|REJECTED|RETURNED|SKIPPED|RETRYABLE, reason }`; `reason` của `SKIPPED`: `NOT_IN_TICKET`,
     `OWN_REQUEST`, `NOT_THE_ASSIGNEE`, `STEP_NOT_PENDING`; mục đã do chính người gọi quyết cùng quyết định ở bước nhu cầu mới nhất ⟹ outcome đó +
     `ALREADY_DECIDED`, không ghi; lỗi DB tạm thời ⟹ `RETRYABLE` `TRANSIENT_FAILURE`. Trả 200 `{ results }`.
  5. Hiệu ứng sau quyết định (hàng đợi trình, thông báo, audit) là của quyết lẻ, từng mục.
- **Tiêu chí** (`ticket-need-decision.service.spec.ts` `it.each` + integration `request-ticket-need-decision.integration-spec.ts`):

| Ca | Given                                               | When `H1`                                     | Then                                                                                    |
| -- | --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| A  | `PH-1` = `R1`,`R2`,`R3` chờ `H1`                     | chọn `R1`,`R2`, mọi câu _Có_, duyệt           | `R1`,`R2` `APPROVED` → `AWAITING_SPEND_SUBMISSION`; 2 dòng `decision_checklists` cùng bộ trả lời; `R3` vẫn chờ (AC-23) |
| B  | ca A xong                                           | chọn `R3`, một câu _Không_, `APPROVE`         | 422 `POLICY.CHECKLIST_HAS_NO`, không ghi                                                |
| C  | ca A xong                                           | chọn `R3`, một câu _Không_, `RETURN`          | chỉ `R3` `RETURNED` → `AWAITING_REQUESTER_REVISION`                                     |
| D  | ca A xong                                           | gửi lại đúng thân ca A                        | `R1`,`R2` `APPROVED` + `ALREADY_DECIDED`, không ghi thêm                                |
| E  | `R2` đã rút                                         | chọn `R1`,`R2`                                | `R1` `APPROVED`; `R2` `SKIPPED` `STEP_NOT_PENDING`                                      |
| F  | `requestIds` có id của phiếu khác                   | —                                             | id đó `SKIPPED` `NOT_IN_TICKET`; mục của phiếu được quyết                               |
| G  | `H2` (trưởng phòng khác) xem được nhưng không giữ bước | chọn `R1`                                  | `SKIPPED` `NOT_THE_ASSIGNEE` (hoặc 404 khi không xem được)                              |
| H  | thân `requestIds` [`R2`,`R1`]                       | duyệt                                         | xử lý `R1` trước `R2` (kết quả theo `position`)                                         |

### 7.6. W4-06 Người duyệt chi quyết nhiều mục cùng phiếu (1.7)

- **Nguồn:** `QĐ-116e`, `QĐ-115ab`; `US-06-01` AC-36; `US-05-25` AC-7, _Out of scope_ (Request hai bước vẫn theo lô).
- **Hiện trạng:** quyết lẻ `spend-approval/spend-decision.service.ts`; lô `spend-batch-decision.service.ts:55-150` (_Trả về_ lấy **mọi** Request của lô
  người gọi giữ).
- **Hành vi đúng:**
  1. Route mới `POST /request-tickets/{id}/spend-decisions`, thân như W4-05 (checklist bước `1.7`). Chấm một lần; từng mục theo `position`, mỗi mục một
     tx qua `SpendDecisionService.decide(actor, id, input, judged)` (như `decideOne` của lô).
  2. Chỉ mục **Request một bước** (`routing_mode = ONE_STEP`); mục đi hai bước (qua lô) ⟹ `SKIPPED` `USE_BATCH`. Mục của phiếu khác ⟹ `NOT_IN_TICKET`
     (`US-06-01` AC-36: "Mục của phiếu khác không chọn chung được").
  3. _Trả về_ chỉ áp **mục đã chọn** (khác lô); Request một bước trả về thẳng người xin (`QĐ-116f` vế cuối, hành vi hiện có).
  4. Ánh xạ kết quả (`ALREADY_DECIDED`, `RETRYABLE`, `NO_SPEND_STEP`, kiểm lại lúc duyệt ra bị chặn ⟹ `SKIPPED` `RECHECKED_RETURNED_TO_REQUESTER`,
     `COMMITMENT_NOT_HOLDABLE`, lý do từ chối của `SpendDecisionRefusedError`) tách vào `spend-item-outcome.policy.ts`, **lô dùng chung** — không đổi
     kết quả của lô (LUẬT CỨNG 2; test lô cũ xanh không đổi kỳ vọng).
- **Tiêu chí:** (A) `PH-3` của `H1`: `R21`,`R22`,`R23` chờ `C1`; `C1` chọn `R21`,`R22`, một checklist, duyệt ⟹ 2 `APPROVED`, 2 khoản cam kết, 2 dòng
  checklist; `R23` chờ (AC-36); (B) chọn thêm `R1` của `PH-1` ⟹ `R1` `NOT_IN_TICKET`; (C) mục hai bước của phiếu nhân viên ⟹ `USE_BATCH`;
  (D) `RETURN` `R21` ⟹ chỉ `R21` về `AWAITING_REQUESTER_REVISION` của `H1`; (E) kiểm lại lúc duyệt `R22` ra vượt ⟹ `SKIPPED`
  `RECHECKED_RETURNED_TO_REQUESTER`, `R21` vẫn duyệt; (F) gửi lại ⟹ `ALREADY_DECIDED`.

### 7.7. W4-07 Thứ tự mục cùng phiếu ở lô và khi chuyển một bước

- **Nguồn:** `QĐ-117k`(3) "trong lô, các mục cùng phiếu giữ thứ tự của phiếu"; `QĐ-116az`(2); `QĐ-116c` (kiểm ngân sách lại ngay khi chuyển một bước).
- **Hiện trạng:** `spend-submission/spend-batch.service.ts:73-140` khóa `lockAll` theo id rồi `sendOn` theo **thứ tự thân** `requestIds`. Chuyển một
  bước: `reassignment/step-reassignment.service.ts` (`convertQueuedSpend`, dòng 369) + `reassignment/one-step-conversion.service.ts` — thứ tự lặp
  người code xác nhận.
- **Hành vi đúng:**
  - Lô: sau `lockAll`, sắp thứ tự xử lý bằng `spend-batch-order.policy.ts`: các ô trong thân do mục của **cùng một phiếu** chiếm được điền lại bằng
    chính các mục đó theo `position` tăng; Request không thuộc phiếu giữ ô. Kết quả trả theo **thứ tự xử lý** (mỗi kết quả có `requestId`).
  - Chuyển một bước nhiều mục của cùng phiếu trong một sự kiện: kiểm ngân sách theo `position` (khóa vẫn theo id, đã giữ trước).
  - `QĐ-117k`(2): mục đã qua rồi bị _Trả về_ / _Từ chối_ / rút ⟹ thôi tính chờ duyệt chi ngay (hành vi `pendingFor` hiện có), không kiểm lại mục khác.
- **Tiêu chí:** `it.each` thứ tự: [`R3`(PH1#3), `X`, `R1`(PH1#1)] ⟹ [`R1`, `X`, `R3`]; [`A`(PH1#2), `B`(PH2#1), `C`(PH1#1)] ⟹ [`C`, `B`, `A`];
  không phiếu ⟹ giữ nguyên. Integration (dự phòng 0, còn lại 3.000.000): `H1` trình [`Notion` #2 1.500.000, `Miro` #1 2.000.000] ⟹ `Miro`
  `SENT_TO_APPROVER`, `Notion` `STOPPED` (bị chặn). Integration chuyển một bước: `E5` có `R11` (#1 Miro), `R12` (#2 Notion) đứng chờ, Super Admin gán
  `E5` làm trưởng phòng ⟹ `R11` qua, `R12` bị chặn với cùng số (`US-05-04` AC-26 trên mục phiếu).

### 7.8. W4-08 Rút cả phiếu, rút từng mục

- **Nguồn:** `QĐ-115ac`, `QĐ-113d`; `US-05-08` AC-14. V3:266 đề xuất "mỗi mục một transaction" — khớp AC-14 (mục đã có quyết định không rút được,
  mục khác vẫn rút).
- **Hiện trạng:** `POST /access-requests/{id}/withdraw` (`withdraw/withdrawal.controller.ts:41`, `access-request/withdrawal.policy.ts:52-80,97`) —
  người xin rút khi chưa có quyết định nào; GH-2 vẫn đếm Request đã rút (`request-limits.policy.ts`).
- **Hành vi đúng:**
  - Rút **từng mục** = route Request hiện có, không đổi.
  - Rút **cả phiếu**: route mới `POST /request-tickets/{id}/withdrawal`, thân `{ reason? }` (như rút Request đơn). Chỉ **người xin** của phiếu; người
    khác xem được ⟹ 403 `REQUEST_TICKET.NOT_REQUESTER`; không xem được ⟹ 404. Mỗi mục theo `position`, **một tx**, qua `WithdrawalService`:
    `WITHDRAWN` / `SKIPPED` với lý do sẵn có (`WITHDRAWAL_AFTER_DECISION`, `ALREADY_ENDED`, `WITHDRAWAL_PENDING`, `GRANT_RUNNING`, `GRANT_COMPLETED`) /
    `RETRYABLE`. Trả 200 `{ results }`. Thông báo/audit là của từng Request.
- **Tiêu chí:** (A) `PH-1`: `R1` đã được `H1` duyệt nhu cầu, `R2`,`R3` chưa quyết; `E1` rút `R2` (route mục) ⟹ `R2` `WITHDRAWN`, phiếu `IN_PROGRESS`;
  (B) rút cả phiếu ⟹ `R3` `WITHDRAWN`, `R1` `SKIPPED` `WITHDRAWAL_AFTER_DECISION`, `R2` `SKIPPED` `ALREADY_ENDED` (AC-14); (C) `H1` gọi ⟹ 403
  `REQUEST_TICKET.NOT_REQUESTER`; (D) mục `WAITING_CONTROLLED` (phòng không có trưởng phòng) rút được; (E) GH-2 vẫn đếm mục đã rút.

### 7.9. W4-09 Ghi chú trả lời khi người xin gửi lại

- **Nguồn:** `QĐ-114q` "bắt buộc kèm một ghi chú trả lời … (chữ thuần, không tệp), lưu kèm lần gửi lại"; `QĐ-116az`(3) mỗi mục một ghi chú;
  `US-05-02` AC-24; `US-05-25` AC-10.
- **Hiện trạng:** `POST /access-requests/{id}/resubmission` **không có thân** (`request-submission/access-requests.controller.ts:147-180`,
  `request-intake/request-resubmission.service.ts:41-57`); không lưu ghi chú.
- **Hành vi đúng:** thân bắt buộc `{ replyNote: string trim 1…1000 }` (**Phá vỡ**); thiếu/rỗng ⟹ 422 `VALIDATION_ERROR`. Trong tx gửi lại (sau các kiểm
  `NOT_REQUESTER`, `NOT_AWAITING_REVISION` như cũ), chèn `access_request_replies` (`REQUESTER_RESUBMISSION`, `returned_step_id` = bước mới nhất đóng
  `RETURNED` — nhu cầu, đánh giá IT hoặc chi một bước), audit `ACCESS_REQUEST.RESUBMITTED` thêm `replyId`. Áp **mọi** Request bị _Trả về_ (đơn, mục
  phiếu, Request nhóm, case B) — `QĐ-114q` không giới hạn loại. Nhiều mục bị trả về cùng lúc: mỗi mục gửi lại bằng route của nó với ghi chú riêng
  (không route gửi lại hàng loạt — **Tự chốt** T-W4-5). Mobile: gửi lại giữ ở web (`QĐ-116ab`).
- **Tiêu chí:** (A) `R3` bị `H1` trả về; gửi lại không thân ⟹ 422, Request không đổi; (B) `replyNote: "dùng cho dự án X, 3 tháng"` ⟹ 200, một dòng
  reply, bước nhu cầu mới (AC-24); (C) hai mục `PH-1` trả về, gửi lại mỗi mục một ghi chú ⟹ 2 dòng reply đúng `request_id` (AC-10); (D) gửi lại hai lần
  cùng một lần trả về (đua) ⟹ một thành công, một `NOT_AWAITING_REVISION` (unique `returned_step_id` là lưới an toàn); (E) Request một bước bị `C1`
  trả về ⟹ reply gắn bước chi.

### 7.10. W4-10 Ghi chú trả lời khi trưởng phòng trình lại

- **Nguồn:** `QĐ-116f` "Request về hàng đợi trình của trưởng phòng; trưởng phòng **trình lại kèm ghi chú trả lời**"; `US-06-14` AC-24 "thiếu ghi chú
  ⟹ không trình được mục đó, các mục khác của lô không đổi".
- **Hiện trạng:** `C1` _Trả về_ ở 1.7 đưa Request hai bước về hàng đợi trình (`spend-decision.service.ts:96-102`, `returnByApprover`); trình lại = đưa vào
  lô mới qua `POST /spend-batches`.
- **Hành vi đúng:** thân `POST /spend-batches` thêm `replyNotes?: [{ requestId, note }]` (≤ số `requestIds`). Với Request mà **bước chi mới nhất đóng
  bằng quyết định `RETURNED` của Người duyệt chi** (không phải kiểm lại của hệ thống — `RECHECKED_RETURNED_TO_HEAD` không cần ghi chú): thiếu ghi chú ⟹
  `outcome: STOPPED`, `stopReason: REPLY_NOTE_REQUIRED` (mới), ở lại hàng đợi, các mục khác đi tiếp; có ghi chú ⟹ chèn reply `HEAD_RESUBMISSION` trong
  tx của lô. Ghi chú cho Request không có trong lô ⟹ 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH` (cả lô không ghi — như `SpendConfirmationNotInBatchError`);
  ghi chú cho Request trong lô nhưng không bị trả về ⟹ bỏ qua, không lưu (**Tự chốt** T-W4-6).
- **Tiêu chí:** (A) `R1` bị `C1` trả về; `H1` trình [`R1`, `R4`] không ghi chú ⟹ `R1` `STOPPED` `REPLY_NOTE_REQUIRED`, `R4` đi tiếp; (B) kèm ghi chú
  ⟹ `R1` `SENT_TO_APPROVER`, một reply `HEAD_RESUBMISSION`; (C) ghi chú cho id ngoài lô ⟹ 422, không lô nào được tạo; (D) Request bị kiểm lại trả về
  (không do `C1` quyết) ⟹ trình không cần ghi chú.

### 7.11. W4-11 Người quyết thấy ghi chú trả lời

- **Nguồn:** `QĐ-114q` "người quyết thấy nội dung trước–sau cùng ghi chú"; `US-06-01` AC-35.
- **Hành vi đúng:** `accessRequestGet` thêm `latestReply: { kind: REQUESTER_RESUBMISSION|HEAD_RESUBMISSION, note, author, createdAt } | null` (reply mới
  nhất). Lý do trả về đã có trong lịch sử bước. Không thêm vào danh sách hàng đợi (**Tự chốt** T-W4-7 — đơn giản).
- **Tiêu chí:** sau 7.9 (B) `H1` mở `R3` ⟹ `latestReply.note` đúng; Request chưa từng gửi lại ⟹ `null`.

### 7.12. W4-12 Trưởng phòng rút Request ở hàng đợi trình _(chờ OQ-W4-2)_

- **Nguồn:** `QĐ-116b` "rút được **mọi Request trong hàng đợi trình của mình** (đã duyệt nhu cầu chờ trình lô, hoặc bị Người duyệt chi trả về ở bước
  1.7), lý do bắt buộc; người xin được báo; Request kết thúc _đã rút_, không khoản cam kết"; `US-05-08` AC-15; `US-06-14` AC-23. Sổ QĐ không ghi đợt.
- **Hiện trạng:** `access-request/withdrawal.policy.ts:23` `HEAD_MAY_WITHDRAW_AT = ['BLOCKED', 'RESERVE_CONFIRMATION']`.
- **Hành vi đúng (nếu OQ-W4-2 = A):** thêm giai đoạn _ở hàng đợi trình_ (`AWAITING_SPEND_SUBMISSION`, gồm Request bị `C1` trả về) vào danh sách trưởng
  phòng được rút; lý do bắt buộc (`REASON_REQUIRED` như hiện có); người xin được báo (thông báo rút hiện có). Không route mới.
- **Tiêu chí:** `US-05-08` AC-15: `R4` (đã duyệt nhu cầu, chưa trình), `R5` (bị `C1` trả về); `H1` rút không lý do ⟹ 422 `REASON_REQUIRED`; có lý do ⟹ cả
  hai `WITHDRAWN`, không khoản cam kết, `E1`,`E2` được báo.

### 7.13. Ranh giới với đợt 5 (xác nhận lần hai, AI)

- Đợt 4 **không** chấm _Đạt / Không đạt_ cho câu có luật dữ liệu, **không** trả cặp (Request, câu) lệch, **không** cờ _duyệt dù hệ thống báo không đạt_
  (`QĐ-115aj`, `QĐ-116a` thuộc đợt 5 theo `QĐ-118a`). Checklist ở mọi route đợt 4 chấm như quyết lẻ hiện có.
- Hai route quyết nhiều mục phải mở rộng được **chỉ bằng thêm trường**: đợt 5 thêm `confirmations?: [{ requestId, questionCode, note? }]` vào thân (Zod
  strict ⟹ đợt 5 sửa schema) và `mismatches?` vào từng kết quả; đơn vị là **cặp (Request, câu)**, `x/y` theo từng Request (`QĐ-117d`) — vì vậy đợt 4
  giữ kết quả **theo từng mục**, không có kết quả cấp phiếu.
- Ghi chú trả lời (M2) là dữ liệu đợt 5 dùng để AI "so trước–sau"; đợt 4 chỉ lưu và trả `latestReply`.

### 7.14. W4-13 Mobile và W4-14 ca biên tổ chức

- **Mobile (`QĐ-61b` 4 tác vụ; `QĐ-82l`(16) "thao tác hàng loạt chỉ trên web; mobile quyết từng mục theo cùng quy tắc"):** không route mới; BE không chặn
  theo kênh (như lô hiện có). Test mở rộng 4 spec mobile hiện có: (1) `E1` xem Request của mình thấy `ticket`, rút **một mục** (`mobile-employee-requests`);
  (2) `H1` quyết **một mục** phiếu qua `accessRequestNeedDecide` (`mobile-need-decision`); (3) `C1` quyết **một mục** phiếu của `H1` qua
  `spendApprovalDecide` (`mobile-spend-approval`); (4) hộp thông báo nhận thông báo từng mục (`mobile-session-roles` / inbox). Gửi phiếu, quyết nhiều mục,
  rút cả phiếu, gửi lại: web.
- **Người xin vừa thành trưởng phòng (`QĐ-116c`, `QĐ-118o`):** mục phiếu là Request cá nhân ⟹ chuyển một bước như Request đơn (W1-17), phiếu giữ
  nguyên; thứ tự kiểm theo W4-07. Phiếu không chứa Request nhóm nên không có ca tách dòng.
- **Phòng không có trưởng phòng (`QĐ-110i`):** W4-02 ca L; khi Super Admin gán trưởng phòng mới, các mục nhận bước như Request đơn; trưởng phòng mới dùng
  W4-05 được.
- **Bước IT (`QĐ-118d`):** cấp **từng mục** qua tác vụ cấp hiện có; chỉ IT phụ trách phòng người thụ hưởng hoặc người làm thay
  (`ProvisioningTaskFrame.requireActingItAdmin`). Phiếu không thêm quyền nào. Integration: `IT2` cấp mục của `E1` ⟹ 403 `PROVISIONING.NOT_IN_CHARGE`;
  `IT1` cấp ⟹ 200.

## 8. API

Theo `docs/rules/api-contract.md`: Zod strict, mỗi mã lỗi một status, `examples` cho từng lỗi, mô tả OpenAPI **không** chứa mã nội bộ (`QĐ-`, `FR-`, `US-`,
`W4-`, `D-`, `OQ-`, `MF-`, `SBF-`), route có đầu vào khai 422 `VALIDATION_ERROR`, 401/503 dùng response chung, route có luật phạm vi khai 403 mã riêng.
Route cũ giữ đường dẫn, `operationId`; chỉ thêm trường, trừ chỗ **Phá vỡ**.

### 8.1. Operation mới (5)

| # | Method · path                                  | `operationId`              | Vai · phạm vi                                                     | Thành công                    | Lỗi riêng (status)                                                                                                                                  |
| - | ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | POST `/request-tickets`                        | `requestTicketSubmit`      | `@AuthenticatedOnly` · người xin cho chính mình (không Super Admin) | 201 `{ ticket }`              | `REQUEST_TICKET.TOO_MANY_ITEMS` (422), `REQUEST_TICKET.ITEMS_REFUSED` (422), [`REQUEST_TICKET.TOO_FEW_ITEMS` (422) nếu OQ-W4-1 = B]; lỗi cấp phiếu của Request đơn (§7.2 bước 2) |
| 2 | GET `/request-tickets/{id}`                    | `requestTicketGet`         | `@AuthenticatedOnly` · xem được ≥ 1 mục                            | 200 `{ ticket }`              | `REQUEST_TICKET.NOT_FOUND` (404)                                                                                                                    |
| 3 | POST `/request-tickets/{id}/need-decisions`    | `requestTicketNeedDecide`  | `@AuthenticatedOnly` · người giữ bước nhu cầu của từng mục         | 200 `{ results }`             | `REQUEST_TICKET.NOT_FOUND` (404); `POLICY.VERSION_CHANGED` (409), `POLICY.CHECKLIST_INCOMPLETE`/`CHECKLIST_HAS_NO` (422)                            |
| 4 | POST `/request-tickets/{id}/spend-decisions`   | `requestTicketSpendDecide` | `@AuthenticatedOnly` · Người duyệt chi giữ bước chi của từng mục   | 200 `{ results }`             | như #3                                                                                                                                              |
| 5 | POST `/request-tickets/{id}/withdrawal`        | `requestTicketWithdraw`    | `@AuthenticatedOnly` · người xin của phiếu                         | 200 `{ results }`             | `REQUEST_TICKET.NOT_FOUND` (404), `REQUEST_TICKET.NOT_REQUESTER` (403)                                                                             |

- `ticket` = `{ id, requester, department, submittedAt, status: IN_PROGRESS|DONE, items: [{ position, requestId, plan: { id, name }, state, termMonths,
  routingMode }] }`.
- `results[]` = `{ requestId, outcome, reason }` — schema riêng ở `request-ticket/request-ticket.dto.ts` (không sửa `spend-approval-view/spend-approval.dto.ts`).
  `outcome`: #3, #4 `APPROVED|REJECTED|RETURNED|SKIPPED|RETRYABLE`; #5 `WITHDRAWN|SKIPPED|RETRYABLE`.
- Không collection mới (không route list phiếu — mục của `GET /me/access-requests` mang `ticket`).

### 8.2. Operation đổi

| `operationId`                                                | Thay đổi                                                                                                                         | FE cần làm                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `accessRequestResubmit`                                      | **Phá vỡ:** thân bắt buộc `{ replyNote }` (1…1000); thiếu ⟹ 422 `VALIDATION_ERROR`; summary bỏ chữ "one-step"                    | Ô ghi chú bắt buộc                 |
| `spendBatchSubmit` (POST `/spend-batches`)                   | thân thêm `replyNotes?`; `stopReason` thêm `REPLY_NOTE_REQUIRED`; 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH`; mục cùng phiếu xử lý theo thứ tự phiếu, kết quả theo thứ tự xử lý | Ô ghi chú cho mục bị trả về; khớp kết quả theo `requestId` |
| `accessRequestGet`                                           | thêm `ticket`, `latestReply`                                                                                                     | Liên kết phiếu, hiện ghi chú       |
| `meAccessRequestList` (GET `/me/access-requests`), `needDecisionList`, `spendApprovalList` | thêm `ticket` ở mỗi mục                                                                                                   | Nhóm theo phiếu                    |
| `accessRequestWithdraw`                                      | _(nếu OQ-W4-2 = A)_ trưởng phòng rút được Request ở hàng đợi trình; mã lỗi không đổi                                             | Nút rút ở hàng đợi trình           |

Không đổi: route Request đơn, Request nhóm, lô chi (ngoài dòng trên), cấp phát.

### 8.3. Mã thông điệp / lỗi mới

`REQUEST_TICKET.SUBMITTED`, `REQUEST_TICKET.FOUND`, `REQUEST_TICKET.NEED_DECIDED`, `REQUEST_TICKET.SPEND_DECIDED`, `REQUEST_TICKET.WITHDRAWN` (message
thành công); lỗi: `REQUEST_TICKET.NOT_FOUND` 404, `REQUEST_TICKET.NOT_REQUESTER` 403, `REQUEST_TICKET.TOO_MANY_ITEMS` 422,
`REQUEST_TICKET.ITEMS_REFUSED` 422, (`REQUEST_TICKET.TOO_FEW_ITEMS` 422), `SPEND.REPLY_NOTE_NOT_IN_BATCH` 422. Lý do trong `details`/`reason` (không phải
mã lỗi): `NOT_PAID_IN_CATALOG`, `DUPLICATE_IN_TICKET`, `NOT_IN_TICKET`, `USE_BATCH`, `REPLY_NOTE_REQUIRED`, cùng lý do sẵn có.

### 8.4. Bàn giao FE (sau đợt; API description xuất từ `openapi.json`)

Form _Xin phần mềm_ nhiều gói → `requestTicketSubmit`, hiện lỗi từng mục theo `details.items[].position`; nút _dùng chung một lý do_ là FE; trang phiếu →
`requestTicketGet`; hộp quyết nhiều mục (chọn sẵn mọi mục còn chờ) → #3/#4, hiện kết quả từng mục; rút cả phiếu → #5; gửi lại có ô ghi chú bắt buộc;
hàng đợi trình có ô ghi chú cho Request bị trả về; mobile chỉ thao tác từng mục.

## 9. Tác động lên đợt 1–3 và tương thích

- **Request đơn cũ:** `ticket_id = null`; mọi route cũ giữ hành vi, trừ `accessRequestResubmit` (**Phá vỡ** — `QĐ-114q`) và `spendBatchSubmit` (thêm
  ghi chú, thứ tự). Test cũ của gửi lại không thân ⟹ đỏ đúng luật ⟹ sửa kỳ vọng (unit của chính luật) hoặc `FIX-TEST-<làn>.md` (http/integration).
- **Đợt 1:** dùng khuôn W1-16 (`RETRYABLE`, `ALREADY_DECIDED`); W1-17 (chuyển một bước) áp cho mục phiếu, chỉ thêm thứ tự; W1-10 (bảng khóa) thêm E5.
- **Đợt 2:** `QĐ-118d` cho bước IT không đổi; `EMPLOYEE.NOT_STARTED` là lỗi cấp phiếu; `PLAN_BOUND_TO_DEVICE` là vi phạm của mục.
- **Đợt 3:** giá tháng, `K1` năm 12 tháng, giá lô `K4`, chi phí đang chạy không cam kết (P7) áp cho từng mục qua `assess`/`BudgetCheckService` — đợt 4
  **không** sửa `pricing.policy.ts`, `budget-check.*`, `seat-release.*`, `access-request-grant.listener.ts`, `purchase-invoice/**`, `year-start-commitments/**`.

## 10. Phụ thuộc đợt 3 và delta check

Đợt 3 đang sửa (PLAN đợt 3 bảng _Gói_) các file mà đợt 4 **cũng** chạm — đợt 4 chỉ bắt đầu code **sau khi đợt 3 đã squash vào `dev`**, rồi viết
`DELTA-W3-FINAL.md` (như `redesign-w3-2026-11-22/DELTA-W2-FINAL.md`):

| File đợt 4 chạm                                                                 | Gói đợt 3 sửa            | Đợt 4 làm gì                                     |
| ------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| `prisma/models/requests.prisma`, `organization.prisma`                          | P3, P11, P12a, P12b      | thêm model/trường (B1, B5)                       |
| `m/requests/access-request/access-request.dto.ts`                               | P16b                     | thêm `ticket`, `latestReply` (T2, T3)            |
| `m/requests/spend-approval-view/spend-approval.dto.ts`, `spend-approval-view.service.ts` / queue | P16b    | thêm `ticket` ở mục danh sách (T2)               |
| `m/requests/access-request/access-request.errors.ts`, `.http-errors.ts`         | P13a (chỉ thêm)          | không cần (lỗi mới ở `request-ticket/`)          |
| `m/requests/access-request/access-request.repo.ts`, `.types.ts`                 | (kiểm lại)               | thêm `ticket` (B1)                               |
| `m/requests/requests.module.ts`, manifest OpenAPI `…-requests*.ts`              | nhiều gói (chỉ thêm)     | thêm dòng                                        |
| `m/requests/README.md`, `docs/rules/database-business.md`                       | P23                      | thêm mục phiếu, E5 (T6, B7)                       |

Delta check (lệnh ở PLAN): `git --no-pager diff 444e6fc3 origin/dev --stat -- <các file trên> src/modules/requests/request-intake src/modules/requests/need-decision
src/modules/requests/spend-approval src/modules/requests/spend-submission src/modules/requests/withdraw src/modules/requests/reassignment`; mỗi file lệch ghi
một dòng DL-n (file:line mới, ảnh hưởng SPEC, cách áp). Lệch đổi luật ⟹ dừng hỏi Owner.

## 11. Test bắt buộc

### 11.1. Ma trận

| Mục   | Unit (spec cạnh file)                                                                 | Integration (`test/integration/requests/`)                         | HTTP (`test/http/requests/`)                         |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| W4-01 | —                                                                                     | `request-ticket-schema` (CHECK, unique, trigger)                    | —                                                    |
| W4-02 | `request-ticket.policy.spec.ts` (bảng 7.2 phần luật), `request-ticket-precheck.service.spec.ts`, `access-request.service` (kiểm giữ) | `request-ticket-submit` (ca A–M)                | `request-tickets` (201, 422×3, 403, 401)             |
| W4-03 | —                                                                                     | `request-ticket-head` (ca A–E)                                      | —                                                    |
| W4-04 | `request-ticket.policy.spec.ts` (trạng thái suy ra `it.each`), view service           | `request-ticket-view`                                               | `request-ticket-get` (200, 404)                      |
| W4-05 | `ticket-need-decision.service.spec.ts` (ca A–H)                                       | `request-ticket-need-decision`                                      | contract #3                                          |
| W4-06 | `ticket-spend-decision.service.spec.ts`, `spend-item-outcome.policy.spec.ts`, `spend-batch-decision.service.spec.ts` (không đổi kỳ vọng) | `request-ticket-spend-decision`                 | contract #4                                          |
| W4-07 | `spend-batch-order.policy.spec.ts` (`it.each`)                                        | `spend-batch-ticket-order`, `request-ticket-head-conversion`        | —                                                    |
| W4-08 | `ticket-withdrawal.service.spec.ts`                                                   | `request-ticket-withdrawal`                                         | contract #5                                          |
| W4-09 | `request-resubmission.service.spec.ts`                                                | `request-resubmission-reply`                                        | `one-step-resubmission` (thân mới, 422 thiếu ghi chú) |
| W4-10 | `spend-batch.service` (ghi chú)                                                       | `spend-batch-reply-note`                                            | —                                                    |
| W4-11 | mapper                                                                                | —                                                                   | `access-request-get` (`latestReply`)                 |
| W4-12 | `withdrawal.policy.spec.ts`                                                           | `head-withdraw-submission-queue`                                    | —                                                    |
| W4-13 | —                                                                                     | 4 spec `mobile-*` mở rộng                                           | —                                                    |
| W4-14 | —                                                                                     | `request-ticket-grant-in-charge` (IT1 200, IT2 403)                 | —                                                    |

Ca diệt đột biến (chạy tay một lần, ghi PROGRESS): đổi `≥` thành `>` ở GH-2 cộng dồn (ca H phải đỏ); bỏ sắp `position` (7.3 ca B, 7.5 ca H, 7.7 đỏ);
đếm mục bị nêu vào GH-2 (ca G đỏ); _Trả về_ ở #4 lấy mọi mục (7.6 ca D đỏ).

### 11.2. Fixture đúng QĐ-118 (bài học `FIX-PLAN-W2`)

Mọi integration/http dựng tổ chức **đủ**: phòng `P-DES` có trưởng phòng `H1`, **IT phụ trách** `IT1` (`RequestHarness.setItAdminInCharge`,
`test/support/request-harness.ts:299`), phòng còn lại giao `IT2` (`handOthersToSecondItAdmin`, `test/support/second-it-admin.ts`); Cost Center hiện hành
+ ngân sách năm có số cơ sở/dự phòng ghi rõ trong test; Người duyệt chi `C1` có vai; nhân viên có `employment_type`, lần xếp phòng hợp lệ (không chỉ tương
lai). Ca "phòng không có trưởng phòng" bỏ trưởng phòng nhưng **giữ** IT phụ trách. Ca làm thay IT tạo qua HTTP `POST /departments/{id}/it-substitutes`
(mẫu `test/integration/licensing/provisioning-in-charge.integration-spec.ts:25-33`). Helper trả `undefined` sau 403 là dấu hiệu fixture thiếu IT — sửa
fixture, không sửa logic.

### 11.3. Đồng thời

2 connection, barrier, lặp 20, không `40P01`, bất biến giữ: (1) hai phiếu của cùng `E1` gửi cùng lúc (GH-2 tổng không vượt 10; trùng gói giữa hai phiếu
⟹ đúng một phiếu nhận `OPEN_REQUEST_EXISTS`); (2) #3 ‖ rút mục `R2` (một bên thắng, không ghi nửa); (3) #4 ‖ `spendApprovalDecide` cùng mục (một quyết
định, bên kia `ALREADY_DECIDED`/`NO_SPEND_STEP`); (4) hai phiếu trưởng phòng cùng `CC-DES` (CC-year tuần tự, tổng qua ≤ còn lại).

## 12. Câu hỏi Owner (OQ-W4-n)

| Mã      | Câu hỏi                                                                                                         | Phương án                                                                                   | Khuyến nghị + lý do                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-W4-1 | Phiếu tối thiểu mấy mục?                                                                                        | A: 1–6 · B: 2–6 (V3:261)                                                                    | **A** — `US-05-22` AC-13 (BASELINED) có "gửi phiếu một mục"; sổ QĐ chỉ nói trần 6; ít mã lỗi hơn                                          |
| OQ-W4-2 | `QĐ-116b` (trưởng phòng rút mọi Request ở hàng đợi trình, lý do bắt buộc) làm ở đợt 4?                          | A: làm (W4-12, cỡ S) · B: để đợt sau, giữ `BLOCKED`/`RESERVE_CONFIRMATION`                 | **A** — `US-05-08` AC-14 của phiếu dẫn tới nó ("`H1` rút `R1` … khi `R1` đang ở hàng đợi trình"); cùng code rút, không bảng mới            |
| OQ-W4-3 | Phiếu có mã hiển thị (vd `PH-2026-0001`)?                                                                       | A: không, FE hiện theo thời điểm gửi + tên người xin · B: có, sequence theo năm             | **A** — sổ QĐ không đòi; trường chỉ để hiện (tiền lệ Owner bỏ trường chỉ-hiện); thêm sau được bằng cột nullable                          |
| OQ-W4-4 | Thông báo khi gửi phiếu: mỗi mục một thông báo (như nay) hay một thông báo gộp cho trưởng phòng?                | A: giữ từng mục · B: một thông báo gộp mỗi phiếu (V3:264)                                   | **A** — không đổi người nhận/mẫu thông báo; mỗi mục vẫn có bước riêng; gộp là việc FE hộp thư                                             |

Câu đã có căn cứ, **không** hỏi: xác nhận lần hai ở đợt 5 (`QĐ-118a`); rút cả phiếu từng mục độc lập (`US-05-08` AC-14); route quyết chi theo phiếu chỉ cho
Request một bước (`US-05-25` _Out of scope_); mobile chỉ thao tác từng mục (`QĐ-82l`(16)); ghi chú trình lại chỉ sau _Trả về_ của Người duyệt chi (`QĐ-116f`).

## 13. Ranh giới cho người code

- Chỉ làm đúng SPEC; SPEC không nói mà đổi hành vi nghiệp vụ (tiền, quyền, trạng thái, người nhận thông báo, mã lỗi FE thấy) ⟹ ghi D-n "cần Owner", **giữ
  hành vi cũ** (CODE-PROMPT LUẬT CỨNG 1).
- Không làm gì của §2.2 (đặc biệt xác nhận lần hai, AI, tách dòng Request nhóm, phiếu nháp).
- Không sửa luật tiền/kho của đợt 3; mục phiếu đi đúng đường Request đơn.

## 14. Tự chốt theo nguồn

| Mã     | Điểm                                                        | Chọn                                                                     | Căn cứ                                                                       |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| T-W4-1 | Lưu liên kết mục ↔ phiếu                                    | bảng mới + cột `ticket_id`, không dùng lại `delegated_batch_id`           | cột chết mang nghĩa lô ủy quyền cũ; tên rõ nghĩa; W3-Q2 chưa thành QĐ        |
| T-W4-2 | Audit cấp phiếu                                             | một sự kiện `REQUEST_TICKET.SUBMITTED` + sự kiện từng Request như cũ      | `US-05-25` _Data/privacy/audit_: "phiếu ghi người gửi và thời điểm"; chỉ thêm |
| T-W4-3 | Trạng thái suy ra                                           | `IN_PROGRESS` / `DONE`                                                   | `US-05-25` AC-4; 5 nhãn V3 chưa thành QĐ                                     |
| T-W4-4 | Danh sách mục khi quyết                                     | BE nhận `requestIds` tường minh; FE chọn sẵn mọi mục còn chờ              | `QĐ-115ab` "mặc định mọi mục còn chờ" là mặc định giao diện                   |
| T-W4-5 | Gửi lại nhiều mục                                           | mỗi mục gọi route gửi lại của nó                                          | `QĐ-116az`(3) mỗi mục một ghi chú; không cần route hàng loạt                  |
| T-W4-6 | Ghi chú trình lại cho Request không bị trả về               | bỏ qua, không lưu                                                        | `QĐ-116f` chỉ đòi ghi chú sau _Trả về_                                        |
| T-W4-7 | Nơi hiện ghi chú                                            | `latestReply` trên chi tiết Request                                      | đủ cho "người quyết thấy"; tránh thêm trường danh sách                       |
| T-W4-8 | Thứ tự xử lý khi thân liệt kê lộn xộn                       | theo `ticket_position`                                                   | `QĐ-116az`(2), `QĐ-117k`(3)                                                  |
| T-W4-9 | Mục xin lại trong ân hạn điều chuyển (`TRANSFER_GRACE`)     | vào phiếu được, miễn GH-2 như Request đơn                                | `QĐ-115aa` chỉ loại Request tiếp tục, nhóm, case B, `K5`                     |
