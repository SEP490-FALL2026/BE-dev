# QUESTIONS — câu hỏi cho Owner (gộp từ 9 báo cáo)

> Agent **B-LEDGER**, 05/11/2026. Mã `L-xxx` xem [LEDGER.md](LEDGER.md), hạng mục xem [ITEMS.md](ITEMS.md).
> Skill: `planning-and-task-breakdown` (gom câu theo mức chặn), `code-review-and-quality` (đối chiếu code), `superpowers:verification-before-completion` (mọi câu tự giải đều có `file:dòng` tài liệu đã mở trong lượt này).

## Tóm tắt

- 9 báo cáo nêu **52 câu hỏi**: A1 5, A2 5, A3 5, A4 4, A5 7, V1 4, V2 6, V3 10, V4 6.
- **24 câu đã tự giải** từ sổ QĐ, BRD, US hoặc file quy trình (mục B). Owner không cần trả lời các câu này.
- **28 câu còn lại gom thành 10 câu** (mục A), xếp theo mức chặn:

| Câu | Chủ đề | Chặn | Bắt buộc trả lời trước pha spec? |
| --- | --- | --- | --- |
| Q-01 | Phạm vi và ưu tiên lượt code này | Mọi hạng mục | **Có** |
| Q-02 | Dữ liệu, migration của khái niệm đã bỏ, fixture demo | 14 dòng có migration | **Có** |
| Q-03 | Ngày kết thúc quyền | L-205, L-206, L-209, L-220, L-714 | **Có** |
| Q-04 | *Chặn ngay* khi ngày làm việc cuối còn ở tương lai | L-401, L-405, L-411, L-414 | **Có** |
| Q-06 | Đổi số lượng và phòng sở hữu của thuê bao đang dùng | L-708 | Có, nếu làm L-708 lượt này |
| Q-08 | Request tiếp tục đã duyệt: tự kéo dài hay IT làm | L-215 | Nên trả lời |
| Q-10 | Ba điểm nhỏ (email đăng nhập, thông báo *chuyển đến*, loại thuế) | L-462, L-512, L-713 | Nên trả lời |
| Q-05 | Seat đã chuyển phòng rồi trống lại | L-705, L-609, L-511 | Chỉ khi Q-01 chọn làm chuyển seat |
| Q-07 | Chi tiết MF-4 (phòng mới giữa năm, số cơ sở, gợi ý số tiền, chu kỳ quý) | L-301, L-303, L-311 | Chỉ khi Q-01 chọn làm MF-4 B0→B3 |
| Q-09 | Ba điểm vòng đời thuê bao (nhắc khi hết hạn, đổi tier, tăng giá) | L-604, L-611, L-618 | Chỉ khi Q-01 chọn làm vòng đời thuê bao |

---

## A. Câu hỏi còn mở

### Q-01 — Lượt code này làm tới đâu? *(chặn mọi hạng mục; gộp A1-Q1, A1-Q3, A2-Q4, A5-Q-A5-03)*

**Bối cảnh.** Ledger có 150 dòng. Làm hết ước khoảng **590 giờ** code và test theo file, chưa tính spec, plan và review (cộng khoảng 30 %). Tức là khoảng **74 ngày công** chỉ riêng phần code. Phần việc chia làm hai loại:

- **Luật cũ đang sai trên demo**, nếu để lại thì demo trình bày sai nghiệp vụ hoặc hở bảo mật:
  - Người đã qua ngày làm việc cuối vẫn đăng nhập được (L-401).
  - Trưởng phòng vẫn gửi thay được cho một nhân viên (L-201, L-202, L-203).
  - Kiểm tra ngân sách vẫn rẽ sang Finance và vẫn có override (L-101, L-109, L-110, L-121).
  - Người duyệt chi vẫn quyết gia hạn thuê bao (L-601) và vẫn nhận leo thang SLA (L-801).
  - IT kéo dài được thời hạn quyền khi cấp (L-206).
- **Tính năng mới**, hiện chưa có gì để sai:
  - MF-4 B0→B3: lịch, gói baseline, phong bì, chỉ tiêu (L-301, ≈ 28h), gói tổng hợp và dòng `BM-10` mới (L-302, L-303).
  - Hóa đơn và thực chi (L-312, tối thiểu 16h).
  - Chuyển seat kèm chi phí, phần tiền mới = 0, chi phí tránh được (L-114, L-703, L-705…L-707, ≈ 40h).
  - Ba loại Request mới: tiếp tục nhóm, hợp thức hóa, tăng cấp thuê bao (L-209, L-213, L-214, ≈ 36h).
  - Vòng đời thuê bao: hết hạn chưa gia hạn, đóng thuê bao, điểm điều chỉnh linh hoạt (L-608…L-616, ≈ 45h).
  - Dashboard Finance và Người duyệt chi, bản tóm tắt hằng tháng (L-808, L-809, ≈ 22h).
  - Nhãn T1–T4, chồng lấn, trạng thái giữ khi điều chuyển (L-501, L-504, L-509, ≈ 26h).

**Ví dụ.** Nếu chỉ làm tính năng mới mà chưa gỡ Finance rà soát, demo MF-1 vẫn đưa Request vượt ngân sách sang màn Finance, trái `QĐ-97c`. Ngược lại, nếu gỡ luật cũ mà hoãn MF-4 B0→B3 thì demo MF-4 bắt đầu từ bước *trưởng phòng lập `BM-10`*, thiếu nửa đầu (phong bì, chỉ tiêu).

**Thực tế bên ngoài.** Các công cụ FP&A như Anaplan hay Adaptive tách phần *top-down envelope/target* khỏi *bottom-up request*. Phần baseline thường chỉ là báo cáo đọc. Nhận định này lấy từ báo cáo A1 và là hiểu biết chung, chưa kiểm nguồn.

**Phương án.**

- **B (khuyến nghị): làm (a) + (b) + lõi luật MF-1, khoảng 290h (≈ 36 ngày công, chưa cộng spec và review).**
  - Con số gồm 267h của (a)+(b) trong LEDGER §15.2, cộng L-505 (Request cấp thay thế, 12h), cộng L-701, L-702, L-704 (hạn thu hồi, báo người giữ seat, gỡ lý do thu hồi, khoảng 9h). L-704 bắt buộc đi cùng L-402: khi thu hồi mở trước *đã nghỉ việc*, thao tác hủy bàn giao phải gỡ được lý do thu hồi đó.
  - (a) sửa lỗi bảo mật và sai luật đang chạy.
  - (b) gỡ khái niệm đã bỏ và dọn trường API.
  - Lõi MF-1: ba kết quả kiểm tra, xác nhận dự phòng, năm theo ngày trình và ngày duyệt, thời hạn tối đa 12 tháng.
  - MF-5: chỉ sửa vai (trưởng phòng sở hữu xác nhận) và mốc cảnh báo.
  - MF-2: chặn theo ngày làm việc cuối.
  - MF-3: thu hồi mặc định khi quá hạn, kèm **Request cấp thay thế tự tạo** (L-505). L-505 phải đi cùng việc gỡ gửi thay (L-201), nếu không MF-3 mất đường hợp lệ để giữ quyền *còn cần*.
  - Thông báo: SLA đúng người nhận, Người duyệt chi được báo khi trưởng phòng trình lô, thông báo bị chặn hoặc cần xác nhận dự phòng.
  - Seed: dữ liệu demo mới.
  - **Hoãn sang lượt sau** (≈ 300h; chi tiết ở ITEMS.md mục 3, các hạng mục H1–H8): MF-4 B0→B3, B5/B6, ZBB; hóa đơn; chuyển seat và tiền mới = 0; ba loại Request mới; vòng đời thuê bao ngoài phần sửa vai; dashboard Finance và Người duyệt chi; tóm tắt hằng tháng; nhãn T1–T4, chồng lấn, trạng thái giữ.
  - Hệ quả: không còn luật cũ sai trên demo; `US-06-15` (P0) và một phần MF-5 vẫn hở; câu Q-05, Q-07, Q-09 chưa cần trả lời.
- **C: tối thiểu P0, khoảng 160h (≈ 20 ngày).**
  - Như B, nhưng bỏ các phần sau: Request cấp thay thế; năm của Request ở hồ sơ bổ sung; dashboard trưởng phòng; người nhận thông báo MF-5; cảnh báo hạn thu hồi.
  - Hệ quả: nhanh nhất. MF-3 *còn cần* tạm không có đường, người chuyển phải tự gửi Request. Còn nợ luật nhiều hơn.
- **A: làm hết, khoảng 590h + 30 %, tức 96 ngày công trở lên.** Đúng tài liệu nhất, nhưng không khả thi trước demo nếu chỉ một người.
- **D: như B, cộng thêm phần rút gọn của MF-4**, khoảng 320h: phong bì cùng ưu tiên (B2), chỉ tiêu có sàn và phát hành (B3), gói B5/B6. B0 chỉ lưu văn bản; B1 chỉ gồm cam kết chuyển tiếp và seat (theo đề xuất B của A1-Q1). Hệ quả: demo MF-4 đủ hai nửa; cần trả lời thêm Q-07.

**Khuyến nghị: B.** Nếu demo bắt buộc trình MF-4 đủ phong bì và chỉ tiêu thì chọn **D**.

**Phụ thuộc.** Mọi `L-`. Riêng phạm vi hoãn gồm L-114, L-209, L-213, L-214, L-301…L-303, L-305, L-312, L-501, L-504, L-509, L-511, L-608, L-611…L-616, L-703, L-705…L-707, L-807…L-810, L-812…L-814, L-416.

---

### Q-02 — Dữ liệu và bảng của các khái niệm đã bỏ, cùng dataset demo *(chặn migration của 14 dòng; gộp A1-Q4, V2-Q5, A5-Q-A5-07)*

**Bối cảnh.** Gỡ Finance rà soát, hỏi Finance, override, *chờ ngân sách*, ngưỡng giá trị cao và phiên bản sửa đổi (L-110, L-117, L-121…L-125, L-106, L-118) đụng ba lớp:

- **Trạng thái và bước** đang có dữ liệu: `AWAITING_FINANCE_REVIEW`, `AWAITING_BUDGET`, bước `FINANCE_REVIEW`.
- **Bảng và cột**: `request_finance_reviews`, `budget_information_requests`, `budget_version_line_changes`, `spend_decisions.override_*`, `high_value_percent` (NOT NULL), `expected_spend_on`.
- **Giá trị enum** của khoảng 11 type, ví dụ `AccessRequestState`, `BudgetCheckRoute`, `BudgetVersionKind`, `SlaReminderRole`.

Postgres không xóa được giá trị enum tại chỗ, phải tạo lại type. Quy ước BE hiện chỉ cho `ALTER TYPE … ADD VALUE` (DB-05). Các bảng snapshot và quyết định có trigger bất biến (INV-05), có thể chặn `UPDATE` khi chuyển dữ liệu. Fixture `shared-demo-v2` ghi trong README là *"immutable after shared deployment"*, mà Request R9 lại có đích `AWAITING_FINANCE_REVIEW`.

**Ví dụ.** Trên VPS demo, R9 đang ở `AWAITING_FINANCE_REVIEW` và có một bước `FINANCE_REVIEW` mở. Sau khi deploy code mới, không màn hình nào xử lý được R9; `ops:seed check` báo lệch.

**Thực tế bên ngoài.** Mẫu *expand/contract*: đổi code trước, chuyển dữ liệu sau, xóa cột và type ở bản sau (theo skill `deprecation-and-migration`).

**Phương án.**

- **B (khuyến nghị): một migration tiến cho dữ liệu và bảng, giữ giá trị enum.**
  - Request treo `AWAITING_FINANCE_REVIEW` hoặc `AWAITING_BUDGET` chuyển về `AWAITING_SPEND_SUBMISSION`, stage *cần kiểm lại*. Bước Finance đang mở chuyển `CLOSED` và ghi Audit.
  - Drop bảng và cột không vướng trigger bất biến.
  - **Không** tạo lại enum type: giá trị cũ để lại, không ghi mới, có test chặn ghi mới. Ghi một ngoại lệ ngắn cho DB-05.
  - Dataset demo mới **`shared-demo-v3`**: một fixture duy nhất, đổi mặc định CLI và spec. Owner reset VPS demo một lần.
  - Hệ quả: sạch ở mức dùng được, rủi ro migration thấp. Còn nợ: giá trị enum chết.
- **A: xóa sạch, gồm cả tạo lại khoảng 11 enum type**, rồi reset seed. Sạch nhất, nhưng migration lớn, đụng trigger INV-05 và DB-05, khó rollback.
- **C: hai pha hoàn toàn.** Pha này chỉ gỡ code và endpoint, cột và bảng để nullable "deprecated", dữ liệu treo xử lý thủ công. Pha sau mới drop. An toàn nhất, nhưng còn nợ lớn và seed vẫn phải sửa.
- **Câu phụ về fixture:** sửa tại chỗ `shared-demo-v2` (trái quy tắc bất biến của chính fixture) hay tạo `v3`. Khuyến nghị **v3**, cùng lý do A5.

**Khuyến nghị: B kèm `shared-demo-v3`.** Nếu không môi trường nào có dữ liệu cần giữ ngoài demo thì B là đủ. Nếu có, chọn C.

**Phụ thuộc.** L-101, L-103, L-106, L-110, L-117, L-121…L-125, L-901…L-905. Ảnh hưởng thêm L-105 (cột `expected_spend_on`) và L-801 (`SlaReminderRole.SUPERIOR`).

---

### Q-03 — Ngày kết thúc của quyền cấp qua Request *(chặn L-205, L-206, L-209, L-220, L-714; gộp A2-Q3, V1-Q1, V1-Q2, phần còn lại của V3-Q-03, V3-Q-10)*

**Bối cảnh.**

- BE chỉ ghi ngày kết thúc cho quyền của nhà thầu, freelancer và thực tập sinh (`INV-07`). Ngày đó do **người gửi Request nhóm** nhập cho từng người (`lines[].expectedEndDate`).
- Nhân viên chính thức nhận quyền **không hạn**, dù Request đã tính tiền theo `termMonths`. Hệ quả: không có cửa sổ tiếp tục 30 ngày, Request tiếp tục bị `NO_END_DATE`, giới hạn 12 tháng (`QĐ-98a`) không có tác dụng.
- Tài liệu: `QĐ-98a` (PD:403) cho thời hạn Request bắt đầu từ ngày duyệt chi, tối đa 12 tháng. `QĐ-62h` (PD:291) nói *"mọi quyền có thời hạn đã duyệt"*. `FR-2.8` (BRD:345) bắt buộc ngày kết thúc cho nhà thầu. Nhưng `FR-1.12(1)` (BRD:431) cũng nhắc *"quyền không có ngày kết thúc"*, nên tài liệu chấp nhận có quyền không hạn.
- Người gửi nhóm chỉ thấy họ tên và email (`QĐ-82l(18)`). Vì vậy họ không biết ai là thực tập sinh, và lỗi `END_DATE_REQUIRED` làm lộ điều đó (L-220).
- Hồ sơ nhân viên có `employmentType` nhưng không có ngày kết thúc hợp đồng.

**Ví dụ.**

- `E1` (nhân viên chính thức) xin Figma 6 tháng, được duyệt chi ngày 15/06. Hiện quyền không có ngày kết thúc: không bao giờ vào cửa sổ tiếp tục, seat chiếm mãi.
- `E1` gửi nhóm cho `E1`, `E2`, `E3`, trong đó `E3` là thực tập sinh hết hợp đồng 31/08. Hiện `E1` phải tự điền 31/08 cho `E3`; không điền thì bị từ chối, và lý do từ chối cho `E1` biết `E3` là thực tập sinh.

**Thực tế bên ngoài** (theo báo cáo V1, có nguồn):

- SailPoint cho người yêu cầu đặt *removal (sunset) date* tùy chọn ([API](https://developer.sailpoint.com/docs/api/create-access-request-v-1)).
- Okta Identity Governance để quản trị viên đặt **thời hạn tối đa**, người yêu cầu chọn trong trần ([Okta Help](https://help.okta.com/en-us/Content/Topics/identity-governance/access-requests/rcar-condition-create.htm)).
- Ngày hết hợp đồng thường lấy từ hệ thống nhân sự (hiểu biết chung).

**Phương án.** Có bốn câu nhỏ; phương án đầu của mỗi câu là khuyến nghị.

1. **Quyền nào có ngày kết thúc do server tính?**
   - **(a1, khuyến nghị)** Mọi quyền **trả phí** cấp qua Request: ngày kết thúc = ngày bắt đầu + `termMonths` − 1 ngày. Ngày bắt đầu là ngày duyệt chi (`QĐ-98a`). Thuê bao linh hoạt cắt ở 31/12. Phần mềm nội bộ không phí, tài khoản dịch vụ và quyền từ khởi tạo thì không có ngày kết thúc. Hệ quả: tiền đã duyệt khớp với thời hạn; cửa sổ tiếp tục và `QĐ-100ab` có tác dụng.
   - **(a2)** Như a1 nhưng áp cả nội bộ không phí. Đặc quyền tối thiểu hơn, nhưng mỗi năm phải gia hạn cả công cụ miễn phí.
   - **(a3)** Giữ hiện trạng. Trái `QĐ-98a` và `QĐ-62h`; Request tiếp tục gần như vô dụng.
2. **Ngày hết hợp đồng của nhà thầu, freelancer, thực tập sinh lấy từ đâu?**
   - **(b1, khuyến nghị)** Super Admin ghi *ngày kết thúc hợp đồng* trên hồ sơ nhân viên (`QĐ-87`: dữ liệu nhân sự do Super Admin), kèm cột trong file nhân sự. Server lấy ngày sớm hơn giữa ngày hợp đồng và ngày theo thời hạn. Bỏ `lines[].expectedEndDate` khỏi form gửi. Hệ quả: đúng chủ sở hữu dữ liệu, không lộ, thỏa `FR-2.8` cho cả quyền không phí. Cần migration một cột, khoảng 4–6h.
   - **(b2)** Bỏ hẳn ô ngày; quyền nhà thầu kết thúc theo thời hạn Request; nhà thầu nghỉ sớm thì đi MF-2. Đơn giản nhất, nhưng quyền **không phí** của nhà thầu sẽ không có ngày kết thúc, trái `FR-2.8`.
   - **(b3)** Giữ ô ở người gửi, API ứng viên trả cờ `endDateRequired` (không trả loại hợp đồng). Ít sửa, nhưng vẫn bắt người gửi nhập dữ liệu họ không có.
3. **IT có được rút ngắn ngày kết thúc lúc cấp không?** (Không được kéo dài: đã tự giải ở S-17.)
   - **(c1, khuyến nghị)** Không nhập; server lấy từ Request. Muốn rút ngắn thì đi đường hoàn trả.
   - **(c2)** Cho IT rút ngắn, kèm lý do bắt buộc.
4. **Đổi người chịu trách nhiệm tài khoản dịch vụ (`licenseAssignmentChangeResponsible.expectedEndDate`).**
   - **(d1, khuyến nghị)** Mặc định bằng ngày của dòng cũ, chỉ cho sớm hơn.
   - **(d2)** Tự do như hiện nay.

**Khuyến nghị: a1 + b1 + c1 + d1.** Nếu thời gian gấp thì chọn b2 thay b1 và ghi nợ `FR-2.8` cho quyền không phí của nhà thầu.

**Phụ thuộc.** L-205, L-206, L-209, L-220, L-714. Ảnh hưởng L-207 (cửa sổ) và L-609 (nhu cầu còn hiệu lực).

---

### Q-04 — *Chặn ngay* khi ngày làm việc cuối còn ở tương lai, và ngày nghỉ chính thức *(chặn L-401, L-405, L-411, L-414; gộp A4-Q1, V4-Q-V4-06)*

**Bối cảnh.**

- `QĐ-96c` (PD:340) xếp *"công ty quyết cắt quyền trước ngày cuối"* vào nhịp chặn ngay, nhưng không nói trạng thái nhân viên từ ngày ghi tới ngày cuối.
- BE hiện coi chặn ngay là *đã nghỉ việc* ngay, và bắt ngày cuối ≤ hôm nay (`offboarding.policy.ts:57-70`).
- QT 2.2 viết *nhân viên chuyển đang bàn giao* cho cả hai nhịp; BRD `FR-2.12(ii)` lại nói *nghỉ đột ngột (chuyển thẳng đã nghỉ việc)*.
- Thêm nữa, BE lưu hai mốc: `last_working_day` theo căn cứ, và `left_on` là ngày client chọn khi bấm *đã nghỉ việc*. Hai mốc có thể khác nhau (L-411).

**Ví dụ.**

- Ngày 10/11 công ty chấm dứt hợp đồng với `E5`, trả lương tới 30/11 nhưng cắt mọi truy cập ngay. Hiện Super Admin chỉ có hai cách, cách nào cũng sai: ghi ngày cuối 10/11 (sai hợp đồng), hoặc ghi nhịp thường (để `E5` còn dùng tới 30/11).
- Ngày cuối là 30/09, Super Admin bấm *đã nghỉ việc* ngày 02/10. Vậy `left_on` là 02/10 hay 30/09?

**Thực tế bên ngoài.** *Garden leave* (trả lương thay báo trước) là phổ biến: cắt truy cập ngay, quan hệ lao động kết thúc ở ngày hợp đồng. NIST SP 800-53 PS-4 tách *vô hiệu truy cập* khỏi *ngày chấm dứt*. Nguồn theo báo cáo A4, chưa tra web.

**Phương án.**

- **B (khuyến nghị): tách *lựa chọn chặn ngay* khỏi *đã nghỉ việc*.**
  - Chặn ngay cho phép ngày cuối ở tương lai. Nhân viên vẫn *đang bàn giao* nhưng bị chặn từ ngày ghi; IT khóa tài khoản công ty và thu hồi ngay.
  - Super Admin chuyển *đã nghỉ việc* khi tới hoặc qua ngày cuối.
  - Nghỉ đột ngột = chặn ngay + ngày cuối ≤ hôm nay; được phép chuyển *đã nghỉ việc* ngay.
  - Đi kèm: bỏ `departedOn`, lấy `left_on` = ngày làm việc cuối. Muốn chuyển *đã nghỉ việc* trước ngày cuối thì phải đổi ngày cuối.
  - Hệ quả: đúng chữ `QĐ-96c`, dùng chung cờ chặn với L-401. Phải đổi cột `abrupt` thành cột nhịp (migration map `true` → `BLOCK_NOW`).
- **A: giữ như BE.** Chặn ngay luôn là *đã nghỉ việc* ngay; ngày cuối = ngày cắt quyền; `departedOn` giữ nhưng bắt buộc ≥ ngày cuối. Đơn giản, nhưng mất ngày hợp đồng và báo cáo nhân sự lệch.
- **C: như B, nhưng chặn ngay luôn chuyển *đã nghỉ việc* ngay**, kể cả khi ngày cuối còn ở tương lai. Ít code hơn B, nhưng *đã nghỉ việc* sai pháp lý trong khoảng còn hợp đồng.

**Khuyến nghị: B.**

**Phụ thuộc.** L-401, L-403, L-405, L-411, L-414. Ảnh hưởng L-701 (hạn thu hồi tính từ ngày ghi).

---

### Q-05 — Seat đã chuyển sang phòng khác, sau đó trống lại: thuộc phòng nào, ai chịu phần chi phí còn lại? *(chỉ cần trả lời nếu Q-01 chọn làm chuyển seat; chặn L-705, L-609, L-511; A3-Q1)*

**Bối cảnh.** `QĐ-99e` và `QĐ-99m` (PD:320, PD:411) nói về lúc **chuyển**: hợp đồng vẫn đứng tên phòng cũ, chi phí và cam kết còn lại sang phòng nhận từ ngày cấp. `QĐ-99c(1)` nói về lúc **thu hồi**: thuê bao cam kết kỳ giữ cam kết tới hết kỳ, *"là nghĩa vụ của phòng"*. Không mã nào nói seat đã chuyển rồi trống lại thì thuộc ai.

**Ví dụ.** Figma của `P-DES` có 10 seat, cam kết năm tới 31/12. Ngày 01/03 chuyển 1 seat trống cho `E5` của `P-FIN`. Ngày 01/06 `E5` nghỉ việc, thu hồi xong. Câu hỏi: seat trống đó của phòng nào? 7 tháng còn lại tính cho `P-DES` hay `P-FIN`? Ở ND−60, seat đó là nhu cầu hay phần dư của phòng nào?

**Thực tế bên ngoài** (hiểu biết chung, chưa kiểm tài liệu hãng). Zylo, Torii, Zluri phân bổ chi phí license theo phòng của **người đang giữ** (showback/chargeback). License trống thường quy về chủ hợp đồng hoặc nhóm "unallocated".

**Phương án.**

- **B (khuyến nghị):** seat vẫn quy cho `P-FIN` tới hết kỳ cam kết (thuê bao cam kết kỳ) hoặc tới kỳ thanh toán sau (thuê bao linh hoạt). `P-FIN` chịu chi phí, seat được ưu tiên cấp lại trong `P-FIN`. Ở điểm điều chỉnh, seat tính là phần dư của `P-FIN`; trưởng phòng `P-DES` vẫn là người xác nhận giảm, trưởng phòng `P-FIN` được báo. Hệ quả: khớp `QĐ-99c(1)` và `QĐ-99e`. Cần cột *phòng chịu chi phí* gắn theo seat, không chỉ theo Assignment.
- **A:** seat trống về kho của `P-DES`, chi phí và cam kết còn lại quay về `P-DES`. Đơn giản về kho, nhưng trái chữ `QĐ-99c(1)` và phải chuyển cam kết ngược lại.
- **C:** seat về kho `P-DES`, nhưng chi phí tới hết kỳ cam kết vẫn tính cho `P-FIN`. Tách chủ kho và người trả, khó giải thích trên dashboard.

**Khuyến nghị: B.**

**Phụ thuộc.** L-705, L-609, L-511, L-703.

---

### Q-06 — Đổi số lượng và phòng sở hữu của thuê bao đang dùng *(chặn L-708; gộp A3-Q3, V3-Q-01, V3-Q-02)*

**Bối cảnh.** `PATCH /subscriptions/{id}` cho IT tăng hoặc giảm `purchasedQuantity` tự do: chỉ chặn dưới số seat đang chiếm và chặn tăng khi thiếu Cost Center (`subscription-change.service.ts:80,104`). `subscriptionCreate.ownerDepartmentId` là UUID tự do, không nối Request. Tài liệu:

- `QĐ-84f`: không dùng điều chỉnh thuê bao để né khoản cam kết; phần tăng phải có Request.
- `QĐ-98d`: không bao giờ chi trước khi duyệt.
- `QĐ-94d(2)`: giảm do trưởng phòng sở hữu xác nhận.
- `QĐ-89a(1)`: sau khởi tạo, phòng sở hữu = phòng có Request đã duyệt.

Tài liệu **không** nói gì về sửa sai dữ liệu.

**Ví dụ.**

- IT tăng Slack từ 40 lên 45 vì "sắp có người mới", không có Request nào; BE cho qua.
- IT gõ nhầm 15 thành 51, cần sửa lại.
- Request mua Figma của `P-ENG` đã duyệt, nhưng IT khai thuê bao cho `P-MKT`: chi phí đổ sai phòng.

**Thực tế bên ngoài** (hiểu biết chung, chưa kiểm). Flexera và Snow tách *entitlement* (số đã mua, nhập theo PO hoặc hóa đơn) khỏi *allocation*; thay đổi entitlement phải gắn chứng từ mua.

**Phương án.**

- **A (khuyến nghị): giữ một endpoint, nhưng đổi số lượng của thuê bao ACTIVE phải kèm `basis`.**
  - `basis` là một trong ba: `{requestId}` (Request đã duyệt; tổng không vượt phần được duyệt), `{renewalId}` (kết quả điều chỉnh đã được trưởng phòng sở hữu xác nhận), hoặc `{correction, reason}` (sửa sai dữ liệu, không đổi nghĩa vụ trả tiền; ghi Audit).
  - Sau khi đóng baseline, `subscriptionCreate` bắt buộc `requestId`; server suy ra phòng, gói và trần số lượng. Trước baseline vẫn theo `QĐ-89e`.
  - Hệ quả: mỗi thay đổi có chủ thể và căn cứ; FE chỉ thêm một khối chọn căn cứ.
- **B: khóa `purchasedQuantity` khi thuê bao ACTIVE.** Mọi thay đổi chỉ qua *ghi kết quả điều chỉnh* hoặc *cấp từ Request có mua thêm*; sửa sai là thao tác riêng chỉ Super Admin làm. Chặt nhất, nhưng cần thêm đường "mua thêm giữa kỳ".
- **C: giữ như hiện nay, chỉ thêm lý do và Audit.** Lệch `QĐ-84f`, lách được bước xác nhận.

**Khuyến nghị: A.**

**Phụ thuộc.** L-708. Ảnh hưởng L-214 (tăng cấp thuê bao) và L-706.

---

### Q-07 — Chi tiết MF-4 *(chỉ cần trả lời nếu Q-01 chọn D hoặc A; chặn L-301, L-303, L-311; gộp A1-Q5, V2-Q1, V2-Q4, V2-Q6)*

**Bối cảnh.** Đây là bốn điểm nhỏ, chỉ phát sinh khi làm phong bì, chỉ tiêu và `BM-10` mới.

1. **Phòng lập ngân sách giữa năm, chưa có chỉ tiêu** (A1-Q5). QT 4.5 viết *"lập `BM-10` **trong chỉ tiêu**"*, nhưng QT 4.10 và `QĐ-97b` cho phòng chưa có ngân sách lập phiên bản đầu bất kỳ lúc nào trong năm. Ví dụ: `P-NEW` lập ngày 01/07/2027, phong bì 6 tỷ đã chia hết.
   - **(1a, khuyến nghị)** Finance giao chỉ tiêu cho phòng mới trước, bằng thao tác *giao hoặc chỉnh chỉ tiêu một phòng sau khi đã phát hành*, vẫn giữ Σ ≤ phong bì; sau đó trưởng phòng mới nộp. Giữ đúng *"trong chỉ tiêu"*.
   - **(1b)** Cho nộp không cần chỉ tiêu (hiện *chưa có chỉ tiêu*, không gắn cờ vượt).
   - **(1c)** Finance nhập lại phong bì rồi chia lại toàn bộ.
2. **`budgetVersion.base`** (V2-Q1). Hiện Finance nhập tự do, không nối với Σ các dòng đã điều chỉnh. Ví dụ: đề xuất 70tr gồm Figma 50tr và Miro 20tr; Finance chỉnh Figma xuống 40tr nên Σ = 60tr, nhưng vẫn nhập `base` = 55tr được.
   - **(2a, khuyến nghị)** `base` = Σ dòng, do server tính. Muốn đổi thì sửa dòng, có lý do.
   - **(2b)** Nhập tự do nhưng phải bằng Σ, lệch thì 422 khi gửi.
   - **(2c)** Nhập tự do, response hiện độ lệch.
3. **Số tiền dòng `BM-10`** (V2-Q4).
   - **(3a, khuyến nghị)** Trưởng phòng vẫn nhập; server trả `suggestedAmount` (giá gói × seat × kỳ) và gắn cờ khi lệch.
   - **(3b)** Server tính khi có `planId`. Mất khả năng ghi giá đàm phán dự kiến.
   - **(3c)** Giữ như hiện nay.
4. **Chu kỳ `QUARTERLY`** (V2-Q6). BRD `FR-5.15(1)` ghi *một lần · tháng · năm*; BE và catalog có thêm *quý*.
   - **(4a, khuyến nghị)** Giữ `QUARTERLY` và bổ sung *quý* vào BRD.
   - **(4b)** Bỏ cho khớp BRD.

**Thực tế bên ngoài.** Coupa nạp ngân sách theo dòng và tính *remaining* trên dòng ([Coupa budget line import](https://compass.coupa.com/en-us/products/product-documentation/integration-docs/coupa-core-flat-files-(csv)/flat-file-(csv)-import/budget-line-import)), theo báo cáo V2.

**Khuyến nghị: 1a + 2a + 3a + 4a.**

**Phụ thuộc.** L-301, L-303, L-311.

---

### Q-08 — Request tiếp tục đã duyệt: hệ thống tự kéo dài hay IT Admin làm? *(chặn L-215; A2-Q5)*

**Bối cảnh.** BE tự ghi Assignment kế tiếp ngay khi duyệt và đóng Request `COMPLETED`; IT không thao tác gì (`renewal-apply.service.ts:13-50`). `FR-3.22(6)` (BRD:724) viết: *"Duyệt ⟹ IT kéo dài thời hạn của quyền đang có … thuê bao dùng chung ⟹ IT gom các Request tiếp tục đã duyệt và thực hiện **ở cấp thuê bao**"*. `US-05-14` AC-13 cũng ghi *IT Admin kéo dài*.

**Ví dụ.** `E1` giữ Claude Pro (gói cá nhân K1, nhà cung cấp gia hạn theo từng người). Request tiếp tục được duyệt ngày 25/06. Hiện quyền trong hệ thống được kéo dài ngay, dù IT chưa gia hạn thật ở nhà cung cấp. Với Figma Organization (K2, dùng chung) thì IT gia hạn ở cấp thuê bao, không theo từng người.

**Phương án.**

- **C (khuyến nghị): lai.** Gói K2 dùng chung thì tự ghi khi duyệt và báo IT Admin phụ trách; việc với nhà cung cấp làm ở cấp thuê bao. Gói cá nhân K1 thì Request vào hàng đợi IT (`AWAITING_EXECUTION`), IT ghi *đã kéo dài* rồi mới ghi Assignment kế tiếp. Hệ quả: khớp chữ `FR-3.22(6)` ở chỗ cần IT thật; không thêm thao tác thừa cho K2.
- **A: luôn tự động, chỉ báo IT.** Ít đổi nhất, nhưng lệch chữ *IT kéo dài* với K1.
- **B: luôn qua IT.** Đúng chữ, nhưng thêm một thao tác thủ công cho mọi lần tiếp tục, kể cả K2.

**Khuyến nghị: C.** Nếu demo không có gói K1 thì A là đủ.

**Phụ thuộc.** L-215. Ảnh hưởng L-209.

---

### Q-09 — Ba điểm của vòng đời thuê bao *(chỉ cần trả lời nếu Q-01 chọn làm vòng đời thuê bao; chặn L-604, L-611, L-618; gộp A3-Q4, A3-Q5, V3-Q-08)*

1. **Nhắc trong trạng thái *hết hạn chưa gia hạn*** (A3-Q4). `QĐ-98e` và `FR-1.12(13)` chỉ nói *cảnh báo leo thang trưởng phòng sở hữu*, không nói nhịp nhắc hay giới hạn. Ví dụ: Loom hết hạn 31/12, còn 3 người có quyền đã duyệt, nhà cung cấp cho ân hạn 30 ngày, tới 20/01 chưa ai quyết.
   - **(1a, khuyến nghị)** Một cảnh báo khi vào trạng thái, sau đó nhắc lại theo tham số `FR-8.2` (ví dụ 2 ngày làm việc) tới khi có quyết định. Không tự đóng.
   - **(1b)** Như 1a, cộng hạn tối đa 30 ngày rồi mặc định đóng thuê bao.
   - **(1c)** Chỉ một cảnh báo, sau đó chỉ hiện trên dashboard.
2. ***Đổi tier* và chuỗi kỳ** (A3-Q5). `QĐ-16` quy định chuỗi kỳ đơn, không tách gộp; code chỉ nối chuỗi khi **cùng gói**. Ví dụ: Figma `P-DES` 10 seat *Professional* đổi kỳ sau thành 8 *Professional* + 2 *Organization*.
   - **(2a, khuyến nghị)** Đổi tier là một kỳ mới trên **một** gói đích, vẫn nối chuỗi (nới điều kiện thành *cùng ứng dụng, cùng phòng*). Muốn hai gói thì giữ hoặc giảm gói cũ, rồi gửi Request cấp mới cho gói kia (`QĐ-96b`).
   - **(2b)** Không nối chuỗi: hủy kỳ cũ, khai thuê bao mới, cấp lại Assignment (mất chuỗi usage `QĐ-35c`).
   - **(2c)** Cho tách chuỗi, tức sửa `QĐ-16`.
3. **Nhà cung cấp tăng đơn giá khi gia hạn** (V3-Q-08). `QĐ-96i` và `QĐ-100ad` chỉ nói về **số lượng** vượt mức đang trả. Ví dụ: Figma gia hạn 92 seat, đơn giá tăng từ 12 lên 15 USD, tức chi kỳ mới tăng 25 % mà không ai duyệt.
   - **(3a, khuyến nghị)** Vẫn cho ghi, nhưng bật cờ *tăng chi phí kỳ mới*, báo Finance và trưởng phòng sở hữu, Người duyệt chi thấy trên dashboard.
   - **(3b)** Coi phần chênh giá như Request tăng cấp thuê bao. Nặng và chưa có QĐ.
   - **(3c)** Không làm gì.

**Thực tế bên ngoài** (hiểu biết chung, chưa kiểm). Vendr và Zylo coi tăng giá khi gia hạn (*price uplift*) là sự kiện cần duyệt mua sắm.

**Khuyến nghị: 1a + 2a + 3a.**

**Phụ thuộc.** L-604, L-611, L-618.

---

### Q-10 — Ba điểm nhỏ về trường API *(chặn L-462, L-512, L-713; gộp V4-Q-V4-03, V4-Q-V4-04, V3-Q-06)*

1. **`loginEmail` có được khác `workEmail` không?** (V4-Q3). Hiện BE dùng `loginEmail ?? workEmail` và không kiểm tên miền (`account-invitation.service.ts:72-76`). `QĐ-100ag` cho gửi lời mời **trước ngày vào**, lúc đó hộp thư công ty có thể chưa có. Nhưng quyền trả phí phải gắn tài khoản công ty (`FR-2.9`), và sửa `workEmail` sau đó không đổi email đăng nhập (`FR-8.6`). Ví dụ: Super Admin mời người mới bằng email Gmail; tài khoản đó gắn Gmail mãi mãi.
   - **(1a, khuyến nghị)** Bỏ `loginEmail` khỏi input, luôn dùng `workEmail`; chưa có thì từ chối. Buộc tạo hộp thư công ty trước khi mời.
   - **(1b)** Giữ `loginEmail` tùy chọn, nhưng bắt buộc thuộc tên miền công ty (thêm tham số tổ chức).
   - **(1c)** Giữ tự do như hiện nay.
2. **Thông báo *chuyển đến*: trưởng phòng nhận xác định người bằng gì?** (V4-Q4). `QĐ-76d(1)` cho trưởng phòng nhận gửi thông báo *chuyển đến*, nhưng `QĐ-41c(2)` không cho trưởng phòng đọc người ngoài phòng, nên họ không lấy được `employeeId`. Ví dụ: `H2` (P-FIN) biết `E1` (mã `NV-0012`) sắp chuyển từ P-DES sang theo quyết định nhân sự.
   - **(2a, khuyến nghị)** Body nhận `employeeCode` (khớp chính xác); server tra và chỉ trả mã cùng họ tên. `targetDepartmentId` do server tính.
   - **(2b)** Thêm API tra cứu chính xác theo mã cho `MANAGER`. Mở thêm bề mặt đọc.
   - **(2c)** Giữ `employeeId`. Tính năng không dùng được.
3. **`vendorTaxProfileSet.lines[].taxType`: chữ tự do hay mã?** (V3-Q-06). `QĐ-55a` yêu cầu ghi loại thuế đúng chứng từ và báo cáo tách được chênh lệch thuế. Với chữ tự do, "GTGT", "VAT" và "Thuế GTGT" thành ba loại khác nhau.
   - **(3a, khuyến nghị)** Mã đóng (`VAT`, `CIT_WITHHOLDING`, `FCT`, `OTHER`) cộng `label` tùy chọn.
   - **(3b)** Giữ chữ tự do, thêm gợi ý.

**Khuyến nghị: 1a + 2a + 3a.**

**Phụ thuộc.** L-462, L-512, L-713.

---

## B. Đã tự giải (không hỏi Owner)

Mỗi dòng có căn cứ tài liệu đã mở trong lượt này. `PD:n` là `Docs/Decisions/project-decisions.md`; `BRD:n` là BRD 4.0; `QT` là *Quy trình và chính sách theo main flow*.

| # | Câu gốc | Kết luận | Căn cứ | L |
| --- | --- | --- | --- | --- |
| S-01 | A2-Q1, V1-Q3: Request nhóm của **nhân viên** tối thiểu bao nhiêu người | **Tối thiểu 2 dòng cho mọi Request nhóm**, lỗi nghiệp vụ có lý do. Nhóm 1 dòng cho người khác chính là gửi Request cho một người, đúng điều luật cấm; nhóm 1 dòng cho chính mình thì là Request cá nhân. | `QĐ-100t` PD:491 (*Request cho **một** người chỉ do chính người đó gửi*); BRD:353 (*Request nhóm cho nhiều người*) | L-203 |
| S-02 | A2-Q2: Request tiếp tục nhóm nhập "thời gian dùng thêm" thế nào | **Nhập một số tháng dùng thêm N** (1..12) cho cả Request. Mỗi dòng nối tiếp từ ngày sau ngày hết hạn **của dòng đó**, cắt ở 31/12 với thuê bao linh hoạt. Request tiếp tục cá nhân cũng đổi sang nhập số tháng (`extensionMonths`). | `FR-3.22(1)` BRD:719 (*nhập **thời gian dùng thêm** … nối tiếp từ ngày sau ngày hết thời hạn hiện tại*); `QĐ-98a(1)` PD:403 | L-208, L-209 |
| S-03 | A1-Q2: dự phòng *"khác mặc định"* so với gì | Phiên bản **chụp tỷ lệ tại lúc lập**. Lúc **gửi**, so `reserve` với `round(tỷ lệ chụp × số cơ sở hiện tại)` (làm tròn nửa xa 0); khác thì bắt `reserveReason`. Đổi tham số chỉ áp cho phiên bản lập sau đó. | `QĐ-100h` PD:413, `QĐ-100k` PD:414; `US-06-15` AC-13 (theo A1) | L-304 |
| S-04 | A5-Q-A5-04: ngân sách vượt cả dự phòng do thuế trên hóa đơn thì có báo Finance không | **Không áp dụng lượt này**, vì chưa có module hóa đơn (L-312). Khi làm: báo Finance và trưởng phòng, Người duyệt chi chỉ thấy trên dashboard. Cần sửa QT A.6 cho khớp. | `QĐ-97d` PD:400 (*báo cáo hiện vượt ngân sách cho Finance và trưởng phòng, còn Người duyệt chi chỉ thấy trên trang tổng quan*); `US-12-15` dòng 74 | L-312, L-814 |
| S-05 | A5-Q-A5-05: mã lỗi khi sửa ngày nghỉ trong quá khứ | **Theo sổ**: `ORGANIZATION.PAST_DAY_IMMUTABLE` (409). Sổ là nguồn đứng đầu và ghi mã cụ thể. Báo FE vì đổi hợp đồng. | `QĐ-42d` PD:512 | L-816 |
| S-06 | A5-Q-A5-06: SLA dùng một tham số chung hay theo loại bước | **Theo loại bước**: nhu cầu, đánh giá IT, duyệt chi; mỗi loại mặc định 2 ngày làm việc. BRD đứng trên QT; cần sửa QT A.4. | `FR-3.8` BRD:619 (*mặc định **2 ngày làm việc** mỗi loại bước; Super Admin chỉnh theo loại bước*) | L-802 |
| S-07 | A5-Q-A5-01: Super Admin có nhận thông báo cho từng bước quá SLA không | **Chỉ ở ba ca**: bước không có người giữ (`NO_HOLDER`), người giữ không dùng được (`HOLDER_NOT_USABLE`), và bước của Người duyệt chi quá hạn. Ngoài ra chỉ cảnh báo backlog. Bỏ `NO_SUPERIOR`. | `US-05-09` AC-4 (theo A5); `QĐ-13`; `FR-3.8` BRD:619 (*nhắc lại người được giao … Escalate chỉ là thông báo*) | L-801 |
| S-08 | A5-Q-A5-02: bản tóm tắt hằng tháng là gì về dữ liệu | **Một thông báo `MONTHLY_SUMMARY_READY`** (kỳ cộng liên kết). Nội dung **tính lại khi mở**, không thêm bảng. Kỳ là tháng lịch, chạy vào ngày làm việc đầu của tháng sau. | `QĐ-24` (báo cáo là dữ liệu dẫn xuất, không thêm thực thể — theo A5); `FR-8.2` BRD:1246 | L-809 |
| S-09 | A4-Q2, V4-Q-V4-01: có thu *lý do nghỉ* không | **Không thu.** BE hiện đúng; cần sửa QT:370. | `QĐ-96c` PD:340 (*không theo lý do nghỉ*); `BM-04` BRD:1451 không có trường này; `QĐ-76e`, `QĐ-80e` (tối thiểu hóa dữ liệu) | L-410 |
| S-10 | A4-Q3: đổi ngày cuối hoặc hủy bàn giao có bắt buộc căn cứ không | **Bắt buộc căn cứ** (loại, số hoặc tệp, người ban hành, ngày), đối xứng với điều chuyển. Cần sửa `US-03-04` AC-14/15. | `QĐ-48c` PD:329 (*lý do … kèm căn cứ của sự kiện nhân sự*); `QĐ-93f(2)` | L-409 |
| S-11 | A4-Q4: IT khóa tài khoản công ty và mở thu hồi có phải chờ *đã nghỉ việc* không | **Không chờ.** Mở khi người đó đã bị chặn (qua ngày cuối hoặc chặn ngay). Cần sửa BRD `BM-08` (:523) và `US-03-04` AC-20. | `QĐ-96j(1)` PD:487 (*không phụ thuộc trạng thái*), `QĐ-96c` PD:340 (*thu hồi xong ≤ 1 ngày làm việc*), `QĐ-77i` | L-402 |
| S-12 | V4-Q-V4-02: trường `note` của `BM-09` giữ ở dạng nào | **Giữ, với nghĩa *giấy tờ người gửi biết***, ngắn, FE cảnh báo không ghi lý do nghỉ hay sức khỏe. **IT Admin không đọc** `note`, `sender`, `rejectReason`. | `BM-09` BRD:1456 (*ghi chú / giấy tờ người gửi biết … không ghi lý do nghỉ*; người dùng: trưởng phòng gửi, Super Admin xác minh); `QĐ-76a`, `QĐ-76e` | L-418 |
| S-13 | V4-Q-V4-05: bỏ hẳn *Cần công cụ mới* khỏi rà soát | **Bỏ** `NEEDS_NEW_TOOL` và `newToolNote`. Dữ liệu cũ đưa về `PENDING`. Cần sửa `US-03-07` AC-5. | `FR-2.16(2)` BRD:544 và QT:598 (*cần công cụ mới ⟹ Request mới qua MF-1, không thuộc rà soát*); BRD đứng trên US | L-507 |
| S-14 | V1-Q4: dòng kế hoạch gắn ở bước nhu cầu lệch năm với năm tạm tính lúc trình | **Chặn khi trình** với `PLAN_LINE_REQUIRED` (stop reason đã có); trưởng phòng gắn lại bằng `PUT /plan-line`. | `QĐ-82l(5)` PD:375 (*gợi ý dòng cùng … năm*); `QĐ-100n` PD:416; `FR-3.3` BRD:583 (*dòng kế hoạch của phiên bản ngân sách hiện hành*) | L-217 |
| S-15 | V2-Q2: API xác nhận dùng dự phòng có hình dạng nào | **Chỉ một trường ở `spendBatchSubmit`**: `reserveConfirmations[{requestId, reason}]`. Mục được xác nhận có bước duyệt chi ngay; mục không xác nhận ở lại hàng đợi với stage `RESERVE_CONFIRMATION_REQUIRED`, trưởng phòng trình lại kèm lý do. Ca bị trả về lúc duyệt cũng đi lại đường này. Không cần endpoint riêng. | `FR-3.21` BRD:710 (*xác nhận dùng dự phòng từng mục trong cùng thao tác … mục không xác nhận ở lại hàng đợi*); `QĐ-97g` PD:402 (*trưởng phòng xác nhận dự phòng hoặc sửa rồi trình lại*); `QĐ-100u` | L-108 |
| S-16 | V2-Q3: hồ sơ bổ sung có những trường nào | `dropEmployeeIds` + `termMonths` (chỉ được giảm) + `reason`. Dòng kế hoạch đổi qua `accessRequestPlanLineSet`. **Không** đổi gói. | `QĐ-97f` PD:401 (*giảm số lượng, thời hạn, số người*); `FR-3.21`; `QĐ-90d` (đổi gói không thuộc MVP) | L-107 |
| S-17 | V3-Q-03 (một phần): IT có được đặt ngày kết thúc lúc cấp dài hơn hạn đã duyệt không | **Không được vượt** (422). Còn câu *rút ngắn* thì nằm ở Q-03, câu 3. | QT 1.9 (*số lượng, gói và **thời hạn** mua không vượt mức đã duyệt*, theo V3); `QĐ-98a` PD:403 | L-206 |
| S-18 | A3-Q2: MF-3, seat K1 của chính người chuyển *còn cần*, ghi nhận kiểu gì | Đây là **chi tiết hiện thực**, không phải luật. Spec chọn: kết thúc Assignment cũ và mở Assignment mới **nối chuỗi** cùng thuê bao và định danh, đổi phòng chịu chi phí, **không** tạo tác vụ ở nhà cung cấp (tiền lệ `QĐ-43a`). | `QĐ-99e` PD:320 (*chuyển chi phí, không hủy rồi mua lại*); `QĐ-43a` | L-511 |
| S-19 | V3-Q-04: nguồn seat khi cấp có hình dạng nào | **Giữ `subscriptionId`** (IT chọn), cho chọn thuê bao cùng gói của phòng khác; server tự ghi `seatSource = TRANSFER` và phòng chịu chi phí; server gợi ý mặc định theo thứ tự trống-phòng-mình → trống-cùng-gói-phòng-khác → mua. | QT 1.9 (IT chọn nguồn seat, theo V3); `QĐ-99e`, `QĐ-100y` PD:496 | L-705, L-706 |
| S-20 | V3-Q-05: `saasIssueTransition.linkedWork` | **Giữ cả 4 id**, kiểm tồn tại và cùng tổ chức, cộng dồn thay vì ghi đè. Đây là vệ sinh API. | `FR-2.15` (*dẫn sang luồng có sẵn*, theo V3) | L-714 |
| S-21 | V3-Q-07: `licenseKeyReveal` ngoài lúc cấp | **Gắn với tác vụ cấp K4** khi có hạng mục `a05-k4-key-grant-by-device`; trong lúc chờ thì bắt buộc `reason` và ghi Audit. | `QĐ-54b` (*chỉ IT Admin xem đầy đủ **khi cấp***, theo V3) | L-712 |
| S-22 | V3-Q-09: hợp đồng và tệp đính kèm | `documentAttach` nhận thêm `{subscriptionId}`; `contractCreate.name` bắt buộc; mô hình contract giữ tối giản. | `QĐ-96d` (*IT đính biên lai vào thuê bao và kỳ tương ứng*, theo V3) | L-713 |
| S-23 | V1 §2.4 (GIỮ) đối lập A1-17, V2 §2.3 (BỎ) về `stillNeeded` (không phải câu hỏi, nhưng hai agent mâu thuẫn) | **Giữ** `stillNeeded`; chỉ bỏ `PLAN_LINE_OVERDUE` như một kết quả kiểm tra. Xem LEDGER K-1. | `FR-3.3` BRD:583; `US-05-04` AC-13 (EP-05:210); `QĐ-82l(5)` PD:375 | L-118 |
| S-24 | (gộp) A1-Q3 hóa đơn, A2-Q4 hai loại Request mới, A5-Q-A5-03 dashboard Finance/Người duyệt chi, A1-Q1 phạm vi MF-4 | Không tự giải được về nội dung, nhưng **gộp vào Q-01** (phạm vi) để Owner trả lời một lần. | — | Q-01 |

*S-24 không tính vào 24 câu tự giải ở phần Tóm tắt. Các câu gốc của nó được tính trong 28 câu gom vào Q-01…Q-10.*

## C. Khớp số

| Báo cáo | Câu | Đi đâu |
| --- | --- | --- |
| A1 | Q1, Q2, Q3, Q4, Q5 | Q-01, S-03, Q-01, Q-02, Q-07 |
| A2 | Q1, Q2, Q3, Q4, Q5 | S-01, S-02, Q-03, Q-01, Q-08 |
| A3 | Q1, Q2, Q3, Q4, Q5 | Q-05, S-18, Q-06, Q-09, Q-09 |
| A4 | Q1, Q2, Q3, Q4 | Q-04, S-09, S-10, S-11 |
| A5 | Q-A5-01 … 07 | S-07, S-08, Q-01, S-04, S-05, S-06, Q-02 |
| V1 | Q1, Q2, Q3, Q4 | Q-03, Q-03, S-01, S-14 |
| V2 | Q1, Q2, Q3, Q4, Q5, Q6 | Q-07, S-15, S-16, Q-07, Q-02, Q-07 |
| V3 | Q-01 … Q-10 | Q-06, Q-06, S-17 + Q-03, S-19, S-20, Q-10, S-21, Q-09, S-22, Q-03 |
| V4 | Q-V4-01 … 06 | S-09, S-12, Q-10, Q-10, S-13, Q-04 |

Tổng 52 câu gốc:

- **24 câu tự giải** nằm ở S-01…S-22. S-01 và S-09 mỗi dòng gộp hai câu gốc. V3-Q-03 tính vào nhóm tự giải vì vế chính (*không được vượt hạn đã duyệt*) đã giải; vế phụ (*rút ngắn*) đưa sang Q-03, câu 3.
- **28 câu gom vào 10 câu mở** Q-01…Q-10.

## D. Owner trả lời (05/11/2026)

Hỏi qua hộp câu hỏi trong phiên điều phối; đây là **quyết định phiên của Owner**, chưa ghi vào sổ QĐ của Docs.

| Câu | Owner chọn | Hệ quả cho hạng mục |
| --- | --- | --- |
| Q-01 | **B, bỏ MF-5**: (1) toàn bộ API — sửa logic sai, gỡ khái niệm đã bỏ, dọn trường; (2) MF-1/MF-2/MF-3 luồng chính + case chính; (3) MF-4 chỉ dọn phần đang có + dự phòng 10 % để kiểm ngân sách đúng, seed tạo ngân sách đã duyệt, **không** làm phong bì/chỉ tiêu; (4) MF-5 **không** làm ở đây — Owner đang làm ở chat khác, điều phối viên audit lại khi Owner báo xong. | ITEMS #9, #10 chuyển sang chat MF-5; H1–H8 hoãn. |
| Ranh giới MF-5 | **Chat MF-5 sở hữu** `licensing/subscription-renewal`, usage, mốc ND, quyết định gia hạn. Lượt này chỉ chạm `RevocationService` (SBF-18: hạn, báo người giữ seat, gỡ lý do) và thông báo SLA/MF-1; xung đột xử lý khi gộp. | #1 giữ; #9, #10 bỏ khỏi lượt này. |
| Q-02 | **Migration tiến + giữ giá trị enum + `shared-demo-v3`** (khuyến nghị B). | #11–#13, #28. |
| Q-03 | **a1 + b1 + c1 + d1**: server tính ngày kết thúc quyền trả phí (ngày duyệt chi + `termMonths` − 1 ngày, thuê bao linh hoạt cắt 31/12; nội bộ không phí, tài khoản dịch vụ, khởi tạo không hạn); Super Admin ghi *ngày kết thúc hợp đồng* trên hồ sơ nhà thầu/freelancer/thực tập sinh (+ cột import), server lấy ngày sớm hơn; bỏ `lines[].expectedEndDate` khỏi form gửi; IT không sửa ngày lúc cấp (rút ngắn đi hoàn trả); đổi người chịu trách nhiệm tài khoản dịch vụ chỉ được sớm hơn. | #20, #27 (vế d). |
| Q-04 | **B**: tách *chặn ngay* khỏi *đã nghỉ việc*; ngày cuối được ở tương lai; bỏ `departedOn`, `left_on` = ngày làm việc cuối; `abrupt` → cột nhịp. | #2, #3. |
| Q-06 | **A**: đổi `purchasedQuantity`/phòng sở hữu của thuê bao ACTIVE phải kèm `basis` (`requestId` · `renewalId` · `correction + reason`); sau baseline tạo thuê bao bắt buộc `requestId`. Vế `renewalId` phối hợp với chat MF-5. | #23. |
| Q-08 | **C (lai)**: gói dùng chung (K2) tự kéo dài khi duyệt + báo IT Admin; gói cá nhân (K1) vào hàng đợi IT, IT ghi *đã kéo dài* rồi mới kéo quyền. | #21. |
| Q-10(1) | **Bỏ `loginEmail`**, luôn dùng email công ty; chưa có thì từ chối mời. | #26. |
| Q-10(2) | **Nhập mã nhân viên** (`employeeCode` khớp chính xác), server trả họ tên để xác nhận, phòng đích = phòng của trưởng phòng. | #26. |
| Q-10(3) | **Mã đóng** cho `taxType` (`VAT`, `FCT`, `CIT_WITHHOLDING`, `OTHER`) + `label` tùy chọn. | #27. |
| Mới | **Thêm API chi tiết nhân viên cho trưởng phòng**: `GET /departments/{id}/employees/{employeeId}` — đúng trường `QĐ-41c(2)` + quyền phần mềm người đó đang giữ (phần mềm, gói, ngày cấp, ngày kết thúc) + Request đang mở của người đó trong phòng; không trả email, loại hợp đồng, tài chính. | #29 mới. |
| Q-05, Q-07, Q-09 | Không cần (thuộc hạng mục hoãn hoặc chat MF-5). | — |
| Đối soát chi phí (hỏi thêm 05/11) | **Hoãn hẳn sang lượt sau**: đối soát chi phí phần mềm (import CSV sao kê/hóa đơn, khớp căn cứ phê duyệt, hàng đợi cần xem xét, Người duyệt chi quyết) và hóa đơn/thực chi (H7, `L-312`) không audit, không spec, không code ở lượt này. | H7 giữ hoãn; thêm ghi chú hạng mục hoãn *đối soát chi phí*. |
| OQ-29-1 (pha spec) | **1 GET chi tiết + 2 subresource có phân trang** (`…/{employeeId}/software-rights`, `…/{employeeId}/open-requests`) theo API-LIST-DETAIL.1. | #29. |
| Q-T1 (pha spec) | Request cấp thay thế khi điều chuyển: **trưởng phòng mới chọn số tháng 1–12, bỏ trống = 12**. | #17. |
| G-1 (pha spec) | Việc tự động ghi người thực hiện là **Hệ thống** (actor `SYSTEM` trong Audit, không đăng nhập được, SoD-6); cơ chế thuộc #1. | #1, #2, #18. |
| Mặc định điều phối viên chốt | #15 "31/12" = cuối năm tài chính; #21 gói K4 như K1; `US-05-14` AC-8 giao #21; G-2/G-3 (#18, #23) giữ giả định, chờ chat MF-5 nối; G-4 bỏ `discrepancyId` (đối soát hoãn). | #15, #18, #21, #23, #27. |
| OQ-28-1 (seed) | **Chỉ demo bằng tay**: seed không tạo kịch bản quá hạn rà soát điều chuyển; khi demo, Super Admin đổi tham số hạn trên màn hình rồi tạo điều chuyển. | #28. |
| Q-R1 (C-REVIEW) | Owner: **drop toàn bộ DB rồi seed lại được** — không cần giữ dữ liệu VPS cũ. Điều phối viên chốt cách làm: ở #11 **đổi tên fixture `shared-demo-v2` thành `shared-demo-v3`** (một fixture, CLI mặc định v3, bỏ ràng buộc bất biến của v2), các hạng mục sau chỉ sửa v3; #28 thêm kịch bản mới ở cuối; Owner drop DB + seed lại khi deploy. | #11, #13, #16, #28. |
