# SPEC — Đợt 4 thiết kế lại: phiếu nhiều mục (25/11/2026, bản 2.1)

> **Bản 2.1 (25/11):** Owner chốt OQ-W4-1 → OQ-W4-4 = A và duyệt `NESTED_ARRAYS` w4 ([OWNER-ANSWERS.md](OWNER-ANSWERS.md),
> [§12](#12-câu-hỏi-owner-oq-w4-n)). Không đổi luật khác.

> **Bản 2 (25/11):** áp hai review độc lập [REVIEW-SPEC-BIZ.md](REVIEW-SPEC-BIZ.md) (RB-1…RB-11) và [REVIEW-SPEC-TECH.md](REVIEW-SPEC-TECH.md)
> (RT-1…RT-18) — bảng [§15](#15-đã-áp-review-bản-2). Đổi chính: ghi chú trả lời chỉ bắt buộc sau _Trả về_ **của người** chưa được trả lời (đúng chữ
> `QĐ-114q`); `returned_step_id` nullable, bỏ unique; lô giữ thứ tự `results`; lỗi cấp phiếu luôn thắng lỗi mục; gửi phiếu hai pha (chèn rồi định tuyến);
> enum `reason` đóng; registry `NESTED_ARRAYS` đúng file/key; T1 viết spec đặc tả hành vi hiện có trước mọi refactor.

- **Trạng thái:** **Owner đã duyệt — bản 2.1** (25/11/2026): mọi câu Owner đã trả lời ([§12](#12-câu-hỏi-owner-oq-w4-n),
  [OWNER-ANSWERS.md](OWNER-ANSWERS.md)). **Chỉ code sau khi đợt 3 đã vào `dev` và đã có `DELTA-W3-FINAL.md`** (PLAN — _Nền và nhánh_).
- **Nền đọc code:** `origin/int/redesign-w3` `444e6fc3` (= `dev` có đợt 1 + đợt 2 + **B1 của đợt 3**, P1–P8 xong). Đợt 3 còn P10 → P23 (B2, B3) đang
  làm và **cũng sửa module `requests`** (giá Request, cấp, giải phóng seat, `K1`, `K4`). Đợt 4 **dựa trên đợt 3 hoàn tất**; mọi `file:line` dưới đây
  đọc trên `444e6fc3`, người code xác nhận lại sau delta check ([§10](#10-phụ-thuộc-đợt-3-và-delta-check)).
- **Nguồn (thứ tự thẩm quyền):** (1) sổ QĐ `Docs/Decisions/project-decisions.md` tới `QĐ-119e` — chính: `QĐ-115aa`, `QĐ-115ab`, `QĐ-115ac`,
  `QĐ-115ad`, `QĐ-116e`, `QĐ-116az`, `QĐ-117k`, `QĐ-114q`, `QĐ-116f`, `QĐ-113d`, `QĐ-116b`, `QĐ-116c`, `QĐ-118o`, `QĐ-110i`, `QĐ-111aq`,
  `QĐ-114b`, `QĐ-82j`, `QĐ-82l`(16), `QĐ-61b`, `QĐ-104b`, `QĐ-106g`, `QĐ-118d`; ranh giới đợt 5: `QĐ-115aj`, `QĐ-116a`, `QĐ-116ab`, `QĐ-117d`,
  `QĐ-118a`; cắt/hoãn: `QĐ-118c`; (2) sổ phiên `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` (W3 B-gọn, W1-Q3, CUT-7); (3) BRD (`FR-3.2`,
  `FR-3.20`, `FR-3.21`, `FR-11.2`), _Quy trình và chính sách theo main flow_ (`MF-1`), User Stories `EP-05` (`US-05-02` AC-24, `US-05-04` AC-23, AC-26,
  `US-05-08` AC-12 → AC-16, `US-05-22` AC-13, `US-05-25` AC-1 → AC-10), `EP-06` (`US-06-01` AC-26, AC-35, AC-36, `US-06-14` AC-23, AC-24), `EP-16`;
  (4) research `W3-request-nhieu-goi.md`, `V3-verify-W4b-W3.md`, `AUDIT-B-request-duyet-ai-quyen.md` (chỉ đề xuất — chỗ chưa thành QĐ ghi rõ); (5) code
  `444e6fc3`; (6) mẫu `docs/reviews/redesign-w3-2026-11-22/` và `redesign-w2-2026-11-22/FIX-PLAN-W2.md` (lỗi hay gặp).
- **Phân đợt:** `redesign-w1-2026-11-22/SPEC.md` §2.2: "Phiếu nhiều mục; ghi chú bắt buộc khi gửi lại (FIX-PL2-Q3, `QĐ-114q`, P-1) | Đợt 4"; "AI W4c … |
  Đợt 5". `QĐ-118a` giữ "đối chiếu chính sách và xác nhận lần hai (`QĐ-116a`, `QĐ-115aj`)" trong **đợt 5**.
- **Cách kiểm:** đọc code bằng `Read`/`grep` trên worktree `444e6fc3` (chỉ đọc), không chạy test/build/DB. `file:line` tính từ `src/modules/` nếu không ghi
  khác. Chỗ tự chốt ghi **Tự chốt** + căn cứ ([§14](#14-tự-chốt-theo-nguồn)). Luật nghiệp vụ chưa có QĐ **không** tự quyết — thành câu `OQ-W4-n`.

## Mục lục

| Tệp                                          | Nội dung                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [SPEC.md](SPEC.md)                           | Mục tiêu, phạm vi, mục W4-xx, dữ liệu + migration, kiến trúc, thứ tự khóa, hành vi đúng, API, tác động, test, OQ |
| [PLAN.md](PLAN.md)                           | Gói, hai làn song song, cửa C1/C2, file từng gói, tự kiểm chéo, lệnh kiểm, điều kiện xong                         |
| [CODE-PROMPT.md](CODE-PROMPT.md)             | Prompt dán sẵn cho người code (Sonnet/Gemini, Neon), LUẬT CỨNG, Skill Preflight, điều kiện DỪNG                  |
| [REVIEW-SPEC-BIZ.md](REVIEW-SPEC-BIZ.md), [REVIEW-SPEC-TECH.md](REVIEW-SPEC-TECH.md) | Hai review bản 1 (đã áp ở bản 2 — §15)                                               |

## 1. Mục tiêu

Người mới vào cần nhiều phần mềm một lúc. Đợt này cho người xin gửi **một phiếu** gồm tối đa **6 mục**, mỗi mục là **một Request hiện có** (phương án
B-gọn, `QĐ-115aa`): ngân sách, khoản cam kết, cấp phát, `KPI-2`, bản ghi phê duyệt và Audit Trail **vẫn theo từng Request**; phiếu chỉ là vỏ bọc, trạng
thái phiếu suy từ các mục. Kèm theo: trưởng phòng / Người duyệt chi **quyết nhiều mục của cùng phiếu trong một lần** với **một** checklist (`QĐ-115ab`,
`QĐ-116e`); rút cả phiếu hoặc từng mục (`QĐ-115ac`); kiểm ngân sách **theo thứ tự mục** (`QĐ-116az`(2), `QĐ-117k`); **ghi chú trả lời bắt buộc khi gửi
lại / trình lại sau _Trả về_ của người** (`QĐ-114q`, `QĐ-116az`(3), `QĐ-116f`).

**Thành công** khi: mỗi mục W4-xx có test chứng minh tiêu chí (unit đỏ trước; integration/http **chạy thật** trên Docker của làn `tech` hoặc CI GitHub, không
viết mù); Request đơn lẻ, Request nhóm, lô chi không đổi hành vi (trừ chỗ ghi **Phá vỡ** ở [§8.2](#82-operation-đổi)) — chứng minh bằng spec đặc tả hành vi
hiện có (T1) xanh trước và sau refactor; bộ kiểm nhanh xanh từng gói; CI GitHub full xanh trên `int/redesign-w4` (trừ dòng `FIX-TEST-*.md`);
`prisma migrate diff` không drift.

## 2. Phạm vi

### 2.1. Trong phạm vi

Bảng [§3](#3-bảng-mục-w4-xx).

### 2.2. Ngoài phạm vi

| Việc                                                                                                                         | Đợt / lý do                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Xác nhận lần hai** khi trả lời _Có_ trái kết quả hệ thống kiểm (`QĐ-115aj`), đối chiếu câu có luật dữ liệu `1.2-08`/`1.7-08` (`QĐ-116a`), _x/y_ (`QĐ-117d`), mobile hiện cặp lệch (`QĐ-116ab`), cờ cho Finance (`QĐ-116aa`) | **Đợt 5** (`QĐ-118a`). Ranh giới: [§7.13](#713-ranh-giới-với-đợt-5-xác-nhận-lần-hai-ai) |
| Phân tích AI phiếu nhiều gói (so hai lý do — `QĐ-115ae`(4), `QĐ-115al`)                                                      | Đợt 5                                                                                        |
| Request tiếp tục nhóm; **tách dòng** Request nhóm của người vừa thành trưởng phòng (`QĐ-118c`(1)(2), `QĐ-118o`)              | **Bỏ** (`QĐ-118c`) — dòng ở lại Request nhóm như hiện có                                     |
| Case B, Request tiếp tục, Request nhóm, `K5` trong phiếu                                                                     | Không vào phiếu (`QĐ-115aa`, `QĐ-115ad`)                                                     |
| Thay lô của trưởng phòng bằng phiếu ở bước duyệt chi (Request hai bước vẫn theo lô)                                          | `US-05-25` _Out of scope_; `US-06-14`                                                        |
| Phiếu nháp; route kiểm trước phiếu; mobile gửi phiếu                                                                         | Không có QĐ (V3:259 chỉ đề xuất); `US-05-25` _Kênh: Web_                                     |
| Nút _Chọn tất cả thứ tôi chưa có_; đổi tên nút _Hỏi người xin_ → _Hỏi trưởng phòng_, câu hỏi điền sẵn                         | FE (BE không đổi: _Trả về_ ở 1.7 đã về hàng đợi trình của trưởng phòng)                      |
| Dọn cột chết `access_requests.delegated_batch_id`                                                                            | Không đụng (T-W4-1)                                                                          |
| Sửa User Stories/BRD/sơ đồ                                                                                                   | Docs, ngoài repo BE                                                                          |

### 2.3. Giả định

1. Đợt 3 (B1 + B2 + B3) đã squash vào `dev` khi tách `int/redesign-w4`; mọi luật giá/kho của đợt 3 áp cho từng mục **qua đường gửi Request đơn hiện có**
   (`RequestFactsService.assess`), đợt 4 không viết lại luật tiền.
2. Một mục = một dòng `access_requests` `type = GRANT`, `branch = PAID_IN_CATALOG`, một người thụ hưởng (chính người xin).
3. Dữ liệu demo dựng lại bằng seed sau đợt; migration chạy được trên DB demo (bảng mới, cột nullable — không backfill).

## 3. Bảng mục W4-xx

| Mục   | Nội dung                                                                                                   | Nguồn chính                                                          | Cỡ | Làn  | Gói          |
| ----- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -- | ---- | ------------ |
| W4-01 | Dữ liệu phiếu: bảng `request_tickets`, cột `ticket_id`/`ticket_position`; dạng đọc phiếu dùng chung        | `QĐ-115aa`, `US-05-25` AC-1, AC-4                                    | S  | biz  | B1           |
| W4-02 | Gửi phiếu: lỗi cấp phiếu trước, kiểm từng mục, tối đa 6, chỉ gói trả phí, trùng gói, GH-1/GH-2 theo mục, có vi phạm ⟹ không gửi mục nào | `QĐ-115aa`, `QĐ-115ac`, `QĐ-116e`, `QĐ-116az`(1), `QĐ-104b`, `QĐ-106g` | M | biz | B2a, B2b |
| W4-03 | Phiếu của trưởng phòng: mục một bước, kiểm ngân sách khi gửi theo thứ tự mục, mục bị chặn không phải vi phạm | `QĐ-116e`, `QĐ-116az`(2), `QĐ-117k`(1)                               | S  | biz  | B2b          |
| W4-04 | Xem phiếu, trạng thái suy ra; `ticketRef` trên chi tiết Request và các danh sách                           | `QĐ-115aa`, `US-05-25` AC-4, AC-10                                   | M  | tech+biz | T2, B5b  |
| W4-05 | Trưởng phòng quyết nhu cầu nhiều mục cùng phiếu, một checklist cho lần quyết (1.2)                         | `QĐ-115ab`, `US-05-04` AC-23                                         | M  | biz  | B3           |
| W4-06 | Người duyệt chi quyết nhiều mục cùng phiếu (Request một bước), một checklist (1.7)                         | `QĐ-116e`, `QĐ-115ab`, `US-06-01` AC-36                              | M  | biz  | B4a          |
| W4-07 | Mục cùng phiếu giữ thứ tự phiếu khi trình lô, khi chuyển một bước vì người xin thành trưởng phòng          | `QĐ-117k`(1)(2)(3), `QĐ-116az`(2), `QĐ-116c`                         | S  | biz  | B4b          |
| W4-08 | Rút cả phiếu (từng mục độc lập) và rút từng mục                                                            | `QĐ-115ac`, `QĐ-113d`, `US-05-08` AC-14                              | S  | biz  | B6           |
| W4-09 | Ghi chú trả lời khi người xin gửi lại sau _Trả về_ của người (mỗi mục một ghi chú)                         | `QĐ-114q`, `QĐ-116az`(3), `US-05-02` AC-24, `US-05-25` AC-10         | M  | biz  | B5a          |
| W4-10 | Ghi chú trả lời khi trưởng phòng trình lại Request bị Người duyệt chi _Trả về_ ở 1.7                        | `QĐ-116f`, `QĐ-114q`, `US-06-14` AC-24                               | S  | biz  | B5b          |
| W4-11 | Người quyết thấy ghi chú trả lời mới nhất (chi tiết Request, mục phiếu)                                    | `QĐ-114q`, `US-06-01` AC-35, `US-05-25` AC-10                        | S  | tech | T3           |
| W4-12 | Trưởng phòng rút mọi Request ở hàng đợi trình, lý do bắt buộc                               | `QĐ-116b`, `US-05-08` AC-15, `US-06-14` AC-23                        | S  | biz  | B6           |
| W4-13 | Mobile: 4 tác vụ với mục của phiếu (test, không route mới)                                                 | `QĐ-61b`, `QĐ-82l`(16), `QĐ-116ab`                                   | S  | tech | T4           |
| W4-14 | Ca biên tổ chức: người xin vừa thành trưởng phòng, phòng không có trưởng phòng, IT phụ trách (QĐ-118)       | `QĐ-116c`, `QĐ-110i`, `QĐ-118d`                                      | S  | biz+tech | B4b, T4  |
| W4-15 | Seed phiếu demo                                                                                            | `US-05-25` TS-1, TS-6                                                | S  | tech | T5           |
| W4-16 | Chốt đợt: generator, module card, bảng khóa (ngoại lệ E5)                                                   | `database-business.md`                                               | S  | mỗi làn | B7, T6    |

Tổng: **16 mục**. Chi tiết hành vi ở [§7](#7-hành-vi-đúng).

## 4. Từ vựng

| Từ                          | Nghĩa (wire / code)                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| _Phiếu_                     | `request ticket` · bảng `request_tickets` · vỏ bọc, **không** có số tiền, quyết định hay trạng thái lưu riêng                        |
| _Mục_                       | `ticket item` = một Request có `ticket_id`; vị trí `ticketPosition` 1…6 theo thứ tự người xin chọn                                  |
| `ticketRef`                 | tham chiếu phiếu trên operation của Request: `{ id, position, itemCount }` (khác `ticket` đầy đủ của operation phiếu; khác `operator.ticketId` của Super Admin) |
| _Lần quyết_                 | một lần gọi route quyết nhiều mục: một checklist được chấm một lần, ghi **một bản cho từng mục** đã quyết                            |
| _Trả về của người_          | bước đóng do **người** quyết _Trả về_: nhu cầu (`CLOSED` + approval `RETURNED`), đánh giá IT (bước `IT_ASSESSMENT` cuối đóng vì trả về), chi (`spend_decisions` `RETURNED`) — khác chặn/thiếu giá/kiểm lại của hệ thống |
| _Ghi chú trả lời_           | `reply note` · bảng `access_request_replies` · chữ thuần 1…1000 ký tự, trả lời **một** lần _Trả về của người_                        |
| _Vi phạm của mục_           | lỗi **của gói/mục** mà Request đơn sẽ bị từ chối khi gửi ⟹ cả phiếu không gửi                                                       |
| _Lỗi cấp phiếu_             | lỗi của người/phòng (chung mọi mục) ⟹ ném thẳng như Request đơn, **luôn thắng** vi phạm của mục                                     |
| _Kết cục của mục_           | điều Request đơn **vẫn được tạo** (bị chặn ngân sách, thiếu giá ở Request một bước, đứng chờ trưởng phòng) ⟹ mục vẫn tạo             |

## 5. Mô hình dữ liệu mới và migration

Migration cuối trên `dev` sau đợt 3 dự kiến `20261203000300_w3_personal_rights_allocations`. Đợt 4 dùng dải **`20261210…`** (`DB-15`); chỉ làn `biz`
viết migration.

**Cách viết (RT-11):** sửa `prisma/models/*.prisma` trước, sinh phần bảng/cột/FK/index bằng `pnpm exec prisma migrate diff --from-schema <bản schema trước,
lấy bằng git show vào thư mục tạm> --to-schema prisma --script` (không cần DB), dán vào file migration, rồi **thêm tay** CHECK, trigger, comment SQL đảo.
Theo quy ước repo: FK `"<bảng>_<cột>_fkey" … ON DELETE RESTRICT ON UPDATE CASCADE` (`onDelete: Restrict`), `@db.Timestamptz(3)`, id `@default(uuid())`
(không default DB). SQL dưới đây chỉ là **ý định**, không chép nguyên.

| #  | Migration                                    | Bảng/cột                                                                                                     | Hoàn tác được? | Rủi ro dữ liệu |
| -- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- | -------------- |
| M1 | `20261210000000_w4_request_tickets`          | `request_tickets` (+ trigger chỉ ghi thêm); `access_requests.ticket_id`, `ticket_position` + CHECK + unique + index + trigger bất biến | Có (drop) | Không |
| M2 | `20261210000100_w4_access_request_replies`   | enum `AccessRequestReplyKind`; bảng `access_request_replies` chỉ ghi thêm (trigger), index                   | Có (drop)      | Không          |

**M1** — model `RequestTicket` (`requests.prisma`) + hai trường ở `AccessRequest` + `@@unique([ticketId, ticketPosition])` (NULL khác nhau ⟹ Request đơn
không vướng; không cần partial index) + `@@index([ticketId])`; quan hệ ngược ở `organization.prisma`:

```text
request_tickets(id, organization_id → organizations, requester_employee_id → employees, department_id → departments,
                submitted_at timestamptz(3), created_at timestamptz(3) default now)
index (requester_employee_id, submitted_at desc, id)
access_requests + ticket_id → request_tickets (nullable), ticket_position smallint (nullable)
CHECK access_requests_ticket_pair            ((ticket_id IS NULL) = (ticket_position IS NULL))
CHECK access_requests_ticket_position_range  (ticket_position IS NULL OR ticket_position BETWEEN 1 AND 6)
CHECK access_requests_ticket_kind            (ticket_id IS NULL OR (type = 'GRANT' AND branch = 'PAID_IN_CATALOG'))
trigger BEFORE UPDATE OF ticket_id, ticket_position ON access_requests: đổi giá trị ⟹ RAISE (mục không rời/đổi phiếu)
trigger BEFORE UPDATE OR DELETE ON request_tickets ⟹ RAISE (phiếu chỉ ghi thêm)
```

- Không lưu trạng thái, số mục, số tiền trên phiếu (`QĐ-115aa`; `US-05-25` AC-4). Không mã hiển thị (OQ-W4-3 = A).
- `src/infrastructure/database/database-role-judgement.ts` `RUNTIME_TABLE_EXCEPTIONS`: thêm `request_tickets: ['INSERT', 'SELECT']` (tiền lệ bảng chỉ ghi
  thêm, dòng 14-40).

**M2** (`QĐ-114q`: "lưu kèm lần gửi lại để người quyết và AI so trước–sau"):

```text
enum AccessRequestReplyKind (REQUESTER_RESUBMISSION, HEAD_RESUBMISSION)
access_request_replies(id, organization_id → organizations, request_id → access_requests, kind,
                       returned_step_id → access_request_steps (NULLABLE),  -- bước Trả về của người mà ghi chú trả lời
                       note text CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
                       author_employee_id → employees, created_at timestamptz(3) default now)
index (request_id, created_at desc, id); index (returned_step_id)
trigger BEFORE UPDATE OR DELETE ⟹ RAISE (chỉ ghi thêm)
```

- **Không** unique trên `returned_step_id` (RB-1, RT-1, RT-2): ràng buộc "một lần trả về một ghi chú" là luật ở service (§7.9, §7.10), không để DB ném
  23505 trên luồng thật. `returned_step_id` nullable cho ghi chú tự nguyện khi không có lần _Trả về của người_ nào chờ trả lời (§7.9 bước 4).
- `RUNTIME_TABLE_EXCEPTIONS`: thêm `access_request_replies: ['INSERT', 'SELECT']`. Migration **không** nêu tên vai DB; comment đầu file ghi SQL đảo;
  không down migration (`DB-05`). Sau mỗi migration `pnpm prisma:validate && pnpm prisma:generate` và tự kiểm drift (PLAN — bộ kiểm nhanh).

## 6. Kiến trúc

### 6.1. Capability (module `requests`, theo `docs/rules/module-structure.md`)

| Capability                           | Loại                      | File chính (`m/requests/…`)                                                                                         | Ghi chú |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------- |
| **mới** `request-ticket/`            | lõi, không controller     | `request-ticket.repo.ts` (`insert`, `view(ticketId)` một câu join gói + `latestReply`, `itemsOf`), `.types.ts`, `.policy.ts` (+spec), `.errors.ts`, `.http-errors.ts` (+spec), `.dto.ts` (`ticketSchema`, `ticketRefSchema`, kết quả từng mục, enum `reason`), `.mapper.ts` | writer duy nhất của `request_tickets`; mọi capability phiếu dùng chung dạng đọc (RT-7) |
| **mới** `request-reply/`             | lõi, không controller     | `request-reply.repo.ts` (`insert`, `latestOf`, `latestOfMany`), `request-reply.policy.ts` (+spec: bước _Trả về của người_ nào đang chờ trả lời), `.types.ts` | writer duy nhất của `access_request_replies` |
| **mới** `request-ticket-submission/` | có controller             | `request-tickets.controller.ts` (POST), `request-ticket-submission.service.ts` (+spec), `request-ticket-precheck.service.ts` (+spec) | gọi `request-intake` (không controller — được import) |
| **mới** `request-ticket-view/`       | có controller             | `request-ticket-view.controller.ts` (GET), `request-ticket-view.service.ts` (+spec)                                   | làn `tech`; lọc mục theo `canViewRequest`, tính `status` |
| `need-decision/` (sửa)               | có controller             | **mới** `ticket-need-decisions.controller.ts`, `ticket-need-decision.service.ts` (+spec); `need-decision.service.ts` thêm tham số `judged?` | khuôn `SpendDecisionService.decide(actor, id, input, judged?)` (RT-17) |
| `spend-approval/` (sửa)              | có controller             | **mới** `ticket-spend-decisions.controller.ts`, `ticket-spend-decision.service.ts` (+spec), `spend-item-outcome.policy.ts` (+spec, **thuần**) | `withoutOpenStep`, `returnGroup` ở lại `spend-batch-decision.service.ts` |
| `withdraw/` (sửa)                    | có controller             | **mới** `ticket-withdrawals.controller.ts`, `ticket-withdrawal.service.ts` (+spec)                                   | gọi `WithdrawalService` từng mục |
| `request-intake/` (sửa)              | không controller          | `access-request.service.ts` tách _kiểm cấp người/phòng_ / _kiểm mục_ / _ghi_ / _định tuyến_; `access-request-submission.mapper.ts` (`ticket`); `request-resubmission.service.ts`; **mới** `request-resubmission.dto.ts` | refactor giữ mọi lần kiểm |
| `spend-submission/` (sửa)            | có controller             | `spend-batch.service.ts`, `spend-queue.service.ts`; **mới** `spend-batch-order.policy.ts` (+spec)                    | thứ tự xử lý, ghi chú trình lại, `ticketRef`/`replyNoteRequired` ở hàng đợi |
| `step-routing/`, `reassignment/` (sửa) | không controller / có controller | `step-routing/step-reassignment.repo.ts` (đọc `ticket`), `reassignment/step-reassignment.service.ts` / `one-step-conversion.service.ts` | thứ tự kiểm khi chuyển một bước — làn `biz` (RT-8) |

- Thư mục `access-request/`, `group-request/`, `spend/`, `assessment/` đã đủ **25 file**: chỉ sửa, không thêm file.
- Không cạnh module mới, không extension point mới. Cần cạnh khác ⟹ **dừng hỏi**.

### 6.2. Thứ tự khóa

Bảng chuẩn ở `docs/rules/database-business.md` mục _Thứ tự khóa chuẩn_ (bản sau đợt 3 P23). Đợt 4 **không thêm tầng**:

| Luồng                                  | Đường khóa                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gửi phiếu (một tx, **hai pha** — RT-4) | **Kiểm cấp phiếu:** employee `FOR SHARE` (1) → advisory `requests.limits:<emp>` (2) → đơn vị đã bắt đầu, Cost Center, department `FOR SHARE` (2). **Kiểm mục** (đọc). **Pha 1:** chèn `request_tickets`, rồi chèn **mọi** mục theo `position` (Request + bước nhu cầu + audit) — mọi khóa FK ngầm (`FOR KEY SHARE` trên `plans`, `departments`, `cost_centers`…) lấy ở đây, trước CC-year. **Pha 2:** `SpendRoutingService.start` từng mục theo `position` (Request vừa chèn (4), reprice, CC-year (10)) |
| Quyết nhiều mục 1.2 / 1.7              | chấm checklist (không khóa) → **mỗi mục một tx** với đường khóa của quyết lẻ; không khóa phiếu                                                                          |
| Rút cả phiếu                           | mỗi mục một tx: tác vụ cấp (3a) → Request (4) như `withdraw/withdrawal-preconditions.service.ts:41-42`                                                                  |
| Trình lô có mục cùng phiếu             | `lockAll` theo id (4) **không đổi**; chỉ đổi **thứ tự xử lý** sau khi đã giữ khóa                                                                                       |
| Chuyển một bước (người xin thành trưởng phòng) | khóa không đổi; thứ tự kiểm ngân sách các mục cùng phiếu theo `ticket_position`                                                                                 |
| Gửi lại / trình lại kèm ghi chú        | như hiện có (Request (4) trước CC-year (10)); chèn `access_request_replies` không chờ khóa                                                                              |

- **Ngoại lệ E5 (mới, B7 ghi vào rule):** ở gửi phiếu, sau CC-year (10) của mục _k_, tx **chỉ** làm đúng các thao tác của `SpendRoutingService.route` cho
  mục _k+1_ (khóa Request do **chính tx chèn ở pha 1**, reprice, ghi dòng của Request đó, `budget_checks`, bước chi, grant Người duyệt chi `FOR SHARE`).
  An toàn vì Request chưa commit không tx nào khác thấy/chờ được, và mọi khóa FK đã lấy ở pha 1. Điều kiện bắt buộc ghi ở `DELTA-W3-FINAL.md`: sau đợt 3,
  `RepricingService.reprice`/`priceFor` **không** khóa dòng nào đã commit (lô `K4`, sổ seat…); có ⟹ dừng hỏi.
- Luồng tranh chấp mới có integration 2 connection, barrier, lặp 20, không `40P01` ([§11.3](#113-đồng-thời)).
- Comment đầu mỗi service mới ghi thứ tự khóa của nó.

## 7. Hành vi đúng

Nhân vật (theo `US-05-25`): `E1` nhân viên phòng `P-DES` (Cost Center `CC-DES`); `H1` trưởng phòng `P-DES`; `C1` Người duyệt chi; `IT1` IT Admin phụ trách
`P-DES`; `IT2` IT Admin phụ trách các phòng khác; GH-2 `weeklyLimit` = 10. Mỗi ca là test **bắt buộc**.

### 7.1. W4-01 Dữ liệu phiếu

- **Nguồn:** `QĐ-115aa`; `US-05-25` AC-1, AC-4. **Hiện trạng:** chưa có khái niệm phiếu; `access_requests.plan_id` một gói
  (`prisma/models/requests.prisma:162-283`); `delegated_batch_id` không file nào đọc/ghi.
- **Hành vi đúng:** M1 ở §5. `AccessRequestRecord` (`access-request/access-request.types.ts`) thêm `ticket: { id, position, itemCount } | null`, đọc ở
  `access-request/access-request-record.mapper.ts` (`SELECT_REQUEST` dòng 10, `toRecord` dòng 150; `itemCount` qua `_count` của quan hệ phiếu — một câu, RT-8).
  `AccessRequestRepo.insert` nhận `ticket?: { id, position }` (writer duy nhất giữ nguyên). `RequestTicketRepo.view(ticketId)`: phiếu + mục (id, position,
  state, routingMode, termMonths, plan id/name) + `latestReply` mỗi mục, một câu, sắp `ticket_position`.
- **Tiêu chí:** (1) integration: CHECK `ticket_pair`, `ticket_position_range`, `ticket_kind` (Request `GROUP_GRANT` có `ticket_id` ⟹ 23514); (2) unique
  `(ticket_id, ticket_position)` ⟹ 23505; (3) trigger: `UPDATE access_requests SET ticket_id = …` ⟹ lỗi; `UPDATE/DELETE request_tickets` ⟹ lỗi;
  (4) Request đơn cũ `ticket = null` (unit mapper).

### 7.2. W4-02 Gửi phiếu

- **Nguồn:** `QĐ-115aa`, `QĐ-115ac`, `QĐ-116e`, `QĐ-116az`(1), `QĐ-104b`, `QĐ-106g`; `US-05-25` AC-1 → AC-3, AC-5, AC-8; `US-05-22` AC-13.
- **Hiện trạng:** `request-intake/access-request.service.ts:63-136` gửi **một** Request, ném lỗi ở vi phạm đầu tiên rồi chèn. `assess`
  (`access-request/request-facts.service.ts` ~162-175) kiểm theo thứ tự: đơn vị đã bắt đầu (`NOT_STARTED`/`NO_DEPARTMENT`) → gói (`PLAN_NOT_FOUND`,
  `APPLICATION_RETIRED`, `PLAN_BOUND_TO_DEVICE`) → Cost Center (`FINANCE.SETUP_INCOMPLETE`) → khóa phòng. GH-1/GH-2 ở `request-limits/request-limits.policy.ts`.
- **Hành vi đúng:**
  1. Route mới `POST /request-tickets`, thân `{ items: [{ planId, businessReason, termMonths? }] }` (mỗi mục cùng trường/ràng buộc của `submitBodySchema`,
     `access-request/access-request.dto.ts:32`). Zod biên kỹ thuật `items` 1…20; mô tả OpenAPI ghi "tối đa 6 mục; 7…20 mục trả lỗi riêng, hơn 20 là thân sai"
     (RB-10, RT-18 — chấp nhận hai mã, ghi rõ).
  2. **Lỗi cấp phiếu — kiểm một lần, trước vòng mục, luôn thắng (RT-5):** Super Admin (`ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` 403), bên bị loại
     (`REQUEST_PARTY.INELIGIBLE` 422), chưa xếp phòng / chưa tới ngày bắt đầu (`ACCESS_REQUEST.NO_DEPARTMENT`, `EMPLOYEE.NOT_STARTED` 409), phòng không có Cost
     Center hiện hành (`FINANCE.SETUP_INCOMPLETE`, cùng status như Request đơn), thân sai (422 `VALIDATION_ERROR` — gồm mục thiếu `businessReason`, path
     `items.<i>.businessReason`), **quá 6 mục** (422 `REQUEST_TICKET.TOO_MANY_ITEMS`, `details: { max: 6, count }`), không có lỗi số mục tối thiểu (phiếu 1 mục hợp lệ — OQ-W4-1 = A). Refactor: phần kiểm người/phòng của `assess` chạy một lần (B2a).
  3. **Kiểm từng mục** theo `position` (= chỉ số + 1). Vòng mục chỉ bắt **đúng** các lớp lỗi của gói/mục: `AccessRequestPlanNotFoundError`,
     `AccessRequestApplicationRetiredError`, `AccessRequestPlanBoundToDeviceError`, `AccessRequestNotPriceableError` (nếu `assess` ném),
     `AccessRequestAlreadyHoldsAccessError`, `AccessRequestTermRefusedError`; lớp khác ⟹ ném lên (lỗi cấp phiếu/lập trình). Mỗi mục nhận **lý do đầu tiên** theo
     thứ tự: lỗi của gói → `NOT_PAID_IN_CATALOG` (mới: `branch ≠ PAID_IN_CATALOG`, `QĐ-115aa`, `QĐ-115ad`) → `HAS_ACCESS` → `TERM_*` → `HAS_OPEN_REQUEST` (GH-1
     với Request mở đã có) → `DUPLICATE_IN_TICKET` (mới: cùng `planId` với mục đứng trước; cùng ứng dụng khác gói thì hợp lệ — `QĐ-116az`(1)) →
     `OPEN_LIMIT_REACHED` (GH-2: mục _i_ bị nêu khi `sentThisWeek + (số mục đứng trước không bị nêu và không miễn) ≥ weeklyLimit`; mục miễn `TRANSFER_GRACE`,
     `ROLE_ENDED` không đếm). Từ vựng theo tiền lệ dòng Request nhóm (`group-request/group-request.dto.ts:38-50` `HAS_ACCESS`, `HAS_OPEN_REQUEST`, …) — RT-10.
  4. Có **ít nhất một mục bị nêu** ⟹ **không gửi mục nào**, 422 `REQUEST_TICKET.ITEMS_REFUSED`, `details.items: [{ position, planId, reason, duplicateOfPosition?,
     openRequestId?, resetsOn? }]` (enum `reason` đóng — §8.3), liệt kê **mọi** mục bị nêu, sắp `position`. Không gì được ghi.
  5. Không mục nào bị nêu ⟹ **pha 1** chèn `request_tickets` rồi mọi mục theo `position` (chèn Request với `ticket`, audit `ACCESS_REQUEST.SUBMITTED` +
     `NEED_STEP_ROUTED`); **pha 2** `SpendRoutingService.start` từng mục theo `position` — mọi kết cục của Request đơn giữ nguyên. Thêm một audit
     `REQUEST_TICKET.SUBMITTED` (resource `REQUEST_TICKET`, `after: { requestIds, planIds }`) — T-W4-2.
  6. Trả 201 `{ ticket }` (dạng `ticketSchema` của `request-ticket/`, cùng dạng `requestTicketGet`), message `REQUEST_TICKET.SUBMITTED`.
  7. Thông báo: giữ thông báo hiện có **của từng Request** (OQ-W4-4 = A).
- **Refactor (LUẬT CỨNG 2):** `AccessRequestService.submitWithin` tách _kiểm cấp người/phòng_, _kiểm mục_ (trả kết quả, không ném lỗi của mục), _ghi_, _định
  tuyến_; `submitWithin` = các phần theo thứ tự cũ, ném lỗi đầu tiên như cũ. Spec đặc tả của T1 xanh không đổi kỳ vọng.
- **Tiêu chí** (`it.each` ở `request-ticket.policy.spec.ts`, `request-ticket-precheck.service.spec.ts` + integration `request-ticket-submit.integration-spec.ts`):

| Ca | Given                                                       | When                                       | Then                                                                                     |
| -- | ----------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A  | `E1` chưa giữ gì, tuần đã gửi 0                              | phiếu Figma Org, Miro Business, Notion Plus | 201; 3 Request `ticketPosition` 1,2,3, bước nhu cầu giao `H1`; phiếu không số tiền (AC-1) |
| B  | như A                                                       | 7 mục                                      | 422 `REQUEST_TICKET.TOO_MANY_ITEMS` `{max:6,count:7}`, 0 Request; bỏ còn 6 ⟹ 201 (AC-5)   |
| C  | như A                                                       | mục 2 `businessReason: "  "`               | 422 `VALIDATION_ERROR` path `items.1.businessReason`, 0 Request (AC-2)                   |
| D  | gói `K5` nội bộ                                             | Figma + gói `K5`                           | 422 `ITEMS_REFUSED` `[{position:2, reason:NOT_PAID_IN_CATALOG}]` (AC-3)                   |
| E  | —                                                           | Figma Org — Full ×2                        | 422 `[{position:2, reason:DUPLICATE_IN_TICKET, duplicateOfPosition:1}]` (AC-8)           |
| F  | —                                                           | Figma Org — Full + Figma Org — Dev         | 201, 2 Request (AC-8)                                                                    |
| G  | `E1` đã gửi 8, đang giữ Figma                                | Miro, Notion, Figma                        | 422 `[{position:3, reason:HAS_ACCESS}]`; bỏ Figma ⟹ 201, GH-2 tuần = 10; phiếu 1 mục sau đó ⟹ 422 `[{position:1, reason:OPEN_LIMIT_REACHED}]` (`US-05-22` AC-13) |
| H  | `E1` đã gửi 9                                               | Miro, Notion                               | 422 `[{position:2, reason:OPEN_LIMIT_REACHED, resetsOn}]`                                 |
| I  | `E1` có Request Miro đang chờ                               | Miro, Notion                               | 422 `[{position:1, reason:HAS_OPEN_REQUEST, openRequestId}]`                             |
| J  | Super Admin                                                 | phiếu 2 mục                                | 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`                                          |
| K  | `P-DES` không có Cost Center hiện hành                      | Figma + Miro                               | lỗi cấp phiếu `FINANCE.SETUP_INCOMPLETE`, 0 Request                                       |
| K2 | `P-DES` không có Cost Center **và** mục 1 là gói `DEVICE_KEY` | gói `DEVICE_KEY` + Figma                 | `FINANCE.SETUP_INCOMPLETE` (lỗi cấp phiếu thắng — RT-5), không `ITEMS_REFUSED`           |
| L  | `P-DES` không có trưởng phòng (`QĐ-110i`)                   | phiếu 2 mục                                | 201; 2 Request `WAITING_CONTROLLED`, bước nhu cầu `WAITING` `NO_DEPARTMENT_HEAD`           |
| M  | gói `K4` `DEVICE_KEY`                                        | Figma + gói đó                             | 422 `[{position:2, reason:PLAN_BOUND_TO_DEVICE}]`                                        |

### 7.3. W4-03 Phiếu của trưởng phòng

- **Nguồn:** `QĐ-116e`, `QĐ-116az`(2), `QĐ-117k`(1); `US-05-25` AC-6, AC-9.
- **Hiện trạng:** người xin là trưởng phòng ⟹ `ONE_STEP` `REQUESTER_IS_HEAD` (`access-request/routing.policy.ts:35-45`); kiểm ngân sách ngay khi gửi; bị
  chặn/thiếu giá ⟹ `AWAITING_REQUESTER_REVISION`, **không mở bước nào** (`spend/spend-routing.service.ts:153-154, 182-187`). _Request đang chờ duyệt chi_ đọc
  từ DB (`spend/budget-check.repo.ts:191` `pendingFor`) ⟹ trong cùng tx, mục đã mở bước chi được đếm khi kiểm mục sau.
- **Hành vi đúng:** không luật mới ngoài **thứ tự** (pha 2 theo `position`). Mục bị chặn / thiếu giá là _kết cục_, không phải vi phạm. Chỉ mục **qua** kiểm tra
  (trong số cơ sở, hoặc dùng dự phòng — Request một bước sang Người duyệt chi kèm cờ) mới trừ vào _còn lại_ cho mục sau (`QĐ-117k`(1)).
- **Tiêu chí** (integration `request-ticket-head.integration-spec.ts`; số của `US-05-25` AC-9):

| Ca | Given (`CC-DES` năm nay)                         | When `H1` gửi                                      | Then                                                                                   |
| -- | ------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A  | còn lại cơ sở 3.000.000, dự phòng 0              | #1 Miro 2.000.000, #2 Notion 1.500.000              | #1 `AWAITING_SPEND_DECISION`; #2 `AWAITING_REQUESTER_REVISION` (bị chặn); 201          |
| B  | như A                                            | #1 Notion 1.500.000, #2 Miro 2.000.000              | #1 qua; #2 bị chặn (giết đột biến "không theo thứ tự")                                  |
| C  | còn lại cơ sở 3.500.000, dự phòng 0              | Miro, Notion                                       | cả hai qua (biên đúng bằng còn lại)                                                     |
| D  | như A                                            | Miro, Notion, #3 thiếu lý do                        | 422 `VALIDATION_ERROR`, 0 Request (vi phạm ≠ bị chặn — AC-6)                            |
| E  | ca A xong; `C1` từ chối #1                       | —                                                  | #2 **vẫn** `AWAITING_REQUESTER_REVISION`, không tự kiểm lại (`QĐ-117k`(2))              |
| F  | còn lại cơ sở 2.000.000, dự phòng 1.500.000      | #1 Miro 2.000.000, #2 Notion 1.500.000, #3 Slack 500.000 | #1 qua số cơ sở; #2 dùng dự phòng ⟹ `AWAITING_SPEND_DECISION` kèm cờ dự phòng (đã trừ); #3 bị chặn vì #2 đã trừ (RB-4, `QĐ-117k`(1)) |
| G  | ca A xong (#2 bị chặn, chưa từng bị trả về)      | `H1` gửi lại #2 **không** ghi chú                   | 200 (không đòi ghi chú — §7.9), #2 kiểm lại                                            |

### 7.4. W4-04 Xem phiếu và tham chiếu phiếu

- **Nguồn:** `QĐ-115aa`; `US-05-25` AC-4, AC-10. V3:243-249 đề xuất 5 nhãn — **chưa thành QĐ**; dùng hai giá trị của AC-4 (T-W4-3).
- **Hành vi đúng:**
  - `GET /request-tickets/{id}` (T2): thấy phiếu khi người gọi xem được **ít nhất một** mục theo `canViewRequest`; không ⟹ 404 `REQUEST_TICKET.NOT_FOUND`.
    `items` chỉ gồm mục xem được, sắp `position`, mỗi mục có `latestReply` (§7.11, RB-6). `status` tính trên **mọi** mục: `DONE` khi mọi mục ở `ENDED_STATES`
    (`access-request/access-request.types.ts:273`: `REJECTED`, `IT_REJECTED`, `COMPLETED`, `FAILED`, `WITHDRAWN`, `CANCELLED`), ngược lại `IN_PROGRESS`.
    **Chấp nhận** (RB-11): người chỉ xem được một phần vẫn thấy `status`/`itemCount` của cả phiếu — cùng người xin, cùng phòng, không lộ nội dung mục.
  - Thêm (chỉ thêm trường) `ticketRef: { id, position, itemCount } | null` vào: `accessRequestGet`, mục của `meAccessRequestList`, `needDecisionList`,
    `spendApprovalList` (T2); `spendQueueList`, `spendBatchItemList` (B5b — file làn `biz`, RB-5).
  - Mảng lồng có biên: `ticket.items` (≤ 6, Zod `.max(6)`, CHECK M1). Đăng ký ở **`test/support/api-collection-registry-nested-w4.ts`** + sự kiện
    `test/support/api-collection-registry-events-w4.ts` (`registry: 'nested', change: 'added', to: 'bounded'`), nối vào `api-collection-registry-nested.ts` /
    `-events.ts`; key **`requestTicketSubmit#ticket.items`** (B2b) và **`requestTicketGet#ticket.items`** (T2); `businessMaximum.source` = CHECK
    `access_requests_ticket_position_range` + `MAX_TICKET_ITEMS` (RT-6). `results` của #3/#4/#5 (≤ 6) đăng ký theo tiền lệ `spendBatchDecide` (người code tra
    registry; gate đòi ⟹ thêm cùng file w4). Owner **đã duyệt** hai mục `NESTED_ARRAYS` này (OWNER-ANSWERS); gate vẫn từ chối ⟹ dừng hỏi (phương án subresource phân trang).
- **Tiêu chí:** (1) `R1` cấp xong, `R2` bị từ chối, `R3` chờ duyệt chi ⟹ `IN_PROGRESS`, 3 mục kèm `state`; `R3` từ chối ⟹ `DONE` (AC-4); (2) `IT2` (không xem
  được mục nào) ⟹ 404; (3) `H1` thấy đủ 3 mục; (4) Request đơn ⟹ `ticketRef: null` ở mọi operation trên.

### 7.5. W4-05 Trưởng phòng quyết nhu cầu nhiều mục (1.2)

- **Nguồn:** `QĐ-115ab`; `US-05-04` AC-23. **Hiện trạng:** `need-decision/need-decision.service.ts:51-102` quyết **một** Request (khóa, `checkNeedDecision`,
  chấm checklist `1.2`, ghi một bản). Khuôn nhiều mục: `spend-approval/spend-batch-decision.service.ts` (W1-16).
- **Hành vi đúng:**
  1. Route mới `POST /request-tickets/{id}/need-decisions`, thân `{ requestIds: uuid[] (1…6, không trùng), decision: APPROVE|REJECT|RETURN, reason?, checklist }`
     (T-W4-4: FE chọn sẵn mọi mục còn chờ).
  2. Phiếu người gọi không xem được ⟹ 404 `REQUEST_TICKET.NOT_FOUND`. Chấm checklist `1.2` **một lần** trước mọi mục (lỗi `POLICY.*` ⟹ không ghi gì): có _Không_
     ⟹ _Duyệt_ bị khóa như quyết lẻ; _Từ chối_ / _Trả về_ chỉ áp **các mục đã chọn**.
  3. `NeedDecisionService.decide(actor, id, input, judged?)` (thêm tham số như `SpendDecisionService.decide` — RT-17; không `judged` ⟹ tự chấm như cũ). Mục của
     phiếu theo **`ticket_position`**, **mỗi mục một tx**, ghi checklist **một bản cho mục đó** trong tx của mục.
  4. `results`: trước hết id **thuộc phiếu** theo `position`, sau đó id **không thuộc phiếu** theo thứ tự thân (`SKIPPED NOT_IN_TICKET`). Mục thuộc phiếu mà
     người gọi không xem được (`AccessRequestNotFoundError`) ⟹ `SKIPPED NOT_IN_TICKET` (không lộ tồn tại). Enum `reason` đóng ở §8.3. `ALREADY_DECIDED`: bước nhu
     cầu mới nhất của mục (`needSteps` trong record) đã do chính người gọi quyết cùng quyết định ⟹ outcome đó, không ghi. Lỗi DB tạm thời ⟹ `RETRYABLE`. Trả 200
     `{ results }`.
  5. Hiệu ứng sau quyết định (hàng đợi trình, thông báo, audit) là của quyết lẻ, từng mục.
- **Tiêu chí** (`ticket-need-decision.service.spec.ts` `it.each` + integration `request-ticket-need-decision.integration-spec.ts`):

| Ca | Given                                               | When `H1`                                     | Then                                                                                    |
| -- | --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| A  | `PH-1` = `R1`,`R2`,`R3` chờ `H1`                     | chọn `R1`,`R2`, mọi câu _Có_, duyệt           | `R1`,`R2` `APPROVED` → `AWAITING_SPEND_SUBMISSION`; 2 dòng `decision_checklists` cùng bộ trả lời; `R3` vẫn chờ (AC-23) |
| B  | ca A xong                                           | chọn `R3`, một câu _Không_, `APPROVE`         | 422 `POLICY.CHECKLIST_HAS_NO`, không ghi                                                |
| C  | ca A xong                                           | chọn `R3`, một câu _Không_, `RETURN`          | chỉ `R3` `RETURNED` → `AWAITING_REQUESTER_REVISION`                                     |
| D  | ca A xong                                           | gửi lại đúng thân ca A                        | `R1`,`R2` `APPROVED` + `ALREADY_DECIDED`, không ghi thêm                                |
| E  | `R2` đã rút                                         | chọn `R1`,`R2`                                | `R1` `APPROVED`; `R2` `SKIPPED STEP_NOT_PENDING`                                        |
| F  | `requestIds` có id của phiếu khác                   | —                                             | id đó `SKIPPED NOT_IN_TICKET`, đứng **sau** các mục của phiếu                           |
| G  | `H2` xem được nhưng không giữ bước                  | chọn `R1`                                     | `SKIPPED NOT_THE_ASSIGNEE`                                                              |
| H  | thân `requestIds` [`R2`,`R1`]                       | duyệt                                         | xử lý và trả `R1` trước `R2`                                                            |

### 7.6. W4-06 Người duyệt chi quyết nhiều mục cùng phiếu (1.7)

- **Nguồn:** `QĐ-116e`, `QĐ-115ab`; `US-06-01` AC-36; `US-05-25` AC-7, _Out of scope_ (Request hai bước vẫn theo lô).
- **Hiện trạng:** quyết lẻ `spend-approval/spend-decision.service.ts`; lô `spend-batch-decision.service.ts:55-158` (_Trả về_ lấy **mọi** Request người gọi giữ;
  kiểm lại ra bị chặn luôn trả `RECHECKED_RETURNED_TO_HEAD` ở dòng 104 dù kết quả `BOUNCED` có `to: 'REQUESTER' | 'HEAD'` — `spend-decision.service.ts:182-190`).
- **Hành vi đúng:**
  1. Route mới `POST /request-tickets/{id}/spend-decisions`, thân như W4-05 (checklist bước `1.7`). Chấm một lần; từng mục theo `position`, mỗi mục một tx qua
     `SpendDecisionService.decide(actor, id, input, judged)`.
  2. Chỉ mục **Request một bước** (`routing_mode = ONE_STEP`); mục hai bước ⟹ `SKIPPED USE_BATCH`. Mục của phiếu khác / không xem được ⟹ `NOT_IN_TICKET`.
  3. _Trả về_ chỉ áp **mục đã chọn**; Request một bước trả về thẳng người xin (`QĐ-116f` vế cuối).
  4. `spend-item-outcome.policy.ts` (**thuần**: lỗi/kết quả → `{ outcome, reason }`) dùng chung với lô: `BOUNCED` ánh xạ theo `result.to` ⟹ phiếu một bước ra
     `RECHECKED_RETURNED_TO_REQUESTER` (mới); **lô giữ đúng hành vi hiện có** (`RECHECKED_RETURNED_TO_HEAD` như dòng 104 — policy nhận cờ ngữ cảnh "lô" để giữ;
     spec lô cũ xanh không đổi kỳ vọng). `withoutOpenStep`, `returnGroup` ở lại service lô.
- **Tiêu chí:** (A) `PH-3` của `H1`: `R21`,`R22`,`R23` chờ `C1`; chọn `R21`,`R22`, một checklist, duyệt ⟹ 2 `APPROVED`, 2 khoản cam kết, 2 dòng checklist; `R23`
  chờ (AC-36); (B) thêm `R1` của `PH-1` ⟹ `R1` `NOT_IN_TICKET`; (C) mục hai bước của phiếu nhân viên ⟹ `USE_BATCH`; (D) `RETURN` `R21` ⟹ chỉ `R21` về
  `AWAITING_REQUESTER_REVISION` của `H1`; (E) kiểm lại lúc duyệt `R22` ra vượt ⟹ `SKIPPED RECHECKED_RETURNED_TO_REQUESTER`, `R21` vẫn duyệt; (F) gửi lại ⟹
  `ALREADY_DECIDED`; (G) spec lô: ca kiểm lại vẫn `RECHECKED_RETURNED_TO_HEAD`.

### 7.7. W4-07 Thứ tự mục cùng phiếu ở lô và khi chuyển một bước

- **Nguồn:** `QĐ-117k`(1)(3) "trong lô, các mục cùng phiếu giữ thứ tự của phiếu"; `QĐ-116az`(2); `QĐ-116c`.
- **Hiện trạng:** `spend-submission/spend-batch.service.ts:73-140`: `lockAll` theo id, `sendOn` theo **thứ tự thân**, rồi `batches.create(items)` và
  `recorder.submitted({ requestIds, outcomes, openedFor })` (dòng 130-136) — ba mảng song song theo thứ tự thân/vòng lặp. Chuyển một bước:
  `reassignment/step-reassignment.service.ts` (`convertQueuedSpend`, dòng 369), `reassignment/one-step-conversion.service.ts`, tập Request đọc ở
  `step-routing/step-reassignment.repo.ts:251-254`.
- **Hành vi đúng:**
  - Lô: sau `lockAll`, **thứ tự xử lý** do `spend-batch-order.policy.ts`: các ô trong thân do mục của **cùng một phiếu** chiếm được điền lại bằng chính các
    mục đó theo `position` tăng; Request không thuộc phiếu giữ ô. Sau vòng xử lý, **sắp lại mọi mảng về thứ tự thân** trước khi dùng: `results` trả về,
    `batches.create.items` (`position` của lô), `recorder.submitted` (`requestIds`/`outcomes`/`openedFor` luôn khớp từng cặp) — RB-3, RT-9.
  - Chuyển một bước nhiều mục của cùng phiếu trong một sự kiện: kiểm ngân sách theo `position` (khóa vẫn theo id, đã giữ trước); `ReassignableRequest` mang
    `ticket` (đọc ở `step-reassignment.repo.ts`).
  - `QĐ-117k`(1): mục cần dự phòng mà trưởng phòng chưa xác nhận (`RESERVE_CONFIRMATION`) **không** trừ cho mục sau; (2): mục đã qua rồi bị _Trả về_ / _Từ
    chối_ / rút ⟹ thôi tính ngay (hành vi `pendingFor`), không kiểm lại mục khác.
- **Tiêu chí:** `it.each` thứ tự: [`R3`(PH1#3), `X`, `R1`(PH1#1)] ⟹ xử lý [`R1`, `X`, `R3`]; [`A`(PH1#2), `B`(PH2#1), `C`(PH1#1)] ⟹ [`C`, `B`, `A`]; không
  phiếu ⟹ giữ nguyên. Integration `spend-batch-ticket-order.integration-spec.ts`:
  - (a) dự phòng 0, còn lại 3.000.000: `H1` trình [`Notion` #2 1.500.000, `Miro` #1 2.000.000] ⟹ `Miro` `SENT_TO_APPROVER`, `Notion` `STOPPED`; `results` theo
    **thứ tự thân** ([`Notion`, `Miro`]); audit `requestIds[i]` khớp `outcomes[i]`.
  - (b) còn lại cơ sở 2.000.000, dự phòng 1.000.000, không xác nhận dự phòng: [#1 Miro 2.500.000, #2 Notion 1.500.000] ⟹ #1 `AWAITING_RESERVE_CONFIRMATION`
    (không trừ), #2 kiểm **không** tính #1 ⟹ qua số cơ sở `SENT_TO_APPROVER` (RB-4).
  - Integration `request-ticket-head-conversion.integration-spec.ts` (RB-9): `E5` có `R11` (#2 Notion 1.500.000, **đứng chờ**) và `R12` (#1 Miro 2.000.000, ở
    **hàng đợi trình**), còn lại 3.000.000, dự phòng 0; Super Admin gán `E5` làm trưởng phòng ⟹ `R12` kiểm trước, qua; `R11` bị chặn (`US-05-04` AC-26).

### 7.8. W4-08 Rút cả phiếu, rút từng mục

- **Nguồn:** `QĐ-115ac`, `QĐ-113d` (rút được khi _Trả về bổ sung_ ở bất kỳ bước nào); `US-05-08` AC-14. V3:266 "mỗi mục một transaction" khớp AC-14.
- **Hiện trạng:** `POST /access-requests/{id}/withdraw` (`withdraw/withdrawal.controller.ts:41`, `access-request/withdrawal.policy.ts:52-80, 97`); GH-2 vẫn đếm
  Request đã rút.
- **Hành vi đúng:**
  - Rút **từng mục** = route Request hiện có, không đổi.
  - Rút **cả phiếu**: route mới `POST /request-tickets/{id}/withdrawal`, thân `{ reason? }`. Chỉ **người xin**; người khác xem được ⟹ 403
    `REQUEST_TICKET.NOT_REQUESTER`; không xem được ⟹ 404. Mỗi mục theo `position`, **một tx**, qua `WithdrawalService`: `WITHDRAWN` / `SKIPPED` với lý do sẵn có
    (`WITHDRAWAL_AFTER_DECISION`, `ALREADY_ENDED`, `WITHDRAWAL_PENDING`, `GRANT_RUNNING`, `GRANT_COMPLETED`) / `RETRYABLE`. **Idempotent (RT-17):** mục đã
    `WITHDRAWN` do chính người gọi rút ⟹ `WITHDRAWN` + `ALREADY_WITHDRAWN`, không ghi. Trả 200 `{ results }`.
- **Tiêu chí:** (A) `PH-1`: `R1` đã được `H1` duyệt nhu cầu, `R2`,`R3` chưa quyết; `E1` rút `R2` (route mục) ⟹ `R2` `WITHDRAWN`, phiếu `IN_PROGRESS`; (B) rút cả
  phiếu ⟹ `R3` `WITHDRAWN`, `R1` `SKIPPED WITHDRAWAL_AFTER_DECISION`, `R2` `WITHDRAWN ALREADY_WITHDRAWN` (AC-14); (C) `H1` gọi ⟹ 403; (D) mục
  `WAITING_CONTROLLED` rút được; (E) GH-2 vẫn đếm mục đã rút; (F) mục đã bị `H1` _Trả về_ cho người xin (đã có một quyết định) ⟹ `WITHDRAWN` (RB-7); (G) gọi lại
  rút cả phiếu ⟹ không ghi thêm.

### 7.9. W4-09 Ghi chú trả lời khi người xin gửi lại

- **Nguồn:** `QĐ-114q` "Gửi lại Request **bị _Trả về_** bắt buộc kèm **một ghi chú trả lời** … (chữ thuần, không tệp), lưu kèm lần gửi lại"; `QĐ-116az`(3);
  `QĐ-116c` (kiểm lại ra bị chặn ⟹ như Request một bước bị chặn); `US-05-02` AC-24; `US-05-25` AC-10.
- **Hiện trạng:** `POST /access-requests/{id}/resubmission` **không có thân** (`request-submission/access-requests.controller.ts:147-180`,
  `request-intake/request-resubmission.service.ts:41-57`); route này **cũng** phục vụ Request một bước bị chặn/thiếu giá/kiểm lại ra bị chặn chưa từng bị ai
  trả về (`test/integration/requests/one-step-request.integration-spec.ts:68-85`, `one-step-supplement-rate.integration-spec.ts:22`).
- **Hành vi đúng (RB-1, RB-2, RT-1):**
  1. Thân `{ replyNote?: string trim 1…1000 }` — **optional** ở Zod (route không thân vẫn hợp lệ về dạng).
  2. **Lần _Trả về_ đang chờ trả lời** (`request-reply.policy.ts`, thuần): bước _Trả về của người_ **mới nhất** của Request (nhu cầu: `CLOSED` + approval
     `RETURNED`, `request-resubmission.service.ts:19-20`; đánh giá IT: bước `IT_ASSESSMENT` cuối đóng vì trả về, `access-request/access-request.repo.ts:160-167`
     `assessmentSentBack`; chi: `spend_decisions` `RETURNED`, `spend-effects/spend-effects.service.ts:216`) mà **chưa** có dòng `access_request_replies` gắn
     `returned_step_id` đó. Không có ⟹ không lần nào chờ.
  3. Có lần chờ mà thiếu `replyNote` ⟹ 422 **`ACCESS_REQUEST.REPLY_NOTE_REQUIRED`** (mã riêng, `details: { returnedStepId }`), Request không đổi. Có ghi chú ⟹ trong
     tx gửi lại (sau `NOT_REQUESTER`, `NOT_AWAITING_REVISION` như cũ) chèn reply `REQUESTER_RESUBMISSION` gắn `returned_step_id` đó; audit
     `ACCESS_REQUEST.RESUBMITTED` thêm `replyId`.
  4. Không có lần chờ (bị chặn ngân sách, thiếu giá, kiểm lại ra bị chặn, hoặc lần trả về đã được trả lời rồi Request bị hệ thống chặn lại) ⟹ **không** đòi ghi
     chú; `replyNote` có thì lưu với `returned_step_id = null` (T-W4-10), không có thì gửi lại như cũ.
  5. Áp mọi Request bị _Trả về_ của người (đơn, mục phiếu, Request nhóm, case B). Nhiều mục bị trả về cùng lúc: mỗi mục gửi lại bằng route của nó với ghi chú riêng
     (T-W4-5). Mobile: gửi lại giữ ở web (`QĐ-116ab`).
- **Tiêu chí** (`request-reply.policy.spec.ts` `it.each` ba loại bước + integration `request-resubmission-reply.integration-spec.ts`): (A) `R3` bị `H1` trả về; gửi
  lại không ghi chú ⟹ 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`, Request không đổi; (B) `replyNote: "dùng cho dự án X, 3 tháng"` ⟹ 200, một reply gắn bước nhu cầu,
  bước nhu cầu mới (AC-24); (C) hai mục `PH-1` trả về, gửi lại mỗi mục một ghi chú ⟹ 2 reply đúng `request_id` (AC-10); (D) Request một bước **chỉ bị chặn** (7.3 ca
  G) gửi lại không ghi chú ⟹ 200; (E) Request một bước bị `C1` trả về → gửi lại có ghi chú → kiểm ngân sách ra **bị chặn** → gửi lại lần hai **không** ghi chú ⟹ 200,
  không 23505, vẫn một reply; (F) case B bị IT trả về ở 1.3 ⟹ đòi ghi chú, reply gắn bước đánh giá; (G) hai lần gửi lại đua ⟹ một thành công, một
  `NOT_AWAITING_REVISION` (khóa Request).

### 7.10. W4-10 Ghi chú trả lời khi trưởng phòng trình lại

- **Nguồn:** `QĐ-116f` "Request về hàng đợi trình của trưởng phòng; trưởng phòng **trình lại kèm ghi chú trả lời**"; `US-06-14` AC-24 "thiếu ghi chú ⟹ không
  trình được mục đó, các mục khác của lô không đổi".
- **Hiện trạng:** `C1` _Trả về_ ở 1.7 đưa Request hai bước về hàng đợi trình (`spend-decision.service.ts:96-102`, `returnByApprover`); trình lại = lô mới qua
  `POST /spend-batches`.
- **Hành vi đúng (RT-2):** thân `POST /spend-batches` thêm `replyNotes?: [{ requestId, note }]` (≤ số `requestIds`). Với mục có **lần _Trả về_ của Người duyệt
  chi đang chờ trả lời** (định nghĩa §7.9 bước 2, loại chi; kiểm lại của hệ thống `RECHECKED_RETURNED_TO_HEAD` không tính): thiếu ghi chú ⟹ `outcome: STOPPED`,
  `stopReason: REPLY_NOTE_REQUIRED`, ở lại hàng đợi, các mục khác đi tiếp; có ghi chú ⟹ xử lý mục; **chỉ chèn** reply `HEAD_RESUBMISSION` khi mục ra
  `SENT_TO_APPROVER` hoặc `AWAITING_RESERVE_CONFIRMATION` (mục thật sự đi tiếp khỏi trạng thái chờ ghi chú); mục ra bị chặn (`STOPPED` vì ngân sách) ⟹ **không**
  lưu ghi chú, lần trình sau vẫn đòi. Ghi chú cho Request không có trong lô ⟹ 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH` (cả lô không ghi). Ghi chú cho Request trong lô
  không có lần chờ ⟹ bỏ qua (T-W4-6). `spendQueueList` thêm `replyNoteRequired: boolean` mỗi mục (RB-5).
- **Tiêu chí** (integration `spend-batch-reply-note.integration-spec.ts`): (A) `R1` bị `C1` trả về; `H1` trình [`R1`, `R4`] không ghi chú ⟹ `R1` `STOPPED
  REPLY_NOTE_REQUIRED`, `R4` đi tiếp; hàng đợi hiện `R1.replyNoteRequired = true`; (B) kèm ghi chú ⟹ `R1` `SENT_TO_APPROVER`, một reply; (C) ghi chú cho id ngoài lô ⟹
  422, không lô nào được tạo; (D) Request bị kiểm lại trả về (không do `C1` quyết) ⟹ trình không cần ghi chú; (E) trình `R1` kèm ghi chú nhưng ngân sách ra bị chặn
  ⟹ `STOPPED`, không reply; trình lại kèm ghi chú khi đủ ngân sách ⟹ `SENT_TO_APPROVER`, đúng một reply, không 500.

### 7.11. W4-11 Người quyết thấy ghi chú trả lời

- **Nguồn:** `QĐ-114q` "người quyết thấy nội dung trước–sau cùng ghi chú"; `US-06-01` AC-35; `US-05-25` AC-10 "thấy ghi chú cạnh đúng mục".
- **Hành vi đúng:** `latestReply: { kind, note, author, createdAt } | null` (reply mới nhất) trên `accessRequestGet` (T3) và trên mỗi mục của `ticket`
  (`RequestTicketRepo.view`, B1/B5a — một câu, không N+1; RB-6). Lý do trả về đã có trong lịch sử bước.
- **Tiêu chí:** sau 7.9 (B) `H1` mở `R3` ⟹ `latestReply.note` đúng; mở `PH-1` ⟹ mục `R3` có `latestReply`; Request chưa từng gửi lại ⟹ `null`.

### 7.12. W4-12 Trưởng phòng rút Request ở hàng đợi trình (OQ-W4-2 = A)

- **Nguồn:** `QĐ-116b` "rút được **mọi Request trong hàng đợi trình của mình** (đã duyệt nhu cầu chờ trình lô, hoặc bị Người duyệt chi trả về ở bước 1.7), lý do
  bắt buộc"; `US-05-08` AC-15; `US-06-14` AC-23.
- **Hiện trạng:** `access-request/withdrawal.policy.ts:23` `HEAD_MAY_WITHDRAW_AT: SpendStage[] = ['BLOCKED', 'RESERVE_CONFIRMATION']`; `SpendStage`
  (`access-request/access-request.types.ts:293-301`): `NOT_SUBMITTED`, `RETURNED_TO_REQUESTER`, `RESERVE_CONFIRMATION`, `BLOCKED`, `WAITING_SPEND_DECISION`,
  `REFUSED`; Request ở hàng đợi trình (kể cả bị `C1` trả về) ra `NOT_SUBMITTED` (`spend/spend-status.service.ts:57`).
- **Hành vi đúng (OQ-W4-2 = A; RB-8, RT-15):** thêm **đúng** `NOT_SUBMITTED` vào `HEAD_MAY_WITHDRAW_AT`; **không** thêm `RETURNED_TO_REQUESTER` (Request
  chờ người xin sửa không thuộc hàng đợi trình). Lý do bắt buộc (`REASON_REQUIRED` như hiện có); người xin được báo (thông báo rút hiện có). Không route mới.
- **Tiêu chí:** `R4` (đã duyệt nhu cầu, chưa trình), `R5` (bị `C1` trả về); `H1` rút không lý do ⟹ 409/422 `REASON_REQUIRED` (mã hiện có); có lý do ⟹ cả hai
  `WITHDRAWN`, không khoản cam kết, người xin được báo; **ca âm:** Request `RETURNED_TO_REQUESTER` ⟹ `H1` rút bị từ chối như hiện có.

### 7.13. Ranh giới với đợt 5 (xác nhận lần hai, AI)

- Đợt 4 **không** chấm _Đạt / Không đạt_ câu có luật dữ liệu, **không** trả cặp (Request, câu) lệch, **không** cờ _duyệt dù hệ thống báo không đạt_ (`QĐ-115aj`,
  `QĐ-116a` thuộc đợt 5 theo `QĐ-118a`). Checklist ở mọi route đợt 4 chấm như quyết lẻ hiện có.
- Hai route quyết nhiều mục mở rộng được **chỉ bằng thêm trường**: đợt 5 thêm `confirmations?: [{ requestId, questionCode, note? }]` vào thân và `mismatches?`
  vào từng kết quả; đơn vị là **cặp (Request, câu)**, `x/y` theo từng Request (`QĐ-117d`) — vì vậy kết quả luôn **theo từng mục**.
- Ghi chú trả lời (M2) là dữ liệu đợt 5 dùng để AI "so trước–sau"; đợt 4 chỉ lưu và trả `latestReply`.

### 7.14. W4-13 Mobile và W4-14 ca biên tổ chức

- **Mobile (`QĐ-61b`; `QĐ-82l`(16) "thao tác hàng loạt chỉ trên web; mobile quyết từng mục"):** không route mới; BE không chặn theo kênh. Mở rộng 4 spec mobile:
  (1) `E1` thấy `ticketRef`, rút **một mục** (`mobile-employee-requests`); (2) `H1` quyết **một mục** qua `accessRequestNeedDecide` (`mobile-need-decision`); (3)
  `C1` quyết **một mục** phiếu `H1` qua `spendApprovalDecide` (`mobile-spend-approval`); (4) hộp thư nhận thông báo từng mục
  (`identity-access/mobile-session-roles`). Gửi phiếu, quyết nhiều mục, rút cả phiếu, gửi lại: web.
- **Người xin vừa thành trưởng phòng (`QĐ-116c`, `QĐ-118o`):** mục phiếu chuyển một bước như Request đơn (W1-17); thứ tự kiểm theo W4-07. Phiếu không có Request
  nhóm nên không có ca tách dòng.
- **Phòng không có trưởng phòng (`QĐ-110i`):** W4-02 ca L; trưởng phòng mới nhận bước như Request đơn, dùng W4-05 được.
- **Bước IT (`QĐ-118d`):** cấp **từng mục** qua tác vụ cấp hiện có (`ProvisioningTaskFrame.requireActingItAdmin`). Integration
  `request-ticket-grant-in-charge.integration-spec.ts`: `IT2` cấp mục của `E1` ⟹ 403 `PROVISIONING.NOT_IN_CHARGE`; `IT1` ⟹ 200.

## 8. API

Theo `docs/rules/api-contract.md`: Zod strict, mỗi mã lỗi một status, `examples` cho từng lỗi, mô tả OpenAPI **không** chứa mã nội bộ, route có đầu vào khai 422
`VALIDATION_ERROR`, 401/503 dùng response chung, route có luật phạm vi khai 403 mã riêng. Route cũ giữ đường dẫn, `operationId`; chỉ thêm trường, trừ chỗ **Phá vỡ**.

### 8.1. Operation mới (5)

| # | Method · path                                  | `operationId`              | Vai · phạm vi                                                     | Thành công        | Lỗi riêng (status)                                                                                                    |
| - | ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1 | POST `/request-tickets`                        | `requestTicketSubmit`      | `@AuthenticatedOnly` · người xin cho chính mình (không Super Admin) | 201 `{ ticket }`  | `REQUEST_TICKET.TOO_MANY_ITEMS` (422), `REQUEST_TICKET.ITEMS_REFUSED` (422), lỗi cấp phiếu (§7.2 bước 2) |
| 2 | GET `/request-tickets/{id}`                    | `requestTicketGet`         | `@AuthenticatedOnly` · xem được ≥ 1 mục                            | 200 `{ ticket }`  | `REQUEST_TICKET.NOT_FOUND` (404)                                                                                      |
| 3 | POST `/request-tickets/{id}/need-decisions`    | `requestTicketNeedDecide`  | `@AuthenticatedOnly` · người giữ bước nhu cầu của từng mục         | 200 `{ results }` | `REQUEST_TICKET.NOT_FOUND` (404); `POLICY.VERSION_CHANGED` (409), `POLICY.CHECKLIST_INCOMPLETE`/`CHECKLIST_HAS_NO` (422) |
| 4 | POST `/request-tickets/{id}/spend-decisions`   | `requestTicketSpendDecide` | `@AuthenticatedOnly` · Người duyệt chi giữ bước chi của từng mục   | 200 `{ results }` | như #3                                                                                                                |
| 5 | POST `/request-tickets/{id}/withdrawal`        | `requestTicketWithdraw`    | `@AuthenticatedOnly` · người xin của phiếu                         | 200 `{ results }` | `REQUEST_TICKET.NOT_FOUND` (404), `REQUEST_TICKET.NOT_REQUESTER` (403)                                               |

- `ticket` = `{ id, requester, department, submittedAt, status: IN_PROGRESS|DONE, items (max 6): [{ position, requestId, plan: { id, name }, state, termMonths,
  routingMode, latestReply }] }` — schema ở `request-ticket/request-ticket.dto.ts` (B1), dùng chung #1 và #2 (RT-7).
- `results[]` = `{ requestId, outcome, reason }` — schema ở `request-ticket/request-ticket.dto.ts` (không sửa `spend-approval-view/spend-approval.dto.ts`).
- Không collection mới.

### 8.2. Operation đổi

| `operationId`                                                       | Thay đổi                                                                                                                             | FE cần làm                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `accessRequestResubmit`                                             | thân `{ replyNote? }` (1…1000). **Phá vỡ (hành vi):** có lần _Trả về của người_ chưa trả lời mà thiếu ghi chú ⟹ 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`; ca khác giữ như cũ; summary bỏ chữ "one-step" | Ô ghi chú, bắt buộc khi lỗi trên / khi Request vừa bị người trả về |
| `spendBatchSubmit` (POST `/spend-batches`)                          | thân thêm `replyNotes?`; `stopReason` thêm `REPLY_NOTE_REQUIRED`; 422 `SPEND.REPLY_NOTE_NOT_IN_BATCH`; **thứ tự `results` không đổi** (thứ tự thân) | Ô ghi chú cho mục `replyNoteRequired`          |
| `spendQueueList`                                                    | mỗi mục thêm `ticketRef`, `replyNoteRequired`                                                                                        | Nhóm theo phiếu, đánh dấu cần ghi chú          |
| `spendBatchItemList`                                                | mỗi mục thêm `ticketRef`                                                                                                             | Nhóm theo phiếu                                |
| `accessRequestGet`                                                  | thêm `ticketRef`, `latestReply`                                                                                                      | Liên kết phiếu, hiện ghi chú                   |
| `meAccessRequestList` (GET `/me/access-requests`), `needDecisionList`, `spendApprovalList` | mỗi mục thêm `ticketRef`                                                                                      | Nhóm theo phiếu                                |
| `accessRequestWithdraw`                                             | trưởng phòng rút được Request ở hàng đợi trình; mã lỗi không đổi                                                 | Nút rút ở hàng đợi trình                       |

Không đổi: route Request đơn, Request nhóm, lô chi (ngoài dòng trên), cấp phát.

### 8.3. Mã và enum

- **Message thành công:** `REQUEST_TICKET.SUBMITTED`, `REQUEST_TICKET.FOUND`, `REQUEST_TICKET.NEED_DECIDED`, `REQUEST_TICKET.SPEND_DECIDED`,
  `REQUEST_TICKET.WITHDRAWN`.
- **Lỗi mới:** `REQUEST_TICKET.NOT_FOUND` 404, `REQUEST_TICKET.NOT_REQUESTER` 403, `REQUEST_TICKET.TOO_MANY_ITEMS` 422, `REQUEST_TICKET.ITEMS_REFUSED` 422, `ACCESS_REQUEST.REPLY_NOTE_REQUIRED` 422, `SPEND.REPLY_NOTE_NOT_IN_BATCH` 422.
- **Enum đóng (Zod, RT-10):**

| Nơi                                       | Giá trị                                                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ITEMS_REFUSED.details.items[].reason`    | `PLAN_NOT_FOUND`, `APPLICATION_RETIRED`, `PLAN_BOUND_TO_DEVICE`, `NOT_PRICEABLE`, `NOT_PAID_IN_CATALOG`, `HAS_ACCESS`, `TERM_REQUIRED`, `TERM_MONTHS_OUT_OF_RANGE`, `TERM_NOT_ASKED`, `TERM_LONG_TERM_NOT_ALLOWED`, `TERM_CONTRACT_ENDED`, `HAS_OPEN_REQUEST`, `DUPLICATE_IN_TICKET`, `OPEN_LIMIT_REACHED` (người code đối chiếu `TERM_*` với `src/core/term-limit.ts` sau đợt 3) |
| #3 `outcome` / `reason`                   | `APPROVED`, `REJECTED`, `RETURNED`, `SKIPPED`, `RETRYABLE` / `NOT_IN_TICKET`, `OWN_REQUEST`, `NOT_THE_ASSIGNEE`, `STEP_NOT_PENDING`, `ALREADY_DECIDED`, `TRANSIENT_FAILURE`, `null` |
| #4 `outcome` / `reason`                   | như #3 / `NOT_IN_TICKET`, `USE_BATCH`, `NO_SPEND_STEP`, `NOT_THE_ASSIGNEE`, `OWN_REQUEST`, `NOT_CHECKABLE`, `RECHECKED_RETURNED_TO_REQUESTER`, `COMMITMENT_NOT_HOLDABLE`, `ALREADY_DECIDED`, `TRANSIENT_FAILURE`, `null` (đối chiếu lý do `SpendDecisionRefusedError` ở `spend-approval-view/spend-approval.dto.ts:253-268`) |
| #5 `outcome` / `reason`                   | `WITHDRAWN`, `SKIPPED`, `RETRYABLE` / `WITHDRAWAL_AFTER_DECISION`, `ALREADY_ENDED`, `WITHDRAWAL_PENDING`, `GRANT_RUNNING`, `GRANT_COMPLETED`, `ALREADY_WITHDRAWN`, `NOT_IN_TICKET`, `TRANSIENT_FAILURE`, `null` |
| `spendBatchSubmit` `stopReason` (thêm)    | `REPLY_NOTE_REQUIRED`                                                                                                                           |

### 8.4. Bàn giao FE (sau đợt; API description xuất từ `openapi.json`)

Form _Xin phần mềm_ nhiều gói → #1, hiện lỗi từng mục theo `details.items[].position`; nút _dùng chung một lý do_ là FE; trang phiếu → #2 (ghi chú cạnh từng mục);
hộp quyết nhiều mục (chọn sẵn mọi mục còn chờ) → #3/#4, hiện kết quả từng mục; rút cả phiếu → #5; gửi lại: ô ghi chú, bắt buộc khi Request vừa bị **người** trả về
(hoặc khi nhận `REPLY_NOTE_REQUIRED`); hàng đợi trình: ô ghi chú cho mục `replyNoteRequired`; mobile chỉ thao tác từng mục.

## 9. Tác động lên đợt 1–3 và tương thích

- **Request đơn cũ:** `ticket_id = null`; mọi route cũ giữ hành vi, trừ `accessRequestResubmit` (**Phá vỡ** hành vi ở ca `QĐ-114q` đòi) và `spendBatchSubmit`
  (thêm ghi chú; thứ tự xử lý mục cùng phiếu; `results` giữ thứ tự thân). Test cũ gửi lại sau _Trả về của người_ mà không thân ⟹ đỏ đúng luật ⟹ sửa kỳ vọng (unit
  của chính luật) hoặc `FIX-TEST-<làn>.md` (http/integration); test gửi lại Request chỉ bị chặn **giữ xanh**.
- **Đợt 1:** dùng khuôn W1-16 (`RETRYABLE`, `ALREADY_DECIDED`); W1-17 áp cho mục phiếu, chỉ thêm thứ tự; W1-10 (bảng khóa) thêm E5.
- **Đợt 2:** `QĐ-118d` cho bước IT không đổi; `EMPLOYEE.NOT_STARTED` là lỗi cấp phiếu; `PLAN_BOUND_TO_DEVICE` là vi phạm của mục.
- **Đợt 3:** giá tháng, `K1` năm 12 tháng, giá lô `K4`, chi phí đang chạy không cam kết áp cho từng mục qua `assess`/`BudgetCheckService` — đợt 4 **không** sửa
  `pricing.policy.ts`, `budget-check.*`, `seat-release.*`, `access-request-grant.listener.ts`, `purchase-invoice/**`, `year-start-commitments/**`.

## 10. Phụ thuộc đợt 3 và delta check

Đợt 4 chỉ bắt đầu code **sau khi đợt 3 đã squash vào `dev`**, rồi điều phối viết `DELTA-W3-FINAL.md` (như `redesign-w3-2026-11-22/DELTA-W2-FINAL.md`):

| File đợt 4 chạm                                                                       | Gói đợt 3 sửa            | Đợt 4 làm gì                                        |
| ------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- |
| `prisma/models/requests.prisma`, `organization.prisma`                                | P3, P11, P12a, P12b      | thêm model/trường (B1, B5a)                         |
| `m/requests/access-request/access-request.dto.ts`                                     | P16b                     | thêm `ticketRef`, `latestReply` (T2, T3)            |
| `m/requests/spend-approval-view/spend-approval.dto.ts`, `spend-approval-view.service.ts` / queue | P16b          | thêm `ticketRef` ở mục danh sách (T2)               |
| `m/requests/access-request/access-request.errors.ts`, `.http-errors.ts`               | P13a (chỉ thêm)          | thêm `REPLY_NOTE_REQUIRED` (B5a, chỉ thêm)          |
| `m/requests/access-request/access-request.repo.ts`, `.types.ts`, `access-request-record.mapper.ts` | (kiểm lại)  | thêm `ticket` (B1)                                  |
| `m/requests/requests.module.ts`, manifest OpenAPI, registry collection                | nhiều gói (chỉ thêm)     | thêm dòng / file w4                                 |
| `m/requests/README.md`, `docs/rules/database-business.md`                             | P23                      | thêm mục phiếu, E5 (T6, B7)                          |
| `src/infrastructure/database/database-role-judgement.ts`                              | P11 (chỉ thêm)           | thêm 2 bảng (B1, B5a)                               |

Delta check: `git --no-pager diff 444e6fc3 origin/dev --stat -- <các file trên> src/modules/requests/request-intake src/modules/requests/need-decision
src/modules/requests/spend-approval src/modules/requests/spend-submission src/modules/requests/withdraw src/modules/requests/reassignment
src/modules/requests/step-routing src/modules/requests/spend/spend-routing.service.ts src/modules/requests/repricing`; mỗi file lệch một dòng DL-n (file:line
mới, ảnh hưởng SPEC, cách áp). **Dòng bắt buộc:** xác nhận `RepricingService.reprice`/`priceFor` không khóa dòng đã commit (E5, RT-4). Lệch đổi luật ⟹ dừng hỏi Owner.

## 11. Test bắt buộc

### 11.1. Ma trận

| Mục   | Unit (spec cạnh file)                                                                 | Integration (`test/integration/requests/`)                                  | HTTP (`test/http/requests/`)                          | Gói |
| ----- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | --- |
| nền   | **spec đặc tả hành vi hiện có:** `request-intake/access-request.service.spec.ts`, `need-decision/need-decision.service.spec.ts`, `spend-approval/spend-decision.service.spec.ts` (mới, mock repo) + `spend-batch-decision.service.spec.ts` (có) | `request-single-characterization` (gửi Request đơn mọi mã từ chối, Request một bước ba kết cục ngân sách, quyết lô chi mọi `reason`) | — | T1 |
| W4-01 | `access-request-record.mapper` (`ticket: null`)                                       | `request-ticket-schema` (CHECK, unique, hai trigger M1)                     | —                                                     | B1 |
| W4-02 | `request-ticket.policy.spec.ts`, `request-ticket-precheck.service.spec.ts`, spec T1 không đổi kỳ vọng | `request-ticket-submit` (ca A–M, K2)                         | `request-tickets` (201, 422×3, 403, 401)              | B2a, B2b |
| W4-03 | —                                                                                     | `request-ticket-head` (ca A–G)                                              | —                                                     | B2b |
| W4-04 | `request-ticket.policy.spec.ts` (`status` `it.each`), view service                    | `request-ticket-view`                                                       | `request-ticket-get` (200, 404)                       | T2 |
| W4-05 | `ticket-need-decision.service.spec.ts` (ca A–H)                                       | `request-ticket-need-decision`                                              | contract #3                                           | B3 |
| W4-06 | `ticket-spend-decision.service.spec.ts`, `spend-item-outcome.policy.spec.ts`, `spend-batch-decision.service.spec.ts` (không đổi kỳ vọng) | `request-ticket-spend-decision`                   | contract #4                                           | B4a |
| W4-07 | `spend-batch-order.policy.spec.ts` (`it.each`)                                        | `spend-batch-ticket-order` (a, b + audit), `request-ticket-head-conversion` | —                                                     | B4b |
| W4-08 | `ticket-withdrawal.service.spec.ts`                                                   | `request-ticket-withdrawal` (A–G)                                           | contract #5                                           | B6 |
| W4-09 | `request-reply.policy.spec.ts`, `request-resubmission.service.spec.ts`                 | `request-resubmission-reply` (A–G), `request-reply-schema` (trigger chỉ ghi thêm M2) | `one-step-resubmission` (thân tùy chọn, 422 mã riêng) | B5a |
| W4-10 | `spend-batch.service` (ghi chú)                                                       | `spend-batch-reply-note` (A–E)                                              | —                                                     | B5b |
| W4-11 | mapper                                                                                | —                                                                           | `access-request-get` (`latestReply`)                  | T3 |
| W4-12 | `withdrawal.policy.spec.ts` (gồm ca âm)                                               | `head-withdraw-submission-queue`                                            | —                                                     | B6 |
| W4-13 | —                                                                                     | 4 spec `mobile-*` mở rộng                                                   | —                                                     | T4 |
| W4-14 | —                                                                                     | `request-ticket-grant-in-charge` (IT1 200, IT2 403)                         | —                                                     | B4a |

Ca diệt đột biến (chạy tay một lần, ghi PROGRESS): đổi `≥` thành `>` ở GH-2 cộng dồn (7.2 ca H đỏ); bỏ sắp `position` (7.3 ca B, 7.5 ca H, 7.7 đỏ); đếm mục bị nêu
vào GH-2 (ca G đỏ); _Trả về_ ở #4 lấy mọi mục (7.6 ca D đỏ); đòi ghi chú khi không có lần _Trả về của người_ (7.9 ca D, E đỏ); chèn reply khi mục `STOPPED` (7.10 ca E đỏ).

### 11.2. Fixture đúng QĐ-118 (bài học `FIX-PLAN-W2`)

Mọi integration/http dựng tổ chức **đủ**: phòng `P-DES` có trưởng phòng `H1`, **IT phụ trách** `IT1` (`RequestHarness.setItAdminInCharge`,
`test/support/request-harness.ts:299`), phòng còn lại giao `IT2` (`handOthersToSecondItAdmin`, `test/support/second-it-admin.ts`); Cost Center hiện hành + ngân
sách năm có số cơ sở/dự phòng ghi rõ trong test; Người duyệt chi `C1` có vai; nhân viên có `employment_type`, lần xếp phòng hợp lệ (không chỉ tương lai). Ca "phòng
không có trưởng phòng" bỏ trưởng phòng nhưng **giữ** IT phụ trách. Ca làm thay IT tạo qua HTTP `POST /departments/{id}/it-substitutes` (mẫu
`test/integration/licensing/provisioning-in-charge.integration-spec.ts:25-33`). Helper trả `undefined` sau 403 là dấu hiệu fixture thiếu IT — sửa fixture. Harness
dùng chung: `test/support/request-ticket-harness.ts` (T1).

### 11.3. Đồng thời

2 connection, barrier, lặp 20, không `40P01`, bất biến giữ (RT-13 — gắn file/gói):

| # | Ca                                                                                                                   | File                                         | Gói |
| - | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --- |
| 1 | hai phiếu của cùng `E1` gửi cùng lúc: GH-2 tổng ≤ 10; trùng gói giữa hai phiếu ⟹ đúng một phiếu nhận `HAS_OPEN_REQUEST` | `request-ticket-submit.integration-spec.ts`  | B2b |
| 2 | #3 ‖ rút mục `R2`: một bên thắng, không ghi nửa                                                                       | `request-ticket-need-decision.integration-spec.ts` | B3 |
| 3 | #4 ‖ `spendApprovalDecide` cùng mục: một quyết định, bên kia `ALREADY_DECIDED`/`NO_SPEND_STEP`                        | `request-ticket-spend-decision.integration-spec.ts` | B4a |
| 4 | hai phiếu trưởng phòng cùng `CC-DES`: CC-year tuần tự, tổng qua ≤ còn lại                                             | `request-ticket-head.integration-spec.ts`    | B2b |

## 12. Câu hỏi Owner (OQ-W4-n)

**Owner đã chốt (25/11/2026, [OWNER-ANSWERS.md](OWNER-ANSWERS.md)):** OQ-W4-1 = **A** (1–6 mục) · OQ-W4-2 = **A** (làm `QĐ-116b` ở đợt 4) ·
OQ-W4-3 = **A** (không mã hiển thị) · OQ-W4-4 = **A** (mỗi mục một thông báo) · `NESTED_ARRAYS` `requestTicketSubmit#ticket.items`,
`requestTicketGet#ticket.items` = **duyệt**. Bảng dưới giữ để tra lý do; không còn câu chờ.

| Mã      | Câu hỏi                                                                                                | Phương án                                                                      | Khuyến nghị + lý do                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| OQ-W4-1 | Phiếu tối thiểu mấy mục?                                                                               | A: 1–6 · B: 2–6 (V3:261)                                                       | **A** — `US-05-22` AC-13 (BASELINED) có "gửi phiếu một mục"; sổ QĐ chỉ nói trần 6                                        |
| OQ-W4-2 | `QĐ-116b` (trưởng phòng rút mọi Request ở hàng đợi trình, lý do bắt buộc) làm ở đợt 4?                 | A: làm (W4-12, cỡ S) · B: để đợt sau                                           | **A** — `US-05-08` AC-14 của phiếu dẫn tới nó; không đợt nào nhận; cùng code rút                                         |
| OQ-W4-3 | Phiếu có mã hiển thị (vd `PH-2026-0001`)?                                                              | A: không · B: có, sequence theo năm                                            | **A** — không QĐ đòi; trường chỉ để hiện; thêm sau được bằng cột nullable                                               |
| OQ-W4-4 | Thông báo khi gửi phiếu: mỗi mục một thông báo (như nay) hay gộp?                                      | A: giữ từng mục · B: một thông báo gộp mỗi phiếu (V3:264)                      | **A** — không đổi người nhận/mẫu; lưu ý: với `QĐ-110i` Super Admin cũng nhận N thông báo "phòng thiếu trưởng phòng"      |
| Duyệt   | Mục `NESTED_ARRAYS` `requestTicketSubmit#ticket.items`, `requestTicketGet#ticket.items` (≤ 6)          | duyệt · không (subresource phân trang)                                         | **Duyệt** — có tiền lệ sự kiện `added` (`api-collection-registry-events-w2.ts`, `-w3.ts`); biên `QĐ-116e` + CHECK M1     |

Câu đã có căn cứ, **không** hỏi: ghi chú chỉ bắt buộc sau _Trả về của người_ (`QĐ-114q` "bị _Trả về_"); xác nhận lần hai ở đợt 5 (`QĐ-118a`); rút cả phiếu từng mục
độc lập (`US-05-08` AC-14); route quyết chi theo phiếu chỉ cho Request một bước (`US-05-25` _Out of scope_); mobile chỉ từng mục (`QĐ-82l`(16)); ghi chú trình lại
chỉ sau _Trả về_ của Người duyệt chi (`QĐ-116f`).

## 13. Ranh giới cho người code

- Chỉ làm đúng SPEC; SPEC không nói mà đổi hành vi nghiệp vụ ⟹ ghi D-n "cần Owner", **giữ hành vi cũ** (CODE-PROMPT LUẬT CỨNG 1).
- Không làm gì của §2.2. Không sửa luật tiền/kho của đợt 3; mục phiếu đi đúng đường Request đơn.

## 14. Tự chốt theo nguồn

| Mã      | Điểm                                                        | Chọn                                                                     | Căn cứ                                                                       |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| T-W4-1  | Lưu liên kết mục ↔ phiếu                                    | bảng mới + cột `ticket_id`, không dùng lại `delegated_batch_id`           | cột chết mang nghĩa cũ; W3-Q2 chưa thành QĐ                                  |
| T-W4-2  | Audit cấp phiếu                                             | một sự kiện `REQUEST_TICKET.SUBMITTED` + sự kiện từng Request như cũ      | `US-05-25` _Data/audit_: "phiếu ghi người gửi và thời điểm"                   |
| T-W4-3  | Trạng thái suy ra                                           | `IN_PROGRESS` / `DONE`                                                   | `US-05-25` AC-4; 5 nhãn V3 chưa thành QĐ                                     |
| T-W4-4  | Danh sách mục khi quyết                                     | BE nhận `requestIds` tường minh; FE chọn sẵn                              | `QĐ-115ab` "mặc định mọi mục còn chờ" là mặc định giao diện                   |
| T-W4-5  | Gửi lại nhiều mục                                           | mỗi mục gọi route gửi lại của nó                                          | `QĐ-116az`(3) mỗi mục một ghi chú                                            |
| T-W4-6  | Ghi chú trình lại cho Request không có lần chờ              | bỏ qua, không lưu                                                        | `QĐ-116f` chỉ đòi sau _Trả về_                                               |
| T-W4-7  | Nơi hiện ghi chú                                            | `latestReply` trên chi tiết Request và mục phiếu                          | `US-05-25` AC-10 "cạnh đúng mục"                                             |
| T-W4-8  | Thứ tự xử lý khi thân liệt kê lộn xộn                       | theo `ticket_position`; `results` lô vẫn theo thân                        | `QĐ-116az`(2), `QĐ-117k`(3) chỉ đòi thứ tự kiểm                              |
| T-W4-9  | Mục xin lại trong ân hạn điều chuyển                        | vào phiếu được, miễn GH-2 như Request đơn                                | `QĐ-115aa` chỉ loại Request tiếp tục, nhóm, case B, `K5`                     |
| T-W4-10 | Ghi chú tự nguyện khi không có lần chờ                      | lưu với `returned_step_id = null`                                        | `QĐ-114q` "lưu kèm lần gửi lại"; không mất chữ người xin viết                 |
| T-W4-11 | Từ vựng `reason` của mục                                    | theo dòng Request nhóm (`HAS_ACCESS`, `HAS_OPEN_REQUEST`, …)              | tiền lệ gần nhất về "lỗi từng phần tử không gửi phần nào" (RT-10)            |
| T-W4-12 | Tên tham chiếu phiếu trên operation của Request             | `ticketRef`                                                              | tránh trùng `ticket` đầy đủ và `operator.ticketId` (RT-17)                   |

## 15. Đã áp review bản 2

### 15.1. Đã áp

| Mã                    | Mức    | Áp ở                                                                                                   |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| RB-1, RT-1, RT-2      | High   | §4 _Trả về của người_; §5 M2 nullable, bỏ unique; §7.9 bước 2–4, ca D/E/F; §7.10 chỉ lưu khi mục đi tiếp, ca E; §7.3 ca G |
| RB-2                  | Medium | §7.9 bước 1, 3 (`replyNote?`, 422 `ACCESS_REQUEST.REPLY_NOTE_REQUIRED`); §8.2                           |
| RB-3, RT-9            | Medium | §7.7 (xử lý theo phiếu, mọi mảng trả về thứ tự thân, audit khớp cặp); §8.2; T-W4-8                      |
| RT-3                  | High   | §1; §11.1 dòng _nền_; PLAN T1 + phụ thuộc "T1 ở int" trước B2a/B3/B4a; bỏ trỏ test không tồn tại        |
| RB-4                  | Medium | §7.3 ca F; §7.7 integration (b)                                                                         |
| RB-5                  | Medium | §7.4, §7.10, §8.2 (`spendQueueList`, `spendBatchItemList`: `ticketRef`, `replyNoteRequired`) — gói B5b  |
| RB-6                  | Low    | §7.11, §8.1 (`latestReply` trên mục phiếu)                                                              |
| RB-7                  | Low    | §7.8 ca F                                                                                               |
| RB-8, RT-15           | Low    | §7.12 (đúng `NOT_SUBMITTED`, không `RETURNED_TO_REQUESTER`, ca âm)                                      |
| RB-9                  | Low    | §7.7 integration chuyển một bước (R11 đứng chờ #2, R12 hàng đợi trình #1)                               |
| RB-10, RT-18          | Low    | §7.2 bước 1 (chấp nhận hai mã, ghi rõ mô tả OpenAPI)                                                    |
| RB-11                 | Low    | §7.4 dòng _Chấp nhận_                                                                                   |
| RT-4                  | Medium | §6.2 hai pha + E5 phát biểu lại; §10 dòng bắt buộc về reprice                                           |
| RT-5                  | Medium | §4 _Lỗi cấp phiếu_; §7.2 bước 2–3 (danh sách lớp lỗi), ca K2                                            |
| RT-6                  | Medium | §7.4 (file `-nested-w4.ts`/`-events-w4.ts`, key `…#ticket.items`, Zod `.max(6)`); §12 dòng _Duyệt_      |
| RT-7                  | Medium | §6.1 (`ticketSchema`, `view` ở `request-ticket/` — B1); §8.1                                            |
| RT-8                  | Medium | §6.1 (`step-routing/` làn `biz`); §7.1 (`access-request-record.mapper.ts`, `itemCount` ở B1); PLAN bổ sung file B1/B2/B3/B4b/B5a/T5 |
| RT-10                 | Medium | §8.3 bảng enum đóng; §7.5 bước 4 (vị trí `NOT_IN_TICKET`, mục không xem được); §7.6 bước 4 (`result.to`, lô giữ) ; T-W4-11 |
| RT-11                 | Medium | §5 _Cách viết_ (`prisma migrate diff`, quy ước FK/Timestamptz), `@@unique` thường, `RUNTIME_TABLE_EXCEPTIONS` chắc chắn cho hai bảng + trigger chỉ ghi thêm `request_tickets` |
| RT-12                 | Medium | PLAN tách B2a/B2b, B4a/B4b, B5a/B5b                                                                     |
| RT-13                 | Medium | §11.1 thêm ca (b)–(g), cột Gói; §11.3 gắn file/gói                                                      |
| RT-14                 | Low    | PLAN/CODE-PROMPT điều kiện 2 (commit squash + `ls-tree`; lệch còn lại ghi DELTA)                        |
| RT-16                 | Low    | PLAN/CODE-PROMPT bộ kiểm nhanh (`prettier --check`, `arch:routes`/`arch:docs:check` cùng commit thêm route) |
| RT-17                 | Low    | §6.1 `decide(…, judged?)`, policy thuần; §7.8 `ALREADY_WITHDRAWN`; `ticketRef` (T-W4-12)                 |

### 15.2. Không áp hoặc áp một phần

| Mã           | Đề xuất reviewer                                                                    | Quyết định + lý do                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| RT-1 (một phần) | thêm OQ-W4-5 (ghi chú mọi lần hay chỉ sau _Trả về_)                              | **Không thêm OQ** — `QĐ-114q` có chữ "bị _Trả về_" (RB-1 dẫn đúng chữ); điều phối chốt không thêm OQ-W4-5                 |
| RT-17 (một phần) | `WITHDRAWN` + `ALREADY_DECIDED` cho rút lặp                                     | Dùng `ALREADY_WITHDRAWN` (rút không phải "quyết định"; giữ nghĩa từ vựng); hành vi idempotent như đề xuất                  |
| RB-10, RT-18 (một phần) | dùng một ngưỡng                                                          | Giữ biên Zod 20 + `TOO_MANY_ITEMS` (cần biên kỹ thuật cho mảng thân; lỗi riêng nêu "tối đa 6" đúng AC-5); ghi rõ mô tả      |
| RB-11 (một phần) | tính `status`/`itemCount` trên mục xem được                                     | Giữ trên mọi mục (trạng thái phiếu một nghĩa cho mọi người xem), ghi dòng chấp nhận                                       |
| RT-6 (một phần) | `results` có thể cần mục registry                                                | Không khẳng định — chưa thấy `spendBatchDecide#results` trong registry nested; người code theo tiền lệ, gate đòi thì thêm cùng file w4 |
