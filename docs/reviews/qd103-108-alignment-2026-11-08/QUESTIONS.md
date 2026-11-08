# Câu hỏi cho Owner — QĐ-103 → QĐ-108 (MF-1, MF-4, MF-5)

> Chỉ ghi khi **không suy ra được** từ sổ QĐ → BRD → quy trình → User Stories. Mỗi câu: bối cảnh + ví dụ cụ thể, 2–4
> phương án kèm hệ quả, **khuyến nghị**, mục ledger/đợt bị chặn. Owner trả lời ⟹ chat review ghi câu trả lời và (nếu là
> nghiệp vụ) báo Owner để ghi `QĐ` mới ở repo Docs trước khi code phần phụ thuộc. Câu kỹ thuật (giá trị tham số, cách lưu)
> chat review tự chọn, ghi vào spec, chỉ báo Owner hạn người dùng thấy (`QĐ-106l`).
>
> **Chế độ tự chạy (08/11/2026):** Owner vắng ⟹ mọi câu dưới đây **TẠM CHỌN (chờ Owner)** theo khuyến nghị; spec của đợt
> phụ thuộc ghi rõ phương án tạm chọn và **cách đổi lại** (điểm chạm code duy nhất). Không câu nào đổi phạm vi lớn nên
> không phải điểm dừng. Cột _Nguồn_ = câu gốc trong 4 báo cáo W0 (scratch của chat review, đã chép đủ nội dung vào đây).

| ID   | Câu hỏi                                                                                                                                                                                                                                                                                                                                                                                        | Phương án                                                                                                                                                                                                                                                                                                       | Khuyến nghị                                                                                                                                    | Chặn                                                                           | Trả lời của Owner                                                                                                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-01 | **Khoản cam kết 01/01 của quyền đang chạy mà không có Request** (quyền nhập lúc khởi tạo `BASELINE`, quyền bàn giao `HANDOVER`). `FR-5.8`(6) nói khoản tự tạo _gắn Request đã cấp quyền_, nhưng các quyền này không có Request và `budget_commitments.request_id` NOT NULL. Ví dụ: E1 giữ seat Figma nhập từ file seat ban đầu 2026 — 01/01/2027 khoản 2027 gắn vào đâu? _(Nguồn W0-1 Q-A1-1)_ | A. Không tạo khoản; chi phí chỉ hiện ở thực chi seat-tháng, _còn lại_ không trừ trước. B. Tạo khoản **không gắn Request** (`origin = YEAR_START_AUTO`, gắn Assignment), cùng luật giải phóng khi thu hồi; `request_id` nullable, unique (assignment, năm). C. Tự tạo Request _hệ thống_ cho mỗi quyền baseline. | **B** — _còn lại_ phản ánh đúng chi phí đang chạy, không sinh Request giả. Đổi lại sang A = bỏ nhánh Assignment-không-Request trong job 01/01. | L1-13 (W4 `qd103-new-year-auto-commitments`)                                   | TẠM CHỌN (chờ Owner): B                                                                                                                                                                                                                                                                                                               |
| Q-02 | **Năm chưa có kỳ lập ngân sách** (năm đầu triển khai, hoặc năm hiện hành bị lỡ B1). B1 → B3 giả định Finance mở kỳ trước khi trưởng phòng nộp `BM-10`. Ví dụ: triển khai 15/11/2026, chưa ai mở kỳ 2026; `CC-DES` cần ngân sách 2026 ngay. _(W0-1 Q-A1-2)_                                                                                                                                     | A. Bắt buộc có kỳ cho mọi năm: Finance mở kỳ 2026 (hạn có thể ở quá khứ, nhập Trần năm) rồi trưởng phòng mới nộp. B. Cho nộp khi chưa có kỳ (không Trần phòng, không cờ, B4 không kiểm Trần năm). C. Năm hiện hành không cần kỳ, chỉ năm sau bắt buộc.                                                          | **A** — một luật cho mọi năm, kiểm B4 luôn chạy; chỉ thêm một thao tác cho Finance. Đổi lại = nới điều kiện `requireOpenCycle` ở một chỗ.      | L1-08 (W2 `qd103-budget-cycle-ceilings`)                                       | TẠM CHỌN (chờ Owner): A                                                                                                                                                                                                                                                                                                               |
| Q-03 | **Duyệt Request tiếp tục: hệ thống tự kéo dài hay tạo việc cho IT?** `FR-3.22`(6), `BR-MF1-08` ghi _duyệt ⟹ IT kéo dài_; code hiện tự ghi Assignment kế tiếp trong giao dịch duyệt chi. Ví dụ: An giữ `K2` tới 30/11, Request tiếp tục 6 tháng duyệt 20/11 — ngày kết thúc mới 31/05 được ghi ngay. _(W0-2 Q-1)_                                                                               | A. Giữ tự động (`K2` không cần thao tác nhà cung cấp; `K1` IT duy trì theo kỳ như thường). B. Tạo tác vụ _kéo dài_, ngày kết thúc mới chỉ ghi khi IT xác nhận. C. Tự động cho `K2`/`K5`, tác vụ IT cho `K1`.                                                                                                    | **A** — ít bước nhất, đang chạy; _IT kéo dài_ với `K1` là việc ngoài hệ thống. Đổi lại sang B/C = thêm một loại tác vụ ở `renewal-apply`.      | L2-24 (W3 `qd103-renewal-request-window`)                                      | TẠM CHỌN (chờ Owner): A                                                                                                                                                                                                                                                                                                               |
| Q-04 | **Giá của Request khi còn nhiều thuê bao trùng (ứng dụng, gói)** — chỉ có ở dữ liệu khởi tạo (R-E02 cho ghi kèm cảnh báo _nên gộp_). Hai thuê bao trùng giá 200 và 220/seat-tháng thì Request lấy giá nào? _(W0-2 Q-2)_                                                                                                                                                                        | A. Thuê bao cũ nhất. B. Giá cao nhất (thận trọng). C. IT đánh dấu một thuê bao _chính_ khi khởi tạo; Request lấy giá thuê bao chính, chưa đánh dấu thì giá cao nhất.                                                                                                                                            | **C** — rõ ràng, IT đã phải xử lý cảnh báo gộp. Đổi lại = một hàm chọn giá.                                                                    | L2-27 (W4 `qd103-grant-from-shared-pool`), W1 `qd103-shared-pool-subscription` | TẠM CHỌN (chờ Owner): C                                                                                                                                                                                                                                                                                                               |
| Q-05 | **Thu hồi trước hạn: tháng thu hồi có được giải phóng cam kết không?** `FR-5.8`(5) giải phóng _phần các tháng còn lại của năm_; thực chi `K2` tính theo ngày. Ví dụ: cam kết 06→12 × 200, thu hồi 10/09. _(W0-2 Q-3)_                                                                                                                                                                          | A. Tháng thu hồi tính đủ (giải phóng 10→12 = 600), đối xứng _tháng gửi tính đủ_. B. Theo ngày (11/09→31/12). C. Giải phóng từ chính tháng thu hồi (09→12 = 800).                                                                                                                                                | **A**. Đổi lại = một hàm tính phần giải phóng.                                                                                                 | L2-20, L4-12 (W4 `qd103-commitment-release-on-revocation`)                     | TẠM CHỌN (chờ Owner): A                                                                                                                                                                                                                                                                                                               |
| Q-06 | **Request một bước bị chặn khi gửi: từ chối gửi hay lưu trạng thái _bị chặn_?** `FR-3.21` viết _bị chặn — khi gửi hoặc lúc duyệt — ⟹ người yêu cầu sửa rồi gửi lại hoặc rút_ (chữ _rút_ gợi ý Request đã tồn tại). Ví dụ: trưởng phòng xin gói 1 200 khi phòng còn 800 kể cả dự phòng. _(W0-2 Q-4)_                                                                                            | A. Từ chối gửi (422 kèm phần vượt), không ghi Request. B. Ghi Request trạng thái _bị chặn_, sửa bằng hồ sơ bổ sung hoặc rút; chặn lúc duyệt cũng về trạng thái này.                                                                                                                                             | **B** — khớp chữ _rút_, giữ dấu vết, dùng chung với ca chặn lúc duyệt.                                                                         | L2-01 (W3 `qd103-request-single-step-routing`)                                 | TẠM CHỌN (chờ Owner): B                                                                                                                                                                                                                                                                                                               |
| Q-07 | **Ai phát hiện _gia hạn ngoài ý muốn_ (R-G07)?** Hệ thống không nói chuyện với nhà cung cấp. Ví dụ: Figma gói năm, IT ghi _giảm 100 → 77_ ngày 20/05; 30/06 nhà cung cấp vẫn tính 100. _(W0-3 Q-1)_                                                                                                                                                                                            | A. IT ghi tay _nhà cung cấp vẫn gia hạn số cũ_ kèm bằng chứng ⟹ mở sự cố. B. Tự mở khi hóa đơn kỳ sau (`SBF-19`) có số seat > kết quả đã ghi (cờ _vượt_). C. Cả A và B, cái nào tới trước.                                                                                                                      | **C** — B tự động nhờ cờ _vượt_ của `SBF-19`, A cho ca nhà cung cấp báo trước hóa đơn.                                                         | L3-07 (W5 `qd103-subscription-alerts-incidents`)                               | TẠM CHỌN (chờ Owner): C                                                                                                                                                                                                                                                                                                               |
| Q-08 | **_Quyền tạm ngưng do nhà cung cấp_ (R-G06) là trạng thái gì của quyền?** Ví dụ: Zoom gói năm hết 31/07, IT quên; 01/08 còn 20 người có quyền. _(W0-3 Q-2)_                                                                                                                                                                                                                                    | A. Nhãn hiển thị suy ra từ thuê bao _hết hạn chưa gia hạn_, không ghi lên quyền; _gia hạn trễ_ ⟹ nhãn tự hết. B. Ghi trạng thái lên từng Assignment, gỡ khi gia hạn trễ.                                                                                                                                        | **A** — quy trình gọi ca này _tối giản_, không có tác vụ thu hồi; không cần migration trên `license_assignments`.                              | L3-07 (W5)                                                                     | TẠM CHỌN (chờ Owner): A                                                                                                                                                                                                                                                                                                               |
| Q-09 | **Chu kỳ trả tiền còn `QUARTERLY`/`OTHER` không?** `FR-1.3` chỉ nói kỳ cam kết 1/12 tháng và _gói năm trả trước hoặc theo tháng_; enum hiện `MONTHLY/QUARTERLY/ANNUAL/OTHER`. _(W0-3 Q-3)_                                                                                                                                                                                                     | A. Chỉ `MONTHLY`, `ANNUAL`; dữ liệu cũ `QUARTERLY/OTHER` chuyển `ANNUAL` kèm cảnh báo chất lượng dữ liệu. B. Giữ `QUARTERLY` (nhắc duy trì theo quý). C. Giữ cả bốn.                                                                                                                                            | **A** — khớp nguồn, đơn giản. Đổi lại = thêm giá trị enum (migration nhỏ).                                                                     | L3-05 (W1 `qd103-shared-pool-subscription`)                                    | TẠM CHỌN (chờ Owner): A, làm rõ sau audit thiết kế W1 — chỉ **ghi mới** nhận `MONTHLY`/`ANNUAL`; dữ liệu cũ `QUARTERLY`/`OTHER` **không** tự chuyển (đơn giá tính theo chu kỳ, đổi nhãn làm sai giá) mà gắn cảnh báo `BILLING_CYCLE_LEGACY`; enum DB giữ (dùng chung với `requests`). Đổi lại = migration chuyển + nhân/chia đơn giá. |
| Q-10 | **Khóa `K4` không chuyển máy được sau khi thu hồi.** R-E04 chỉ cho _Trống / Đã gán_; R-J07 _K4 khóa về kho_; code có trạng thái thứ ba `RETIRED`; US-07-05 AC-7 (chưa viết lại) ghi _ngừng dùng, sức chứa không tăng_. Ví dụ: Office 2021 OEM gắn máy cũ của E1 đã thanh lý — khóa `KEY-8` về _Trống_ hay ra khỏi kho? _(W0-3 Q-4 + W0-4 Q1)_                                                  | A. Luôn về _Trống_; khóa không chuyển máy được thì không nhập kho `K4`. B. Kho giữ hai trạng thái; thêm **hành động** _rút khỏi kho_ (`withdrawnAt` + lý do + audit) để khóa không còn được đếm/cấp — không phải trạng thái seat thứ ba. C. Giữ `RETIRED` như ngoại lệ ba trạng thái cho `K4`.                  | **B** — tôn trọng QĐ hai trạng thái mà không cấp lại khóa đã chết. Cần Owner sửa lại US-07-05 AC-7 ở Docs.                                     | L4-11, L2-21, L3-21 (W4 `qd103-k4-key-pool`)                                   | TẠM CHỌN (chờ Owner): B                                                                                                                                                                                                                                                                                                               |
| Q-11 | **IT Admin phụ trách thuê bao nghỉ/chuyển phòng giữa kỳ: điểm điều chỉnh, cảnh báo đỏ đang mở đi đâu?** Ví dụ: IT2 phụ trách Figma nghỉ 20/05, cảnh báo đỏ 24/05. _(W0-3 Q-5)_                                                                                                                                                                                                                 | A. Người nhận đọc tại thời điểm báo (người phụ trách hiện hành); trống người ⟹ mọi IT Admin dùng được + Super Admin được báo. B. Chặn nghỉ việc tới khi chuyển người phụ trách.                                                                                                                                 | **A** — khớp quy ước _người giữ vai lúc báo_ đang dùng (`licensing/licensing-alerts.service.ts:9-14`).                                         | W5 `qd103-subscription-alerts-incidents`                                       | TẠM CHỌN (chờ Owner): A                                                                                                                                                                                                                                                                                                               |
| Q-12 | **Có sinh `G1` cho kho `K4` vĩnh viễn không?** `G1` hành động _cấp lại hoặc giảm ở điểm điều chỉnh_, nhưng `K4` vĩnh viễn không có điểm điều chỉnh và chi phí trả một lần. Ví dụ: kho Office 2021 có 5 khóa, 2 khóa _Trống_. _(W0-4 Q2)_                                                                                                                                                       | A. Sinh `G1` với hành động chỉ _cấp lại trước khi mua_, không góp vào tỷ lệ chi phí seat Trống. B. Không sinh; chỉ hiện số khóa ở bảng kho. C. Sinh như `K2`.                                                                                                                                                   | **A** — vẫn nhắc IT cấp lại trước khi mua mà không tạo chi phí kho giả.                                                                        | L4-04 (W6 `qd103-ghost-seat-g1-g2`)                                            | TẠM CHỌN (chờ Owner): A                                                                                                                                                                                                                                                                                                               |

## Câu tạm chọn khi thiết kế W2 (Q-13 → Q-22)

Phát sinh ở audit thiết kế W2 (MF-4), 08/11/2026. Mỗi câu ghi bối cảnh, ví dụ, phương án, lựa chọn tạm và điểm đổi lại; chặn
hạng mục W2 tương ứng (`qd103-budget-*`, `qd103-department-effective-year`).

### Q-13 — Sửa Trần sau phát hành: trong lúc chờ phát hành lại, nộp/gửi có bị chặn?

- Bối cảnh: sửa Trần năm/Trần phòng/Dự phòng kho sau B2 tự bỏ phát hành để kiểm tổng lại; nguồn không nói B3/B4 làm gì trong
  khoảng đó. Ví dụ: 20/10/2026 lãnh đạo hạ Trần năm 2027, Finance nhập lại; trong 2 ngày chia lại, `H1` muốn nộp lại `BM-10`.
- Phương án: A. Chặn nộp/nộp lại/gửi phiên bản tới khi phát hành lại. B. Cho làm tiếp theo cờ _đã từng phát hành_
  (`first_published_at`); cửa sổ tạo phòng mới đóng từ lần phát hành đầu; trưởng phòng không thấy Trần phòng trong lúc chờ.
- **TẠM CHỌN (chờ Owner): B** — không làm tắc việc của trưởng phòng/Finance vì một thao tác sửa số; B4 luôn kiểm theo số hiện tại.
- Đổi lại: vị từ `cycleAcceptsWork(cycle)` trong `budgets/cycle/cycle.policy.ts` (đổi sang `published_at IS NOT NULL`).

### Q-14 — Ngoại lệ _khởi tạo hệ thống_ khi tạo phòng (`DA2-11`)

- Bối cảnh: `QĐ-104e`(3) cho tạo phòng ngoài kỳ _lúc khởi tạo hệ thống (`SBF-01`)_ nhưng không định nghĩa _lúc khởi tạo_.
  Ví dụ: triển khai 15/11/2026, Super Admin nhập 8 phòng qua API trước khi Finance mở kỳ nào.
- Phương án: A. Tổ chức **chưa có kỳ lập ngân sách nào** ⟹ tạo được, hiệu lực hôm nay. B. Chỉ đường cài đặt/seed/import
  (`installation`) được tạo ngoài kỳ; API luôn cần cửa sổ. C. Cờ _hoàn tất khởi tạo_ do Super Admin bật.
- **TẠM CHỌN (chờ Owner): A** — không cần trạng thái mới, khớp thực tế _khởi tạo xong mới mở kỳ_; rủi ro (Finance chậm mở kỳ ⟹ cửa sổ mở
  lâu) ghi README `organization`.
- Đổi lại: nhánh `NO_CYCLE_YET` của `budgets/cycle/department-creation-window.listener.ts` (B: trả `CLOSED`; C: đọc cờ).

### Q-15 — Người nhận thông báo của kỳ lập ngân sách

- Bối cảnh: US-06-15 AC-1 báo cả Người duyệt chi khi mở kỳ, QT 4.1 ghi _Người duyệt chi xem trên trang tổng quan_; L1 _quá hạn
  chỉ nhắc trưởng phòng/Finance/Người duyệt chi_ không nói ai nhận gì; `QĐ-108e` _nhắc Finance_ không nói lúc nào.
- Ví dụ: mở kỳ 2027 ngày 15/09; hết hạn nộp 15/10 còn 3 phòng chưa nộp, 1 phòng không trưởng phòng; phòng mới `P-DATA` chưa có Cost Center.
- Phương án: A. Như đã thiết kế: mở kỳ ⟹ trưởng phòng; qua hạn nộp ⟹ trưởng phòng chưa nộp + Finance (số phòng chưa nộp) +
  Finance/Super Admin (phòng không trưởng phòng); qua hạn duyệt ⟹ Người duyệt chi + Finance; phòng thiếu Cost Center ⟹
  Finance một lần mỗi (kỳ, phòng) từ khi kỳ phát hành tới hạn nộp. B. Như A và báo Người duyệt chi khi mở kỳ (theo US).
- **TẠM CHỌN (chờ Owner): A** — theo thứ tự nguồn (QT thắng US), ít thông báo thừa.
- Đổi lại: danh sách người nhận trong `budgets/cycle/cycle.service.ts` (mở kỳ) và `cycle-deadline.service.ts`.

### Q-16 — Lý do khi Finance _chia lại số cơ sở_ ở B4 (`QĐ-100v`, DA2-18)

- Bối cảnh: `QĐ-100v` đòi lý do khi chia lại; code chỉ có `reserveReason`. Ví dụ: B4 vượt 0,1 tỷ, Finance giảm số cơ sở
  `CC-DES` từ 500tr xuống 450tr.
- Phương án: A. PATCH đổi `base` luôn cần `baseReason` (lưu cột + lịch sử phiên bản). B. Chỉ khi `base` khác tổng đề xuất.
  C. Không thêm trường, lấy nhận xét dòng (`budgetVersionLineUpdate`).
- **TẠM CHỌN (chờ Owner): A** — đơn giản, mỗi lần đổi số cơ sở có dấu vết; tạo phiên bản không đòi.
- Đổi lại: một điều kiện trong `version-figures.service.ts` `patchOf`.

### Q-17 — Vế ZBB _đơn giá tăng > 10 % so với kỳ trước_ (DA2-20)

- Bối cảnh: hệ thống không lưu _đơn giá kỳ trước_ theo dòng; seat tùy chọn (`QĐ-101n`); `K4` trả một lần. Ví dụ: dòng Figma
  10 seat, 1 980 USD/năm ⟹ 16,5 USD/tháng; giá tháng quy đổi hiện hành 15 USD (tăng 10 %).
- Phương án: A. _Kỳ trước_ = giá tháng quy đổi hiện hành của gói; chỉ áp khi có `planId`, `seats > 0` và gói có giá tháng.
  B. So với dòng cùng gói của phiên bản đã duyệt năm trước (không có ⟹ không áp). C. Bỏ vế này tới khi có lịch sử giá.
- **TẠM CHỌN (chờ Owner): A** — có số ngay, không cần dữ liệu năm trước.
- Đổi lại: hàm `priceIncreaseRequiresZbb` trong `budgets/budget/budget.policy.ts`.

### Q-18 — Vế ZBB `KPI-3 < 70 %` áp cho loại dòng nào (DA2-24)

- Bối cảnh: `QĐ-94l` ghi _Renew/Change/New/Cancel_, BRD `FR-5.15`(1) và QT 4.4 ghi _Renew/Change_. Ví dụ: dòng _Cancel_
  Miro, KPI-3 40 %.
- Phương án: A. Theo `QĐ-94l` — mọi loại dòng. B. Theo BRD/QT — chỉ _Renew/Change_.
- **TẠM CHỌN (chờ Owner): A** — sổ QĐ đứng đầu thứ tự nguồn; Owner nên sửa một trong hai nơi cho khớp. Kèm: bỏ luật tự đặt `CANCEL = 0`
  (dòng _Cancel_ có thể còn chi phí tới lúc hủy).
- Đổi lại: tập loại dòng trong `kpi3RequiresZbb` (`budget.policy.ts`).

### Q-19 — Một người có hai đơn vị cho cùng năm (DA2-09)

- Bối cảnh: trưởng phòng A hiện tại được gán làm trưởng phòng phòng mới B từ 01/01. Ví dụ: `H3` lập `BM-10` 2027.
- Phương án: A. `costCenterId` tùy chọn ở `budgetProposalSubmit`/`budgetMine`; thiếu khi có > 1 đơn vị ⟹ 422
  `BUDGET.COST_CENTER_REQUIRED`. B. Tự chọn phòng mới cho năm sau. C. Cấm gán người đang là trưởng phòng khác.
- **TẠM CHỌN (chờ Owner): A** — không đoán, không cấm nghiệp vụ hợp lệ.
- Đổi lại: `headedUnitsFor` / bộ chọn đơn vị trong `budget-facts.service.ts`.

### Q-20 — Quyền theo khóa tham số nhóm `BUDGET` (DA2-07)

- Bối cảnh: `QĐ-100k`, `QĐ-94l` giao Finance dự phòng mặc định và hai ngưỡng ZBB; nhóm `BUDGET` còn
  `FORECAST_ERROR_THRESHOLD_PERCENT` (`FR-5.7`) không có nguồn đổi chủ.
- Phương án: A. Quyền theo khóa (`owner`), khóa dự báo giữ Super Admin; Finance đọc list/history các khóa của mình. B. Giao
  cả nhóm cho Finance.
- **TẠM CHỌN (chờ Owner): A** — không đổi quyền ngoài nguồn.
- Đổi lại: trường `owner` của định nghĩa khóa trong `parameter-definitions.policy.ts`.

### Q-21 — Dữ liệu legacy `REVISION`/`SUPERSEDED`/dời khoảng mua khi dọn mô hình (DA2-22)

- Bối cảnh: `budget_version_history_entries` bất biến (trigger) có thể chứa `WINDOW_MOVED`/`SUPERSEDED`; bảng
  `budget_version_line_changes` mất dữ liệu nếu drop. Ví dụ: DB demo có phiên bản sửa đổi từ seed cũ.
- Phương án: A. Phiên bản/bảng đổi dòng còn dữ liệu ⟹ `ops:preflight` chặn + migration dừng rõ (seed lại môi trường demo);
  lịch sử bất biến giữ giá trị enum legacy chỉ đọc, `budget_versions` thêm CHECK. B. Migration tự chuyển `SUPERSEDED` →
  `EXPIRED` và xóa bảng đổi dòng (mất dấu vết). C. Lệnh vận hành riêng để dọn trước.
- **TẠM CHỌN (chờ Owner): A** — không xóa ngầm dữ liệu; môi trường thật chưa có `REVISION` (luồng mới bỏ từ `QĐ-97b`).
- Đổi lại: judgement `BUDGET_LEGACY_REVISION_PRESENT` của migration-preflight và khối kiểm đầu `migration.sql`.

### Q-22 — Tập phiên bản tính ở kiểm B4 (DA2-16)

- Bối cảnh: nguồn nói _tổng phiên bản các phòng_, không nói trạng thái nào. Ví dụ: `CC-DES` có V2 `CHANGES_REQUESTED`
  500tr, `CC-HR` có V1 `DRAFT` 200tr; Finance gửi V3 của `CC-IT`.
- Phương án: A. Mỗi Cost Center lấy bản mới nhất ở `SENT`/`CHANGES_REQUESTED`/`APPROVED`, bản đang gửi thay bản cùng Cost
  Center; không tính `DRAFT`. B. Tính cả `DRAFT` (chặn sớm hơn, nhưng sửa nháp không qua kiểm).
- **TẠM CHỌN (chờ Owner): A** — mỗi lần gửi đều kiểm nên nháp không lọt; khác đồng tiền của kỳ ⟹ 409.
- Đổi lại: hàm `annualCheckSet` trong `budgets/budget/budget.policy.ts`.

Ngoài ra các lựa chọn đã ghi trong spec trước audit, nay đưa thành câu cho Owner: Trần phòng chia **theo phòng** kể cả phòng
chưa có Cost Center và publish đòi đủ mọi phòng (`US-06-15` `OQ-F-18` còn mở) — đổi lại = điều kiện của `ceilingDepartments`.

## Ghi chú của chat code — W1 (08/11/2026)

Không đổi nghiệp vụ; các điểm kỹ thuật chọn theo spec, chat review xem khi R2:

- **W1-N1 — đặt cờ chính song song.** Khóa `plans FOR UPDATE` làm hai `PATCH` xếp hàng, nên cả hai 200 và còn đúng một cờ; 409 `PRIMARY_CONFLICT` chỉ khi vướng unique index. Spec ghi "một thành công, một 409". Đổi lại: bỏ việc gỡ cờ cũ trong `judgeChange` (khi đó người sau 409).
- **W1-N2 — người phụ trách cho mua đứt.** `RESPONSIBLE_REQUIRED` áp cả `PERPETUAL` `ACTIVE` (spec không loại). Đổi lại: một điều kiện `kind` trong `assertResponsibleNamed`.
- **W1-N3 — gỡ cơ chế khóa tham số.** Extension point `ParameterLockContributions`, `holdValue`, lỗi và mã 409 `PARAMETER.LOCKED` bị gỡ vì không còn key nào dùng (spec calendar §7). Đổi lại: khôi phục từ git `b9854ef5`.
- **W1-N4 — chu kỳ cũ ở kỳ gia hạn.** DTO ghi kết quả gia hạn vẫn nhận `QUARTERLY`/`OTHER` (W5 thu hẹp); kỳ mới có thể mang chu kỳ cũ cùng cảnh báo `BILLING_CYCLE_LEGACY`.
- **W1-N5 — cổng bố cục.** Luật kho đặt ở nhóm `catalog/subscription/pool/` vì thư mục đủ 25 file và spec policy vượt 400 dòng.
- **W1-N6 — tổ hợp cũ.** Thuê bao K1 cũ `(1, ANNUAL)` sửa người phụ trách được 200 nhưng chưa có cảnh báo riêng cho tổ hợp; muốn cảnh báo thì thêm vào `poolWarnings` (Owner quyết). **TẠM CHỌN (chat review, R3): không thêm cảnh báo riêng; W5 dọn tổ hợp cũ khi viết lại thuê bao.**
- **W1-N7** — gộp vào W1-N4 (R3): `INVALID_TERMS` chặn tổ hợp (kỳ cam kết × chu kỳ) mà ghi mới bị cấm; `QUARTERLY`/`OTHER` vẫn nhận tới W5 **trừ gói K1** (K1 chỉ `MONTHLY`).

## Câu tạm chọn khi thiết kế W3 (Q-23 → Q-34)

Phát sinh khi soạn và audit thiết kế W3 (MF-1 lõi), 08/11/2026; bản cuối sau audit. Tất cả **TẠM CHỌN (chờ Owner)**.

### Q-23 — Thời hạn của quyền _có thời hạn_: số tháng hay ngày kết thúc _(đổi — nay theo nguồn)_

- Bối cảnh: QT 1.1 _người xin chọn có thời hạn (ngày kết thúc)_, `US-05-23` AC-2/AC-9 nhập ngày kết thúc; R-B01 _tới ngày kết thúc_ +
  `QĐ-104k`(1) làm tròn lên theo tháng; cột `access_requests.expected_end_date` đã có, grant đã đọc nó (`endOfSeat`).
- Ví dụ: gửi 10/07, chọn kết thúc 19/10 — A tính 3 tháng, B tính 4 (07→10).
- Phương án: A. Giữ `termMonths`, `min(termMonths, tháng còn lại)`. B. Body `expectedEndDate`; số tháng = tháng gốc → tháng kết thúc
  (≤ 31/12); trần 12 tháng. C. `termMonths + 1` khi gốc không là ngày 1.
- **Chọn: B** (suy ra từ QT + US; không còn là tạm chọn). Phần chi tiết **TẠM CHỌN**: Request tiếp tục giữ `extensionMonths`; ngày kết
  thúc trước ngày gốc (duyệt muộn) ⟹ 1 tháng; trần lúc gửi `hôm nay + 12 tháng − 1 ngày`, lúc cấp `min(ngày chọn, ngày cấp + 12 tháng)`.
- Đổi lại: `requestAmountOf` (`access-request/pricing.policy.ts`); body ở `access-request.dto.ts`, `group-request.dto.ts`; `grant.policy.ts`
  - `provisioning-grant-writer.service.ts` (`endOfSeat`). Về A: lại trường `termMonths` + một biểu thức `min`.

### Q-24 — Request dở theo định tuyến cũ (dòng 2/4/8) khi triển khai _(cải tiến)_

- Bối cảnh: dữ liệu có Request của trưởng phòng chờ Người duyệt chi duyệt **nhu cầu**, Request phòng không trưởng phòng chờ
  `NO_DEPARTMENT_HEAD`, và Request dòng 2 bị migration Finance (budget-check) đưa về hàng đợi của chính trưởng phòng.
- Ví dụ: `R40` của `H1` chờ `C1` ở bước nhu cầu; `R41` của `E4` (`P-HR`) chờ `NO_DEPARTMENT_HEAD`.
- Phương án: A. Migration chuyển thẳng, trả phí ⟹ `AWAITING_REQUESTER_REVISION` **không lý do**. A'. Migration chỉ **đánh dấu**
  `ONE_STEP` + lý do, bước nhu cầu `NOT_REQUIRED`, state giữ; lượt _hoàn tất_ của sweep chạy kiểm như Request vừa chuyển (cùng mã, có
  lý do chặn, có thông báo). B. `ops:preflight` chặn, seed lại. C. Để nguyên.
- **TẠM CHỌN: A'** — không mất dữ liệu; người yêu cầu thấy lý do thật; một đường mã với chuyển khi mất trưởng phòng.
- Đổi lại: khối đánh dấu trong migration B `<ts>_request_one_step`; `OneStepConversionService.finishPending`
  (`reassignment/one-step-conversion.service.ts`). B: thay khối bằng judgement preflight.

### Q-25 — Phòng mất trưởng phòng nhưng **đã ghi** kế nhiệm từ ngày sau _(giữ, mở rộng áp lúc gửi)_

- Bối cảnh: `QĐ-104f` _chưa có kế nhiệm ⟹ chuyển một bước_; `QĐ-103u`(7) _có kế nhiệm ⟹ chuyển ở ngày hiệu lực_; L1 bước 2.
- Ví dụ: `H7` nghỉ 20/07, `H8` được ghi trưởng phòng từ 01/08; `E5` gửi Request ngày 25/07.
- Phương án: A. Đã ghi kế nhiệm ⟹ không chuyển, Request mới gửi cũng `VIA_HEAD` chờ `NO_DEPARTMENT_HEAD`, giao `H8` ngày 01/08. B.
  Chuyển một bước ngay. C. Chuyển nếu khoảng trống > N ngày.
- **TẠM CHỌN: A** (áp cả lúc gửi — DA3-08).
- Đổi lại: điều kiện `successorRecorded` trong `access-request/routing.policy.ts` và `step-routing/one-step-conversion.policy.ts`;
  nguồn đọc `OrganizationReadApi.nextHeadPeriodOf`.

### Q-26 — Dữ liệu Finance rà soát / hỏi Finance cũ _(giữ)_

- Bối cảnh: gỡ đường Finance (`QĐ-97c`); DB có Request `AWAITING_FINANCE_REVIEW`/`AWAITING_BUDGET`, câu hỏi mở. Ví dụ: seed `R9`.
- Phương án: A. Migration về hàng đợi trưởng phòng, đóng bước/câu hỏi, CHECK cấm, giữ bảng chỉ đọc. B. Như A và drop bảng. C. Chặn preflight.
- **TẠM CHỌN: A** — không xóa dữ liệu không đảo được.
- Đổi lại: migration `<ts>_finance_review_retired`; drop là migration riêng sau.

### Q-27 — Khoản cam kết cũ của năm sau và khoản `NO_BUDGET` từ duyệt chi _(giữ, thêm điều kiện)_

- Bối cảnh: trước W3 duyệt chi ghi một khoản mỗi năm có kỳ trả. Ví dụ: `R12` duyệt 10/2026, lịch trả tới 03/2027 ⟹ có khoản 2027.
- Phương án: A. Giữ nguyên; job 01/01 (W4) bỏ qua (Request, năm) đã có khoản. B. Migration giải phóng khoản năm sau. C. Gộp vào năm hiện hành.
- **TẠM CHỌN: A**, điều kiện bắt buộc ghi vào ledger L1-13 / spec W4: job 01/01 bỏ qua (Request, năm) đã có khoản **và** quyền đang
  giữ chờ quyết định Request tiếp tục (tránh hai khoản khi Request tiếp tục duyệt sau 01/01).
- Đổi lại: thêm migration giải phóng (B) — một `UPDATE … state = 'RELEASED'` có điều kiện năm.

### Q-28 — GH-1/GH-2 áp cho loại Request nào _(giữ)_

- Bối cảnh: nguồn nói _Request cấp mới_; code có `GRANT`, `GROUP_GRANT`, `NEW_SOFTWARE`, `SERVICE_ACCOUNT`, `RENEWAL`, Request hệ
  thống tạo. Ví dụ: `E1` có 2 Request Figma/Miro mở + 1 Request tài khoản dịch vụ bot CI, xin Jira.
- Phương án: A. Đếm `GRANT`, dòng nhóm, đề xuất; không đếm tài khoản dịch vụ, tiếp tục, Request hệ thống. B. Mọi loại trừ tiếp tục. C. Chỉ `GRANT` + dòng nhóm.
- **TẠM CHỌN: A**.
- Đổi lại: tập loại trong `requests/request-limits/request-limits.repo.ts` (đường dẫn mới sau DA3-07).

### Q-29 — Số tiền Request tiếp tục có kỳ mới bắt đầu ở năm sau _(đổi)_

- Bối cảnh: `FR-3.22`(1) _số tiền tới ngày kết thúc mới, không quá 31/12 của năm, phần năm sau là khoản cam kết tự tạo 01/01_; L1
  bước 9 _kiểm chỉ năm hiện hành_; `QĐ-30b` _không có cam kết chuyển tiếp_; nhưng `QĐ-106d` có câu _không còn Request số tiền 0_ (ngữ
  cảnh `K4` cấp từ kho) — không suy ra trọn vẹn ⟹ tạm chọn.
- Ví dụ: quyền hết 31/12/2026, gửi 10/12/2026 tiếp tục 3 tháng ⟹ kỳ mới 01→03/2027.
- Phương án: A (cũ). Tính năm 2027, kiểm ngân sách 2027 ⟹ duyệt tháng 12 bị 409 `NOT_CURRENT_YEAR` ở hạng mục cam kết. B'. Chỉ phần
  năm hiện hành: kỳ mới trọn năm sau ⟹ 0 tháng; vẫn qua kiểm (số 0 không xét vượt) và Người duyệt chi; không giữ khoản; khoản 2027 do
  job 01/01 (W4) vì Assignment kế tiếp đã ghi (Q-03 = A); duyệt sau 01/01 ⟹ tính lại năm mới, khoản năm mới. C. Không cho gửi tới khi
  sang năm — vô hiệu cửa sổ của quyền kết thúc 31/12.
- **TẠM CHỌN: B'** — khớp `FR-3.22`(1), L1, `QĐ-30b`; không chặn duyệt tháng 12.
- Đổi lại: nhánh `year(start) > Y` trong `requestAmountOf` (`access-request/pricing.policy.ts`); điều kiện `cost = 0` trong
  `spend/budget-check.policy.ts`; bỏ qua `hold` khi 0 trong `requests/spend-effects/spend-effects.service.ts`.

### Q-30 — Lý do GH-3 của Request nhóm _(giữ)_

- Bối cảnh: GH-3 bắt buộc lý do theo người; nhóm nhiều người. Ví dụ: `H1` gửi nhóm Miro 5 người, 2 người ≥ 10 phần mềm trả phí.
- Phương án: A. Một `manyPaidSoftwareReason` chung, dòng vượt mang cờ. B. Mỗi dòng một lý do. C. Không đòi lý do ở nhóm.
- **TẠM CHỌN: A**.
- Đổi lại: schema `group-request.dto.ts` + điều kiện ở `group-request-submission/group-request.service.ts` (B: trường vào dòng).

### Q-31 — Request một bước thiếu giá/tỷ giá khi gửi _(giữ, thêm điều kiện)_

- Bối cảnh: BRD `FR-3.2` _chưa trình được tới khi IT bổ sung_ (dòng 587); Request một bước không có hàng đợi. Ví dụ: `H1` xin gói Miro chưa có giá.
- Phương án: A. `AWAITING_REQUESTER_REVISION` lý do `PRICE_MISSING`/`RATE_MISSING`, báo IT Admin phụ trách; người yêu cầu gửi lại. B.
  Tự chạy lại khi IT cập nhật giá. C. Từ chối gửi (422).
- **TẠM CHỌN: A** với điều kiện: không ghi kiểm tra ngân sách; lý do hiện cho người yêu cầu kèm _chờ IT cập nhật giá_; gửi lại khi
  giá vẫn thiếu ⟹ 200, vẫn `PRICE_MISSING` (có test).
- Đổi lại: nhánh `NOT_CHECKABLE` trong `spend/spend-routing.service.ts` (B: listener khi giá đổi).

### Q-32 — GH-3 khi xin gói khác của phần mềm đang dùng _(giữ)_

- Bối cảnh: GH-3 đếm **theo phần mềm**. Ví dụ: `E2` dùng đúng 10 phần mềm trả phí, có Figma Professional, xin Figma Organization.
- Phương án: A. Không gắn cờ (số phần mềm không tăng). B. Gắn cờ vì đã ở ngưỡng.
- **TẠM CHỌN: A**.
- Đổi lại: điều kiện `!holdsSameApplication` trong `requests/request-limits/request-limits.policy.ts`.

### Q-33 — Request **nội bộ** đang chờ bước nhu cầu khi phòng mất trưởng phòng, chưa có kế nhiệm _(mới, DA3-09)_

- Bối cảnh: `QĐ-104f`, `QĐ-62c` chỉ nói **Request trả phí** chuyển một bước; _việc khác vốn giao trưởng phòng — chờ_; định tuyến chốt
  lúc gửi (`QĐ-106h`(1)). Request nội bộ gửi khi phòng **chưa** có trưởng phòng thì IT cấp thẳng (`QĐ-103p`) — khác ca này.
- Ví dụ: `E3` xin _Cổng báo cáo nội bộ_ (`K5`) đang chờ `H7` duyệt; `H7` nghỉ 20/07, chưa ghi kế nhiệm.
- Phương án: A. Không chuyển; bước chờ (`REWAIT`), giao trưởng phòng mới/kế nhiệm khi có; Super Admin nhận cảnh báo _phòng thiếu
  trưởng phòng_ như hiện có. B. Chuyển một bước ⟹ IT cấp thẳng có cờ `NO_NEED_APPROVER`. C. Tự đóng Request.
- **TẠM CHỌN: A** — an toàn: không cấp quyền khi không ai duyệt nhu cầu mà nguồn không cho phép; đổi được không mất dữ liệu.
- Đổi lại: bộ lọc _trả phí_ trong `step-routing/one-step-conversion.policy.ts` (bỏ lọc ⟹ B; lượt hoàn tất đã có nhánh nội bộ).

### Q-34 — Lượt quét cửa sổ tiếp tục trễ đúng lúc tham số vừa giảm _(mới, DA3-22)_

- Bối cảnh: `QĐ-108b` _cửa sổ đã mở giữ nguyên_; bảng `assignment_renewal_windows` chỉ có dòng khi lượt quét hằng ngày đã chạy.
- Ví dụ: kết thúc 30/06, `W` = 30 ⟹ mở 31/05 theo lịch; lượt quét 31/05 chưa chạy; Super Admin đổi `W` = 15 lúc 31/05; `E1` gửi 31/05
  ⟹ kiểm theo 15 ⟹ 409 tới 15/06.
- Phương án: A. Chấp nhận giới hạn (khoảng hở ≤ 1 ngày, cần đổi tham số đúng lúc đó), ghi README `licensing` (đổi tham số sau lượt
  quét trong ngày). B. Khi chưa có dòng: `opensOn = min(theo giá trị hiện hành, theo giá trị liền trước trong lịch sử parameter_values)`.
  C. Ghi dòng cửa sổ ngay khi đổi tham số — cạnh `operating-parameters` (T3) → `licensing` (T4) ngược tầng, không được.
- **TẠM CHỌN: A** — đơn giản, ca hiếm, có test unit ghi rõ hành vi.
- Đổi lại: `checkRenewalWindow` (`requests/renewal-request/renewal-request.policy.ts`) nhận thêm `previousWindowDays` đọc từ lịch sử (B).

## Ghi chú của chat code — W2 `cycle-ceilings`

- **W2-N1 — danh sách và chi tiết kỳ.** `budgetCycleList` phân trang bản tóm tắt; chia Trần theo phòng chỉ ở `budgetCycleGet` (bản đồ theo `departmentId`). Đổi lại: thêm ngoại lệ vào sổ collection (có Owner) nếu muốn mảng.
- **W2-N2 — tập phòng chia Trần.** Mọi phòng `ACTIVE`; ngày hiệu lực thêm ở `department-effective-year`.
- **W2-N3 — kỳ năm hiện tại có thể mở khi hạn đã qua** (Q-02 = A); không chặn.

## Câu khi thiết kế W4 (Q-35 → Q-51)

Phát sinh khi soạn và audit thiết kế W4 (MF-1 cấp quyền), 08/11/2026; bản cuối sau audit. Câu đã có nguồn ghi rõ; câu còn lại **TẠM CHỌN (chờ Owner)**. Bổ sung Q-05: thu hồi đúng **ngày 1** ⟹ tháng đó được giải phóng (suy từ `US-07-05` AC-21); thu hồi giữa tháng vẫn theo A.

### Câu đã có nguồn (không còn là tạm chọn)

| Câu                                                                   | Nguồn (`file:dòng`)                                                                                                                                                                                        | Spec theo thế nào                                                                                                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-37 thiết bị khi gắn khóa `K4`                                       | `Docs/BE-UserStory/epics/EP-07.md:52` (`US-07-01` AC-10: thiết bị không phải thiết bị công ty đã đăng ký ⟹ từ chối); BRD `FR-2.10` dòng 510 (_kèm thiết bị công ty đã cài_); QT dòng 322                   | `qd103-k4-key-pool` _Behavior_ 2: `deviceId` bắt buộc, kiểm qua `DeviceRegistryHook` (devices bind); 422 `DEVICE_NOT_ELIGIBLE`, 409 `DEVICE_REGISTRY_UNAVAILABLE`; lưu `license_keys.device_id` |
| Q-41 IT ghi quyền theo vai cho chính mình                             | `Docs/Decisions/project-decisions.md:322` (`QĐ-77m`: chỉ chặn khi còn IT Admin khác dùng được; một IT ⟹ cờ _tự thực thi_ + báo Super Admin); `EP-07.md:595` (`SoD-1` chỉ nói Super Admin, Người duyệt chi) | `qd103-role-based-access` _Behavior_ 1: `ProvisioningTaskFrame.selfExecutionMode` — 403 `ANOTHER_IT_ADMIN_NEEDED` / ghi kèm `selfExecuted`                                                      |
| Q-42 hết hạn giữ khi còn Request mở                                   | `project-decisions.md:190` (`QĐ-106f`: _không có Request thì IT thu hồi_); `EP-07.md:617` (`US-07-14` AC-9: tới hết 06/11 _không gửi Request nào_ ⟹ tác vụ thu hồi)                                        | role-based _Behavior_ 7: chưa thu hồi khi có Request cấp mới cùng gói gửi trong hạn giữ, ở mọi trạng thái chưa cuối (gồm _đã duyệt chờ cấp_); kết thúc ⟹ lượt quét sau mở thu hồi               |
| Q-05 vế _thu hồi đúng ngày 1_                                         | `EP-07.md:274` (`US-07-05` AC-21: hoàn tất 01/09 ⟹ giải phóng 800 = 09→12); cùng dòng vế `K1`: _các tháng sau 30/09_ (ngày hết kỳ đã trả)                                                                  | `qd103-commitment-release-on-revocation` _Behavior_ 3–4: ngày 1 ⟹ tháng đó giải phóng; `K1` dùng `paidThroughOn`. Vế _giữa tháng_ vẫn tạm chọn (dưới)                                           |
| Q-44 bỏ route Finance ghi hóa đơn trực tiếp (audit §4: _suy ra được_) | `project-decisions.md:518` (`QĐ-103l`: IT nộp mỗi hóa đơn một đề nghị, Finance xác nhận); QT dòng 66 (`C-16`), dòng 962-964 (`SBF-19`)                                                                     | `qd103-purchase-invoice-sbf19` _Behavior_ 13: gỡ `POST /budget-commitments/{id}/invoices`; breaking FE ghi API docs W8                                                                          |
| (không đánh số) đích hóa đơn `K1` theo vai                            | `project-decisions.md:188` (`QĐ-104g`: chi phí về phòng người giữ, Người duyệt chi vào _Chưa phân bổ Cost Center_)                                                                                         | hóa đơn _Behavior_ 2: `HOLDER_DEPARTMENT` / `UNALLOCATED_COST_CENTER`                                                                                                                           |

### Câu tạm chọn W4 (bản cuối) — TẠM CHỌN (chờ Owner)

### Câu cũ ở `QUESTIONS.md` mà W4 dùng (giữ, không đổi)

| Câu                                         | Chọn                                                                                          | Dùng ở                   | Cách đổi lại                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| Q-01 khoản 01/01 của quyền không có Request | B — khoản theo Assignment (chỉ khi chuỗi `predecessor_id` không có tác vụ `GRANT` có Request) | new-year _Behavior_ 2    | A: bỏ nhánh `request_id IS NULL`, cột `assignment_id`, UNIQUE partial |
| Q-04 giá Request khi thuê bao trùng         | C — thuê bao chính, không có thì giá cao nhất                                                 | grant _Behavior_ 2       | hàm `pickPriceSource`                                                 |
| Q-05 vế giữa tháng                          | A — tháng thu hồi giữa chừng tính đủ (10/09 ⟹ 10→12)                                          | release _Behavior_ 4     | `firstMonth` trong `commitment-revocation.policy.ts`                  |
| Q-10 khóa không chuyển máy                  | B — hai trạng thái + hành động rút khỏi kho                                                   | k4 _Behavior_ 4–5        | —                                                                     |
| Q-27 khoản năm sau đã có                    | A — hai điều kiện bỏ qua                                                                      | new-year _Behavior_ 2, 4 | điều kiện trong `year-start-commitments.policy.ts`                    |
| Q-29 Request tiếp tục duyệt tháng 12        | B'                                                                                            | new-year _Behavior_ 4    | như trên                                                              |

### Q-35 — _Tránh được_ chỉ ghi cho cấp theo Request (giữ)

- Bối cảnh: `QĐ-106e`/`QĐ-108d` _ghi một lần lúc IT cấp từ kho_, ví dụ đều là Request; `QĐ-106e` không giới hạn Request (`project-decisions.md:354`) — đây là diễn giải.
- Ví dụ: `IT1` ghi quyền theo vai Slack cho `C1` từ seat Trống (12/tháng, tháng 07) — có ghi _tránh được_ 72 không?
- Phương án: A. Chỉ tác vụ `GRANT` có Request, `K2`/`K4`, không mua. B. Mọi lần gán seat Trống (gồm quyền theo vai, Request tiếp tục).
- **Chọn A** — chỉ số đo _không mua nhờ kho_ cho nhu cầu đã duyệt chi; quyền theo vai không có số tiền đã duyệt để so.
- Đổi lại: điều kiện `requestId != null` trong `licensing/shared-pool/shared-pool.policy.ts` (grant _Behavior_ 6).

### Q-36 — _Seat còn trong ân hạn thu hồi_ ở W4 (giữ)

- Bối cảnh: `FR-3.23`/`US-07-13` AC-3: seat trong ân hạn không chặn mua nếu IT ghi lý do; ân hạn 7 ngày của `MF-5` ở W6; BRD đòi điều kiện _chờ vượt SLA cấp_.
- Ví dụ: kho Figma hết Trống; seat của `E3` có tác vụ thu hồi (nghỉ việc) chưa xong; `IT1` mua cho `R8`.
- Phương án: A. _Đang trong thu hồi_ = Assignment mở có tác vụ thu hồi chưa đóng (mọi nguồn); lý do của IT là bằng chứng _chờ sẽ vượt SLA_. B. Chỉ nguồn ghost seat.
- **Chọn A** — gồm cả ân hạn W6 khi có; không đợi W6.
- Đổi lại: truy vấn `inRevocation` trong `shared-pool-capacity.repo.ts`.

### Q-38 — Khóa đã _rút khỏi kho_ có khôi phục được không (giữ)

- Bối cảnh: Q-10 B thêm hành động rút; nguồn không nói thao tác ngược.
- Ví dụ: `IT1` rút nhầm `KEY-5` (tưởng máy đã thanh lý).
- Phương án: A. Không có thao tác ngược (trigger giữ `withdrawn_*` bất biến). B. `licenseKeyRestore` có lý do + audit.
- **Chọn A** — ít operation, khớp _không cấp lại khóa đã chết_.
- Đổi lại: thêm `POST /license-keys/{id}/restoration`, nới `license_key_guard` cho đúng operation đó.

### Q-39 — Giá một seat của khoản cam kết cũ (sửa theo DA4-18)

- Bối cảnh: khoản ghi trước W4 không có `seat_monthly_minor`; Request nhóm một khoản nhiều seat; quyền có thời hạn có khoản ngắn hơn 12 tháng.
- Ví dụ: khoản 2 000 tạo 03/2026, 1 người, không thời hạn, thu hồi 01/09; khoản 800 tạo 03/2026, quyền tới 30/06, thu hồi 01/05.
- Phương án: A. `floor(amount / số người thụ hưởng / số tháng phủ)`, tháng phủ = từ tháng tạo khoản tới tháng `coverEndOn` nếu trong năm, không thì 12. B. Không
  giải phóng tự động khoản cũ (Finance `REMAINDER`). C. Giải phóng toàn bộ phần đang giữ.
- **Chọn A** — 200 × 4 = 800 / 200 × 2 = 400; làm tròn xuống nên không giải phóng quá phần một seat.
- Đổi lại: nhánh `seat_monthly_minor IS NULL` trong `budgets/commitment/commitment-revocation.policy.ts`.

### Q-40 — Ai là _admin workspace_ được ghi quyền theo vai; khi nào thôi vai (giữ)

- Bối cảnh: `QĐ-104g` _seat của admin workspace_; `QĐ-77d` quản trị workspace đứng tên từng IT Admin; `WorkspaceDuty` theo gói; không có sự kiện _thôi quản trị_.
- Ví dụ: `IT2` quản trị Slack; tháng 11 giao Slack cho `IT3`, `IT2` vẫn là IT Admin.
- Phương án: A. Giữ `IT_ADMIN` **và** có `WorkspaceDuty` đúng gói; thôi vai khi mất `IT_ADMIN` hoặc IT gọi `licenseAssignmentRoleBasedEnd`. B. Mọi IT Admin. C. Tự theo dõi `WorkspaceDuty`.
- **Chọn A** — khớp `US-07-14` AC-3; không cần sự kiện mới ở catalog.
- Đổi lại: `role-based.policy.ts` (`eligibleKinds`); C = listener ở catalog khi trách nhiệm đổi.

### Q-43 — Cờ _vượt_ của hóa đơn kỳ thuê bao trước điểm điều chỉnh (làm rõ theo DA4-33)

- Bối cảnh: R-F02 so hóa đơn gia hạn với số seat hệ thống tính ở điểm điều chỉnh (W5); gói năm có thể trả theo tháng.
- Ví dụ: Figma 20 seat × 180/năm; hóa đơn kỳ năm 3 800; hóa đơn một tháng của gói năm trả tháng 320.
- Phương án: A. `purchased_quantity × đơn giá kỳ giá × tháng kỳ dịch vụ / tháng chu kỳ giá` (3 600 / 300 ⟹ cả hai có cờ). B. Không gắn cờ tới W5.
- **Chọn A** — vẫn bắt được hóa đơn lạ; W5 thay nguồn số seat.
- Đổi lại: `expectedOfSubscriptionPeriod` trong `budgets/purchase-invoice/purchase-invoice.policy.ts`.

### Q-45 — Biết `K1` _đã mua_ khi tác vụ cấp thất bại (đổi A → B theo DA4-30)

- Bối cảnh: `QĐ-104k`(4) _IT đã mua `K1` mà cấp thất bại ⟹ hóa đơn vào Chưa phân bổ Cost Center phòng người dùng_. A cũ bắt IT khai cờ lúc đóng thất bại ⟹ khai sai
  là kẹt (`TASK_NOT_A_PURCHASE`), và hóa đơn nộp trước khi thất bại bị kẹt ở `COMMITMENT_RELEASED`.
- Ví dụ: `IT1` đăng ký ChatGPT Plus cho `E1`, nộp hóa đơn liên kết `R6`; tài khoản bị khóa, tác vụ đóng thất bại; Finance xác nhận sau đó.
- Phương án: A. `provisioningTaskCloseFailed` `K1` bắt buộc `purchasedBeforeFailure`. B. Suy ra từ hóa đơn: hóa đơn liên kết tác vụ/Request `K1` có tác vụ `CLOSED_FAILED`
  ⟹ đích `UNALLOCATED_COST_CENTER`; đích tính lại ở nộp, nộp lại, xác nhận. C. Mặc định đã mua.
- **Chọn B** — có hóa đơn chính là bằng chứng đã mua; không thêm trường; không kẹt.
- Đổi lại: thêm lại `purchasedBeforeFailure` ở `provisioning.dto.ts` và điều kiện trong `targetOf`.

### Q-46 — Hóa đơn `K1`/`K4` áp vào khoản năm nào (đổi A → B' theo DA4-31)

- Bối cảnh: R-H04 thực chi theo năm kỳ dịch vụ; `C-16` hóa đơn năm sau về trước khi có ngân sách ⟹ ghi thực chi, _chưa có ngân sách_; vế dự phòng _HELD gần nhất_ của A
  làm 2026 _còn lại_ tăng giả.
- Ví dụ: `K1` `R6`, hóa đơn kỳ 01/2027 nộp 28/12/2026; job 01/01/2027 tạo khoản (`R6`, 2027) `NO_BUDGET`.
- Phương án: A. Khoản năm kỳ dịch vụ; không có ⟹ khoản `HELD` gần nhất. B'. Khoản năm kỳ dịch vụ; chưa có lúc nộp ⟹ vẫn nhận; lúc xác nhận năm chưa tới ⟹ 409
  `COMMITMENT_YEAR_NOT_OPEN`, năm đã tới mà không có khoản (job bỏ mục) ⟹ `UNALLOCATED_COST_CENTER` phòng của Request. C. Đích mới `ACTUAL_ONLY` (dòng `invoices` không khoản).
- **Chọn B'** — không áp vào năm khác; không cần đổi `invoices.commitment_id` NOT NULL (`budgets.prisma:351`).
- Đổi lại: `commitmentFor` trong `purchase-invoice.policy.ts`; C cần migration `invoices.commitment_id` nullable + `spentOf`.

### Q-47 — Giá cho khoản 01/01 (đổi A → B theo DA4-37)

- Bối cảnh: `FR-5.8`(6) _giá tháng × số tháng năm mới_, `QĐ-106c` không tính lại; mốc nguồn là 01/01, lượt có thể chạy trễ.
- Ví dụ: Figma 15, kỳ mới giá 18 từ 20/12/2026; lượt chạy 05/02/2027 khi kỳ giá 22 đã bắt đầu 01/02.
- Phương án: A. Giá hiện hành ngày chạy (⟹ 22). B. Giá hiệu lực ngày 01/01/`Y` (⟹ 18); thiếu ⟹ giá một seat của khoản năm trước. C. Giá Request lúc duyệt.
- **Chọn B** — lượt trễ không đổi kết quả; đúng mốc nguồn.
- Đổi lại: tham số `on` của `CatalogApi.getPlanPrice` trong `year-start-commitments.policy.ts`.

### Q-48 — Năm đầu cài đặt và triển khai giữa năm (giữ)

- Bối cảnh: job tạo khoản _ngày 01/01_; tổ chức cài giữa năm hoặc W4 triển khai tháng 11 sẽ tạo hồi tố.
- Ví dụ: triển khai W4 ngày 20/11/2026; seed tạo tổ chức hôm nay.
- Phương án: A. Bỏ năm `Y` nếu tổ chức tạo sau 01/01/`Y`; migration đánh dấu năm hiện hành đã chạy. B. Chỉ chạy trong tháng 01.
- **Chọn A** — không hồi tố, không phụ thuộc thời điểm khởi động.
- Đổi lại: điều kiện `createdAt` (`OrganizationReadApi.getOrganization`) trong `year-start-commitments.service.ts` + khối `INSERT` trong migration.

### Q-49 — Ai xác nhận bàn giao khi thu hồi nguồn `ROLE_ENDED` (mới, DA4-07)

- Bối cảnh: `handover-confirmer.policy.ts:36-63` — nguồn không có trong bảng rơi về `DEPARTMENT_HEAD`; gói mất dữ liệu (hộp thư) sẽ chờ trưởng phòng của người thôi vai.
- Ví dụ: `C1` thôi vai Người duyệt chi, hết hạn giữ hộp thư Google Workspace (`dataLossOnRemoval`).
- Phương án: A. `IT_ADMIN` (thêm vào `IT_SOURCES`, như `TIME_LIMITED_EXPIRY`). B. Chính người giữ (như `RETURN`). C. Trưởng phòng (mặc định hiện tại).
- **Chọn A** — một dòng; IT là người mở việc thu hồi theo `QĐ-106f`.
- Đổi lại: `roleOf` trong `handover-confirmer.policy.ts` (B: `{ role: 'REQUESTER', fixedEmployeeId: holder }`).

### Q-50 — Khóa `K4` khi thu hồi mà gói chưa có điều khoản chuyển máy (mới, DA4-24)

- Bối cảnh: `FR-2.10` _về kho nếu cho chuyển máy, nếu không thì không về kho_; catalog chưa lưu điều khoản (`transferAllowed` luôn null).
- Ví dụ: Office 2021 OEM gắn máy cũ của `E1`; IT gỡ kích hoạt `KEY-8`.
- Phương án: A. `keyDisposition` bắt buộc với `K4` (`RETURN_TO_STORE` | `WITHDRAW` + lý do), rút trong cùng transaction. B. Mặc định về kho, IT có thể rút. C. Thêm điều
  khoản vào gói (catalog) rồi tự quyết.
- **Chọn A** — không bao giờ có khóa chết ở _Trống_; không đổi catalog.
- Đổi lại: B = `keyDisposition` tùy chọn mặc định `RETURN_TO_STORE`; C = cột điều khoản ở plan + `releaseKeyOnRevocation`.

### Q-51 — Thiết bị chưa xác nhận `BM-06` có gắn khóa `K4` được không (mới, DA4-02)

- Bối cảnh: `device-binding.types.ts:15-19` để xác nhận của người giữ thiết bị là _câu mở của Owner_; `US-07-01` AC-10 chỉ đòi _thiết bị công ty đã đăng ký_.
- Ví dụ: `E2` vừa nhận laptop `D2`, chưa ký `BM-06`; `IT1` gắn `KEY-9`.
- Phương án: A. Không cần xác nhận. B. Cần `CONFIRMED` (khác ⟹ 422 `DEVICE_NOT_ACKNOWLEDGED`).
- **Chọn A** — đúng chữ AC-10; không chặn MF-1 bởi việc của luồng thiết bị.
- Đổi lại: bật điều kiện acknowledgement trong `judgeKeyBinding` (`device-binding.policy.ts:66`).
- **W2-N4 — diễn giải Trần phòng. ĐÃ QUYẾT (chat review, QT 4.3 thắng US):** bắt buộc cho mỗi Trần phòng khi phát hành; thiếu ⟹ `BUDGET.CEILINGS_INCOMPLETE` với `details.explanationMissingDepartmentIds`. Chỉ đổi diễn giải không bỏ phát hành (F-032). Đã cài ở `fix(qd103-w2): cycle-ceilings R3`.

## Câu khi thiết kế W5 (Q-52 → Q-81)

Phát sinh khi soạn và audit thiết kế W5 (`SBF-20` + `SBF-11`), 08/11/2026; bản cuối sau audit. Q-53, 54, 55, 57, 59, 64, 65, 66, 67, 69, 73, 75, 76, 80 **theo nguồn**; Q-52, 56, 62, 63, 74, 79 **kỹ thuật** (chat review chọn, ghi trong spec, không mở); Q-77 là **lệch Docs** (xem cuối mục). Q-07 thêm vế: thời điểm phát hiện qua hóa đơn = lúc Finance xác nhận (kỹ thuật). Các câu còn cần Owner: **TẠM CHỌN (chờ Owner)**.

### Câu đã có nguồn (không còn là tạm chọn — bỏ khỏi danh sách hỏi Owner)

| Câu                                      | Nguồn (`file:dòng`)                                                                                                                                                    | Spec theo thế nào                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Q-53 không carry seat đã quyết thu hồi   | `Docs/Decisions/project-decisions.md:289` (`QĐ-103v`(2) _không gồm quyền đã quyết thu hồi_); `Docs/BE-UserStory/epics/EP-11.md:59` (US-11-03 AC-5 không vượt sức chứa) | AP mục 7; rủi ro kẹt kỳ cũ xử lý ở mục 8 (DA5-02)                                  |
| Q-54 gói tháng đã mặc định không ghi lại | `project-decisions.md:289` (`QĐ-103v`(5)); `EP-11.md:135` (US-11-04 AC-19); `EP-11.md:217` (US-11-08 AC-24)                                                            | AI mục 4: điểm đóng sau mặc định                                                   |
| Q-55 kỳ nhắc `K1`                        | `EP-11.md:237` (US-11-09 _Dữ liệu nghiệp vụ_: ngày kỳ kế tiếp — US-04-03); người nhận `EP-11.md:252` (AC-1)                                                            | AI mục 10: `renewal_date` của thuê bao `K1`; `valid_from` chỉ là dự phòng kỹ thuật |
| Q-57 điều kiện đóng                      | `project-decisions.md:283` (`QĐ-99i`); BRD dòng 441 (`FR-1.12`(10)); `Quy trình và chính sách theo main flow.md:1035-1043` (C.2.3, A/R IT Admin phụ trách)             | CK mục 1 (+ ca dữ liệu cũ DA5-12)                                                  |
| Q-59 vế `K1`                             | BRD dòng 904; QT dòng 1051 (_K1 có thực khi kỳ sau không còn bị trừ tiền_)                                                                                             | có nguồn; hoãn W8 là phạm vi ⟹ ledger. Hủy `K2` làm ở CK mục 5                     |
| Q-64 vế từng kho                         | `EP-12.md:900` (US-12-18 AC-8: IT Admin phụ trách); QT dòng 145; `project-decisions.md:356` (`QĐ-106h`(2))                                                             | SM mục 7                                                                           |
| Q-65 lũy kế + báo lại                    | `EP-12.md:979-980` (US-12-20 AC-5, AC-6); `project-decisions.md:451` (`QĐ-106k`)                                                                                       | SM mục 4, 8                                                                        |
| Q-61 vế thu hồi giữa tháng               | `EP-12.md:902` (US-12-18 AC-10: 7,50 thành chi phí, phần còn lại giải phóng)                                                                                           | SM mục 2, 5                                                                        |
| Q-66 bỏ ý kiến điều khoản                | `project-decisions.md:568` (`QĐ-104l`(1)); BRD dòng 326, 430 (`FR-1.10` không có ý kiến)                                                                               | BO mục 7                                                                           |
| Q-67 ngừng dùng không xác nhận           | BRD dòng 409 (`FR-1.1`)                                                                                                                                                | BO mục 3                                                                           |
| Q-73 PATCH giảm gói tháng chặn           | `project-decisions.md:287` (`QĐ-103e` _giảm ở mỗi kỳ_ = tại điểm); BRD dòng 433 (`FR-1.12`(2))                                                                         | AP mục 9                                                                           |
| Q-75 tự gắn Request khi tăng             | `EP-11.md:204` (US-11-08 AC-11 _kèm 6 Request làm căn cứ_)                                                                                                             | AP mục 5                                                                           |
| Q-76 bằng chứng mức tối thiểu            | `project-decisions.md:290` (`QĐ-104d`(1)); `EP-11.md:206` (AC-13)                                                                                                      | AP mục 5                                                                           |
| Q-80 tự gia hạn _chưa rõ_                | `EP-11.md:121` (US-11-04 AC-5: cảnh báo chất lượng dữ liệu, không sự cố)                                                                                               | AI: `auto_renew` nullable + cảnh báo, không sự cố                                  |
| Q-69 chuyển IT Admin phụ trách           | BRD dòng 326; `project-decisions.md:568` (`SBF-16` chuyển trước ngày hiệu lực)                                                                                         | ngoài phạm vi W5 ⟹ ledger `NGOÀI-PHẠM-VI`                                          |
| Q-77 tên nguồn `KPI-4`                   | không phải câu chọn — `EP-12.md:936,941,943` (US-12-19 AC-1/6/8) trái `project-decisions.md:290` (`QĐ-104d`(1))                                                        | giữ ánh xạ sang mặc định/`deviation`; báo Owner sửa Docs (dưới)                    |

**Kỹ thuật — đã chốt trong spec, bỏ khỏi `QUESTIONS.md`:** Q-52 (vế thời điểm của Q-07 C = lúc Finance xác nhận — AI mục 5c), Q-56 (`nextBillingDate` — AI mục 11),
Q-62 (tháng bắt đầu, hóa đơn cũ — SM mục 1, 6), Q-63 (làm tròn, chênh vào tháng xác nhận — SM mục 3, 4), Q-64 vế toàn kho (mọi IT Admin dùng được — SM mục 7),
Q-74 (mở ở `point_date`, chụp tham số + `opening_seats_needed` — AP mục 3), Q-79 (số đã trả = kỳ cũ; tháng hiện hành `NOT_COMPUTED` — CK mục 2, 3).

### Câu tạm chọn (bản cuối) — còn cần Owner

Câu W0 W5 dùng tiếp, không đổi: Q-07 = C (thêm vế thời điểm kỹ thuật ở trên), Q-08 = A, Q-09, Q-11 = A, Q-43 = A (W4; W5 thay nguồn số bằng điểm chi phối).

### Q-58 — Tiết kiệm thực so giá trước thuế hay chi phí thực chịu (thu hẹp)

- Bối cảnh: _cùng độ dài kỳ_, _mỗi kỳ sau_, baseline trước lần giảm đã có nguồn (BRD dòng 906; `EP-12.md:178,181`); `QĐ-60a` định nghĩa thực chi = giá + thuế không
  khấu trừ + phí; nguồn tiết kiệm không nói so cột nào.
- Ví dụ: Figma kỳ cũ 12 000 + 1 200 thuế nhà thầu (không khấu trừ); kỳ mới 10 560 + 1 584 (thuế suất đổi). Trước thuế ⟹ 1 440; thực chịu ⟹ 1 056.
- Phương án: A. `net_minor` (trước thuế). B. `net + thuế không khấu trừ` (thực chịu, khớp thực chi).
- **Chọn A** — tách hiệu quả giảm seat khỏi biến động thuế/tỷ giá; khớp ví dụ US-11-03 AC-3, AC-21.
- Đổi lại: hàm so trong `budgets/realised-saving/realised-saving.policy.ts` (đổi cột, không đổi bảng).

### Q-60 — Nhà cung cấp **từ chối** giảm có đếm `KPI-4` không (gộp Q-78)

- Bối cảnh: `KPI-4` chỉ loại _gói năm giữa kỳ, mức tối thiểu_ (BRD dòng 98); US-11-03 AC-18 nói seat-tháng thừa được đo khi nhà cung cấp gia hạn khác số
  (`EP-11.md:72`), AC-15 gần cùng ca nhưng là _từ chối_ (`EP-11.md:69`). Thiết kế phân `deviation` `VENDOR_REFUSED` (không sự cố) và `AUTO_RENEWED` (sự cố — `QĐ-106i`(4)).
- Ví dụ: Figma cần 88, IT đề nghị giảm 100 → 88 trước hạn chót, nhà cung cấp từ chối, kỳ mới 100; 12 seat Trống cả năm.
- Phương án: A. `VENDOR_REFUSED` không đếm (IT đã làm đúng hạn — không phải _lỡ điểm_). B. Đếm như `AUTO_RENEWED`. C. Không phân hai loại, mọi lệch đều đếm.
- **Chọn A** — `KPI-4` đo việc lỡ điểm điều chỉnh, không đo việc nhà cung cấp từ chối.
- Đổi lại: thêm nguồn `VENDOR_REFUSED` vào enum `Kpi4Source` + nhánh trong `licensing/kpi4/kpi4.policy.ts` (migration `ADD VALUE` riêng).

### Q-61 — Khoản cam kết `K2`: phần tháng **trước ngày cấp** của Request đã duyệt (thu hẹp)

- Bối cảnh: vế thu hồi giữa tháng đã có nguồn (`EP-12.md:902`); nguồn không nói tháng mà Request đã duyệt nhưng cấp giữa tháng.
- Ví dụ: Request duyệt 01/10 khoản 15/tháng, cấp 16/10; seat-tháng tháng 10 = 7,74.
- Phương án: A. Giải phóng 7,26 (chỉ seat-tháng thật thành chi phí). B. Giữ cả 15 thành chi phí tháng 10.
- **Chọn A** — thực chi phòng = seat-tháng ở mọi nơi (`QĐ-104c`(1)).
- Đổi lại: `slice` trong `budgets/seat-cost/seat-cost.policy.ts` (B: `accrued = slice` khi có Assignment trong tháng).

### Q-68 — IT Admin phụ trách của ứng dụng cũ (thêm bước theo DA5-37)

- Bối cảnh: `INV-06` đòi mỗi mục có một IT Admin phụ trách; dữ liệu cũ chỉ có Business Owner; phần mềm nội bộ không có thuê bao.
- Ví dụ: _Cổng báo cáo nội bộ_ (`K5`, Business Owner `A1` là IT Admin); Office 2021 (`K4` chỉ khóa, Business Owner `E2` là Employee).
- Phương án: A. Thuê bao `ACTIVE` mới nhất → Business Owner cũ nếu là IT Admin dùng được → NULL + cảnh báo. B. Chỉ thuê bao → NULL. C. Gán mọi NULL cho một IT Admin
  mặc định (Super Admin chọn khi migration).
- **Chọn A** — có căn cứ, không đoán; NULL hiện cảnh báo và `ops:inspect`.
- Đổi lại: khối backfill trong migration `<ts>_application_responsible_it_admin` (trước khi deploy; sau deploy chỉ sửa qua `applicationUpdate`).

### Q-70 — Liên kết Request với gói khi ứng dụng thiếu IT Admin phụ trách dùng được (đổi theo DA5-37)

- Bối cảnh: `INV-06` (`QĐ-103v`(4)) bắt buộc có người phụ trách nhưng không nói chặn luồng; chặn sẽ làm `MF-1`/`SBF-15` tắc cho mọi ứng dụng NULL sau migration.
- Ví dụ: Request phần mềm nội bộ _Cổng báo cáo_ (NULL) chờ IT liên kết gói.
- Phương án: A. Không chặn — 200 + cảnh báo `RESPONSIBLE_IT_ADMIN_MISSING`, audit. B. Chặn 409 `ACCESS_REQUEST.RESPONSIBLE_IT_ADMIN_REQUIRED` (bản nháp cũ).
- **Chọn A** — không làm vỡ luồng chính; cảnh báo + `ops:inspect` đẩy IT điền.
- Đổi lại: điều kiện trong `requests/assessment/catalog-link.service.ts` (B thêm lỗi + mã HTTP).

### Q-71 — Dữ liệu `subscription_renewals` cũ (giữ)

- Bối cảnh: chuỗi propose/decide bị bỏ; bảng cũ có ca đã đề xuất/quyết; drop là không hoàn tác (DB-05).
- Ví dụ: ca Figma 2026 đã _quyết giảm_ nhưng chưa ghi kết quả lúc triển khai W5.
- Phương án: A. Không chép, drop ở contract (lịch sử ở Audit Trail). B. Bảng lưu trữ chỉ đọc trước khi drop. C. Chuyển ca mở thành điểm điều chỉnh mở.
- **Chọn A** — nhánh chưa phát hành, dữ liệu demo; Audit Trail giữ dấu vết.
- Đổi lại: thêm `CREATE TABLE … AS SELECT` vào migration contract trước DROP (B) hoặc bước chuyển trong Task 10 (C).

### Q-72 — IT Admin không phải người phụ trách có ghi kết quả/đóng được không (đổi chiều theo nguồn)

- Bối cảnh: nguồn nghiêng về chỉ người phụ trách (BRD dòng 435 `FR-1.12`(4); `EP-11.md:216` AC-23); người phụ trách vắng thì tắc. Cùng luật cho ghi kết quả và
  đóng (DA5-13).
- Ví dụ: `IT2` phụ trách Figma nghỉ phép dài (vẫn dùng được); `IT1` muốn ghi kết quả trước hạn chót.
- Phương án: A. Chỉ người phụ trách; người phụ trách **không dùng được** ⟹ IT Admin dùng được bất kỳ (audit `byResponsible:false`). B. Mọi IT Admin dùng được.
- **Chọn A** — đúng AC-23; vẫn có lối thoát khi người phụ trách nghỉ/khóa.
- Đổi lại: một hàm quyền dùng chung trong `subscription-adjustment` (record + closure).

### Q-81 — Sau khi IT đã ghi _hủy_ mà có Request được duyệt (mới, DA5-03)

- Bối cảnh: `FR-1.12`(10) _ngừng cấp mới_; US-11-04 AC-12 (`EP-11.md:128`) cho IT _ghi gia hạn_ sau khi đã ghi hủy khi có Request mới được duyệt; một kết quả mỗi kỳ.
- Ví dụ: Loom ghi `CANCEL` 01/11 (cần 0); 15/12 Request của `E5` được duyệt; kỳ kết thúc 31/12.
- Phương án: A. Chặn cấp từ thuê bao đã hủy, không cho thay — Request phải chờ thuê bao/gói mới. B. Chặn cấp, nhưng cho IT **thay** `CANCEL` một lần bằng kết quả đúng số
  trước R hoặc khi sự cố _hết hạn chưa gia hạn_ còn mở; audit trước/sau, Finance được báo lại.
- **Chọn B** — khớp US-11-04 AC-12, không ngõ cụt; vẫn ngừng cấp mới cho tới khi thay.
- Đổi lại: điều kiện thay trong `record/subscription-adjustment-record.policy.ts` + trigger cột kết quả (A: bỏ nhánh thay, giữ `stopGrants`).
- **W2-N5 — vai MANAGER cho trưởng phòng sắp nhậm chức. ĐÃ QUYẾT (chat review, phương án hẹp):** không nới vai ở token (`QĐ-93a`/`QĐ-95e`); route B3 dùng `RequireRolesOrGrants` (guard kiểm grant) và service xét đơn vị; `/me.upcomingUnits`. Đổi lại phương án: nới guard như `46b6a94e`.
- **W2-N6 — reschedule transfer vào phòng chưa hiệu lực. ĐÃ SỬA** (`fix(qd103-w2): department-effective-year F-033…F-045`). Còn lại: trigger DB làm lớp chặn thứ hai chưa làm (fixture SQL cũ).

## Câu khi thiết kế W6 (Q-82 → Q-96)

Phát sinh khi soạn và audit thiết kế W6 (MF-5), 09/11/2026; bản cuối sau audit (41 finding, 6 Cao). Q-84, 85, 86, 87, 89, 91, 93, 95, 96 **theo nguồn**; Q-88, 90, 92, 94 **kỹ thuật** (chốt trong spec); Q-82, Q-83 **TẠM CHỌN (chờ Owner)**. Q-12 giữ `TẠM CHỌN (chờ Owner): A`.

### 4. Câu hỏi Q-82 → Q-96 sau audit

### 4.1. Câu đã có nguồn (thiết kế theo nguồn, không hỏi Owner)

| ID / câu                      | Thiết kế                                                                                                         | Nguồn                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Q-84 sai lệch `FR-4.8`        | danh sách phát hiện + số đếm dashboard IT; hồ sơ `SBF-08` NGOÀI-PHẠM-VI (LEDGER)                                 | README tracker §1 (`SBF-08` ngoài phạm vi), BRD `FR-4.8`         |
| Q-85 lần nhập đầu             | chặn ghi tới khi IT xác nhận đã báo hoặc hệ thống gửi; **người được cấp sau**: gửi ở mọi lần xác nhận (làm ở W6) | `US-08-05` AC-1→AC-4 (`EP-08:184-187`), `SBF-04a` `a_notice`     |
| Q-86 định danh chưa khớp      | không xuất hiện + ứng dụng còn định danh mở ⟹ `UNMATCHED_IDENTITY`; mở rộng: ứng viên `AMBIGUOUS`, CF-7          | `FR-4.10`, `TC-4`, `US-08-04` AC-2, AC-7                         |
| Q-87 hạn sau điều chuyển      | hạn = ngày vào hàng trưởng phòng mới + 5 ngày làm việc; không trưởng phòng ⟹ hạn giữ                             | `US-10-06` AC-16, AC-19, AC-9                                    |
| Q-89 đã quyết rồi điều chuyển | không tạm dừng                                                                                                   | `FR-3.10` _đang chờ_, `QĐ-90c` _chưa được quyết_                 |
| Q-91 người nhận lỗi thời      | IT Admin (mọi IT Admin dùng được), một lần mỗi (nguồn, `coverage_to`)                                            | BRD bảng thông báo dòng 1077 (`OQ-E-11` ở EP-10/EP-12 lệch — §9) |
| Q-93 tiềm năng                | `monthlyAmountMinor` + `amountAtPointMinor` (`K2` năm ×12 tại gia hạn; tháng; `K1` kỳ thu kế; `K4` `NEVER`)      | `FR-4.14` (180 USD), `FR-4.15`, `US-10-04` AC-3                  |
| Q-95 tác vụ đóng thất bại     | giữ _đã quyết Thu hồi_, IT mở lại bằng quyết định _Thu hồi_ cuối (không ân hạn mới, không báo lại)               | `MF-5.md:60` (`QĐ-62i`), `SBF-18`, `QĐ-64a`                      |
| Q-96 gộp thông báo            | gộp theo tuần ISO mỗi người nhận (trưởng phòng; IT cho `ACTION`)                                                 | `SBF-04.md` bước 5 _gộp theo tuần_                               |
| Q-12 (W0) `G1` cho `K4`       | giữ **TẠM CHỌN A** của QUESTIONS (chờ Owner, không phải câu mới)                                                 | `QUESTIONS.md:25`                                                |

Khác (đã theo nguồn từ bản nháp): ân hạn 7 ngày lịch từ ngày quyết (`US-10-07` AC-18), `G2` không ân hạn; luật _còn trên 1 tháng_ chỉ quyền có thời
hạn, lúc quét, lúc quyết **và khuyến nghị đang chờ tự đóng** (QT ngoại lệ MF-5); `G2` thay khuyến nghị tạm dừng (`QĐ-108i`); `G2` hiện tới khi thu hồi
xong (`US-07-05` AC-12, AC-15); tạm dừng khi điều chuyển **đã hiệu lực** (`EP-10:258`); mất trưởng phòng ⟹ chờ có kiểm soát (`SBF-04` bước 5); cổng 5
so `review`; độ mới 7/14 theo loại nguồn (`QĐ-101b`); collector không kết luận một mình; seat trưởng phòng tự quyết (`QĐ-104h`); chặn ứng dụng liên lạc
(`US-08-02` AC-3); `AUTH_ONLY` = xuất hiện, không hoạt động (`US-10-03` AC-10); ngày ngoài bao phủ không đếm (`FR-4.14a`(3)); `KPI-5` chỉ Super Admin.

### 4.2. Lựa chọn kỹ thuật (ghi trong spec, không hỏi)

Q-88 (gỡ lý do ngay khi IT trả lại; quyết lại `notBefore = max(mốc đầu, hôm nay)`, báo một lần — lệch chữ L4-08(5)); Q-90 (nhắc quá hạn một lần + cờ);
Q-92 (đã quyết _Thu hồi_ không tự đóng khi có hoạt động mới, cờ `activity_after_decision_on`); Q-94 (hàng loạt tất cả hoặc không); module `optimization`
T7 + `dashboards` T8; gắn nhân viên vào usage **lúc đọc** + `usageIdentityMappingEnd`; độ mới là hằng theo loại nguồn (không cột sửa được); `MONITOR`
chụp lại bằng chứng khi lên tầng; `seat_chain_id` = Assignment gốc; facade `listSeatsForRules`, `getRevocationTaskStatuses`, `getSeatPricingFacts` ở
`LicensingApi`; listener `SKIP LOCKED` + đối soát lượt ngày, service khóa khuyến nghị trước; mẫu số `KPI-5` bỏ tầng _Theo dõi_; CF-6 trên ngày bao phủ;
lý do không mốc thắng ân hạn; báo người giữ opt-in.

### 4.3. Câu tạm chọn (bản cuối) — chỉ câu cần Owner

**Q-82 — `G2` có thay khuyến nghị `G3`/`G4` _chưa quyết_ (không tạm dừng) trên cùng seat không?**

- _Bối cảnh:_ cổng 8 (`FR-4.9`) loại seat đã có khuyến nghị mở; ngoại lệ duy nhất là `G2` thay khuyến nghị **tạm dừng** (`QĐ-108i`). Nguồn không nói
  khuyến nghị đang chờ trưởng phòng khi người giữ nghỉ việc.
- _Ví dụ:_ `G4` Figma của `E1` chờ `H1` từ 01/10; `E1` nghỉ việc 05/10, seat còn gán. Lượt ngày 06/10 gặp seat có `G4` đang mở.
- _Phương án:_ **A** — `G2` thay `G4`: `G4` đóng _bị thay thế_ (tính `KPI-5`), `G2` gửi thẳng IT. **B** — như A nhưng `G4` đóng lý do riêng
  _người giữ đã nghỉ_, **không** tính `KPI-5`. **C** — theo chữ cổng 8: không sinh `G2`, `G4` ở lại hàng `H1` (MF-2 vẫn thu hồi theo luồng nghỉ việc).
- _Chọn:_ **A** — một luật với `QĐ-108i`, người đã nghỉ không nằm chờ trưởng phòng (`QT 5.3` _`G2` gửi thẳng IT_). Nhược: `KPI-5` tính cả khuyến nghị
  không sai. Khuyến nghị đã quyết _Thu hồi_ thì không thay (đặt nhãn _người giữ đã nghỉ_).
- _Đổi lại:_ B — migration `*_values` thêm `HOLDER_LEFT` vào `GhostSeatCloseReason`, nhánh trong `internal-rules.policy.ts`, bỏ khỏi tập `KPI-5` ở
  `ghost-seat-state.policy.ts`; C — nhánh policy trả `OPEN_RECOMMENDATION`. A/B cần Owner sửa chữ cổng 8 ở Docs (§9).

**Q-83 — Thu hồi `G2` mở `SBF-18` với nguồn nào?**

- _Bối cảnh:_ nguồn quyết định ai xác nhận bàn giao: `DEPARTURE` **luôn** đòi trưởng phòng xác nhận (`QĐ-66p`, `handover-confirmer.policy.ts:56-58`) với
  hạn ngắn; `ABRUPT_DEPARTURE` chỉ đòi khi gói _mất dữ liệu khi gỡ_ và có giữ gỡ `ABRUPT_DEPARTURE_HOLD_WORKING_DAYS`.
- _Ví dụ:_ `E3` nghỉ từ tháng 3 (dữ liệu khởi tạo `FR-9.5`), còn seat Jira (không mất dữ liệu). IT bấm _Thu hồi_ trên `G2` hôm nay.
- _Phương án:_ **A** `DEPARTURE` — `H1` có duty xác nhận bàn giao, quá hạn gần như ngay. **B** `ABRUPT_DEPARTURE` — không duty với Jira; gói mất dữ
  liệu thì `H1` xác nhận, gỡ giữ chờ N ngày làm việc. **C** nguồn mới `LEAVER_SEAT` với luật bàn giao riêng.
- _Chọn:_ **B** — người đã nghỉ từ lâu không còn gì để bàn giao trừ gói mất dữ liệu; không thêm nguồn mới. Hủy nghỉ việc gỡ theo `(DEPARTURE, caseId)` sẽ
  không đụng tác vụ `G2` (tham chiếu khuyến nghị) — cố ý.
- _Đổi lại:_ A — một hằng trong `board-reclaim.service.ts`; C — migration `*_values` cho `RevocationSource` + nhánh `handover-confirmer.policy.ts`.

## Câu khi thiết kế W7 (Q-97 → Q-110)

Phát sinh khi soạn và audit thiết kế W7 (seed/demo), 09/11/2026; bản cuối sau audit (28 finding, 6 Cao). Câu theo nguồn và câu kỹ thuật ghi riêng bên dưới; câu cần Owner: **TẠM CHỌN (chờ Owner)**.

### 2. Câu tạm chọn (bản cuối) — cần Owner

Năm câu dưới cần Owner vì quyết định thứ Owner **thấy** khi demo. Mỗi câu đang TẠM CHỌN theo chế độ tự chạy; đổi lại chỉ chạm fixture + bảng kịch bản.

### Q-101 — Loom _hết hạn chưa gia hạn_ có hiện ngay khi demo không?

- **Bối cảnh:** sự cố `EXPIRED_NOT_RENEWED` (QT C.2, R-G06) chỉ sinh khi **hôm nay ≥ ngày gia hạn** mà chưa ghi kết quả và còn quyền mở. Seed không giả
  ngày (Q-100).
- **Ví dụ:** Loom gia hạn `D0+3` ⟹ seed ngày 10/11 thì sự cố có từ 13/11. W9 gọi tay ở `D0` không thấy; flow thấy ở DS20-18, DS20-22 (gia hạn trễ).
- **Phương án:** (A) gia hạn `D0+3`, sự cố chỉ qua flow — dữ liệu luôn là _kỳ đang chạy_; (B) tạo kỳ Loom đã qua ngày gia hạn (`renewalInDays` = −2) ⟹ sự
  cố có ngay ở lượt quét đầu, W9 thấy ở `D0`; phải kiểm luật khai thuê bao W1 có nhận kỳ không chứa hôm nay; (C) hai thuê bao Loom — trái R-E02, loại.
- **Chọn:** A.
- **Cách đổi lại:** `fixture/shared-demo-v4/catalog.ts` Loom `renewalInDays` = −2; DS20-18, DS20-22 đổi _Khi_ thành `D0`; unit _tham số_.

### Q-103 — Giữ ba kết quả ngân sách (trong cơ sở / dùng dự phòng / bị chặn) ổn định qua các tháng thế nào?

- **Bối cảnh:** kiểm tra ngân sách tính `cơ sở − thực chi − đang giữ − chờ`; từ tháng thứ hai sau seed, thực chi `K2` của phòng = seat-tháng của người
  giữ trong phòng (W5 `seat-month-cost-pool-line`). Bản nháp chỉ đúng trong tháng seed.
- **Ví dụ:** MKT có 14 người giữ Google Workspace 150.000 ⟹ hết tháng đầu thực chi 2,1 triệu ≫ cơ sở 240.000 ⟹ R10 thành _bị chặn_ thay vì _dùng dự
  phòng_. Reset VPS cuối tháng rồi trình bày đầu tháng sau sẽ lệch kịch bản.
- **Phương án:** (A) MKT, SAL **không** giữ seat trả phí nền (không Google Workspace/Jira/Figma/Loom; Loom chuyển NV-DES5; NV-MOV1 điều chuyển sang ENG);
  SAL 290.000 để thêm ca _Request một bước dùng dự phòng_ (DM1-53) — ổn định tới 31/12, đổi lại hai phòng "không dùng phần mềm trả phí" (kém thực tế);
  (B) giữ seat nền, nâng cơ sở theo seat-tháng tới 31/12 — kết quả vẫn trôi vì thực chi tăng dần còn cơ sở cố định, chỉ đúng một tháng; (C) giữ nguyên,
  README ghi "chỉ đúng trong tháng seed" — W9 và mọi buổi demo phải reset trong tháng.
- **Chọn:** A.
- **Cách đổi lại:** quy tắc seat nền ở `fixture/shared-demo-v4/catalog.ts` + số cơ sở ở `finance.ts` + unit bất đẳng thức _ba kết quả ngân sách_.

### Q-104 — Phòng mới DAT có trưởng phòng trước 01/01 không?

- **Bối cảnh:** phòng mới chỉ tạo trong kỳ lập ngân sách, hiệu lực 01/01 năm sau (R-I10); trưởng phòng đã gán nộp `BM-10` được trước, phòng không trưởng
  phòng tới hạn ⟹ Finance lập phiên bản từ số liệu nền (R-I05).
- **Ví dụ:** không gán ⟹ demo cửa sổ tạo phòng, Trần `Y+1` của DAT, từ chối xếp người trước 01/01 (DM4-22), Finance lập phiên bản số liệu nền DAT (DM4-13,
  khi `D0` đã qua hạn nộp `Y+1`). Gán ⟹ demo "trưởng phòng phòng mới nộp trước".
- **Phương án:** (A) không gán; (B) gán một người làm trưởng phòng DAT hiệu lực 01/01/`Y+1` — cần thêm điều chuyển hiệu lực 01/01 và mất ca số liệu nền.
- **Chọn:** A.
- **Cách đổi lại:** step `budget.next-cycle` thêm gán trưởng phòng + điều chuyển; DM4-13 đổi thành nộp đề xuất DAT.

### Q-106 — Chạy lại seed ở ngày khác cùng năm (sau buổi demo) thì sao?

- **Bối cảnh:** W9 hoặc buổi demo đẩy dữ liệu đi tiếp (duyệt Request, ghi điểm điều chỉnh, sửa Trần, đóng Notion…); sau đó có thể chạy lại seed để bù dữ
  liệu thiếu (ví dụ lỗi mạng giữa chừng).
- **Ví dụ:** seed 05/11; W9 duyệt R02, ghi điểm Figma, phát hành lại kỳ `Y+1`, đóng Notion; chạy lại seed 10/11.
- **Phương án:** (A) tìm theo khóa bền, không so ngày; bản ghi **đã đi tiếp ⟹ `present`** theo bảng từng loại (Request theo đường kịch bản; thuê bao
  theo chuỗi kỳ kể cả `CLOSED`; kỳ/Trần đã phát hành một lần; đề xuất/phiên bản, hóa đơn, khóa, quyền theo vai, usage, nhân sự có bất kỳ trạng thái);
  mốc ngày giữ của lần đầu; muốn làm mới ⟹ reset; (B) chạy lại "làm mới" theo `D0` mới — trùng thuê bao bị chặn (R-E02), không làm được; (C) chạy lại
  khác ngày ⟹ từ chối, buộc reset — an toàn nhưng mất khả năng bù dữ liệu.
- **Chọn:** A. **Sửa so với nháp:** bỏ "so _số lượng khai báo ban đầu_" (không có trường lưu); không so trường demo có thể đổi.
- **Cách đổi lại:** luật `present` nằm ở `isPastTarget` (`scenario-path.ts`) + hàm tìm của từng step; C = thêm kiểm ngày dataset ở `seed-run.ts`.

### Q-108 — Bộ hóa đơn `SBF-19` của dataset

- **Bối cảnh:** `SBF-19` cần hóa đơn ở các trạng thái (xác nhận, chờ, bị trả lại) và cờ _vượt_; tiết kiệm thực khi hủy thuê bao chỉ ghi khi có hóa đơn
  `CONFIRMED` phủ kỳ cam kết cuối (W5).
- **Ví dụ:** hủy và đóng Notion (DS20-13) mà không có hóa đơn Notion ⟹ báo cáo tiết kiệm thực trống.
- **Phương án:** (A) 5 hóa đơn: SV-HD1 `K1` xác nhận một phần, SV-HD2 `K1` có thuế chờ xác nhận, SV-HD3 kho Jira cờ _vượt_ số tiền, SV-HD4 Slack bị trả
  lại, SV-HD5 Notion xác nhận; trùng/`K4` vượt/mua thêm làm trực tiếp ở W9; (B) 4 hóa đơn như nháp, DS20-13 khẳng định "không dòng" — mất minh họa
  tiết kiệm thực; (C) hóa đơn cho mọi thuê bao — nhiều dữ liệu, ít giá trị demo.
- **Chọn:** A. **Sửa so với nháp:** SV-HD3 là cờ _vượt_ số tiền (không phải "vượt kỳ"); quá hạn xác nhận (DM1-52) dùng SV-HD4, không dùng SV-HD2.
- **Cách đổi lại:** `fixture/shared-demo-v4/invoices.ts` + DS20-13.

### 3. Câu theo nguồn (không hỏi Owner)

| Câu   | Chọn                                                                                                       | Nguồn                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Q-97  | 120 người (36 persona + 84 nền), 15 SaaS + `K4` + `K5`, 2 IT Admin; 10 phòng nghiệp vụ + ADMIN             | BRD 3.4 dòng 235–238 (100–500 người, 15–40 SaaS, 1–3 IT Admin)                                                 |
| Q-102 | `G2` dựng bằng ghi nghỉ việc _chặn ngay_ ngày cuối `D0`, không gọi mở thu hồi                              | `offboarding-case-writer.service.ts:33`, `:86-90` (`LEFT` ngay, không tự mở thu hồi); `ghost-seat-g1-g2` mục 3 |
| Q-105 | thêm LGL (không trưởng phòng, có Cost Center): phiên bản `BASELINE`, Request một bước `NO_DEPARTMENT_HEAD` | RULES R-A07, R-I05                                                                                             |

### 4. Câu kỹ thuật (chat review tự chọn, ghi ở spec)

| Câu   | Chọn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-98  | Giữ: fixture mới `shared-demo-v4`, xóa v3; DB có Audit `DEMO_DATASET:` của fixture khác ⟹ từ chối (`seed-run.ts:184-195`); Owner reset VPS.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q-99  | **Đổi.** Job điểm/đỏ/sự cố/`G1`–`G4` chạy trong **tiến trình API** (`worker.module.ts:22` chỉ có email + request work), lần đầu 5 phút sau khi API khởi động; lượt rule claim một lần mỗi kỳ ⟹ lượt chạy giữa lúc seed khóa kỳ với dữ liệu thiếu, khởi động lại không cứu. Chọn: API phục vụ apply mới khởi động ngay trước apply (local giữ; VPS nhánh không reset thêm `compose restart api`); apply ≤ 4 phút (đo ở integration, vượt ⟹ báo chat review — dự phòng: biến env lùi lượt đầu, đổi `src`, hạng mục riêng); step `jobs.first-pass-guard` (`-mf5`) phát hiện lượt chạy giữa lúc seed ⟹ exit 1; README: chờ 5 phút sau khi API demo khởi động. Bỏ mọi thay đổi về worker. Đổi lại: `seed.sh` + guard. |
| Q-100 | Giữ + bổ sung: seed không giả ngày; dòng `D0+n` chỉ chạy trong flow; flow sắp dòng theo `scenarioDay` (FlowClock chỉ đi tới); dòng đổi trạng thái dùng chung chạy world riêng.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q-107 | Giữ + bổ sung: `Y` chia đều cho mọi phòng `ACTIVE` (gồm ADMIN — như seed hiện tại); `Y+1` theo fixture cho **đủ tập phòng của năm** (gồm ADMIN 0, DAT); phòng thiếu số ⟹ step `conflict`. DM4-04 làm kỳ bỏ phát hành rồi phát hành lại.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Q-109 | Giữ: 4 file `demo-{mf4,sbf20,mf1,mf5}.flow-spec.ts`; flow cũ chỉ là consumer phải xanh; `describe` world riêng cho DS20-17, DM1-57, DM1-58, DM5-35, DM5-37.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q-110 | Giữ: tách 3 hạng mục, tuần tự (cùng sửa `seed-steps.ts`, README).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

- **Q-19 (ghi thêm, F-043):** năm Y+1 luôn gồm đơn vị hôm nay của người đó; họ còn nộp được `BM-10` Y+1 cho phòng cũ dù nhiệm kỳ kết thúc 31/12 (hành vi cũ, giữ).

## Câu khi thiết kế W8 (Q-120 → Q-160)

Phát sinh khi rà API còn thiếu và thiết kế W8, 09/11/2026; bản cuối sau audit (23 finding, 4 Cao — DA8-01 phạm vi phình 9 hạng mục ~430 file). Chat review TẠM CHỌN chia **W8** (5 hạng mục ~150 file, giao code) và **W8b** (`blocked`, chờ Owner chọn — Q-160). Q-124 đổi theo nguồn: Super Admin không đọc Request kèm giá. Câu cần Owner: **TẠM CHỌN (chờ Owner)**.

### 5. Câu tạm chọn bản cuối — chỉ câu cần Owner

| ID       | Câu                                                | Tạm chọn                                                                     | Gói |
| -------- | -------------------------------------------------- | ---------------------------------------------------------------------------- | --- |
| Q-160    | Mở gói W8b nào?                                    | Không giao đêm nay; khuyến nghị B (phần nhỏ)                                 | W8b |
| Q-120    | Request tiếp tục nhóm vào phạm vi?                 | W8b, chờ Owner (nguồn nói có)                                                | W8b |
| Q-130    | Mô hình Request tiếp tục nhóm                      | A loại `GROUP_RENEWAL` có dòng                                               | W8b |
| Q-131    | Ngày kết thúc khác nhau trong một nhóm (DA8-10)    | chưa tạm chọn — A nối `extensionMonths` từng dòng / C một `newEndDate` chung | W8b |
| Q-142(a) | Trưởng phòng thấy cột GTGT phòng mình? (`OQ-F-02`) | **Không** (`null`) tới khi Owner trả lời (đổi từ _có_)                       | W8b |
| Q-145    | Kỳ phát hành báo cáo (`OQ-F-14`)                   | B chỉ tháng (đổi từ tháng + quý)                                             | W8b |

Gói W8 **không** còn câu cần Owner chặn việc giao code.

### 6. Câu theo nguồn / kỹ thuật (chat review ghi `QUESTIONS.md`, không chặn)

| ID                  | Phân loại            | Kết luận (gói)                                                                                                                                                                        |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-121               | theo nguồn           | Finance thấy Request đã duyệt chi (`US-06-09` AC-2, `SoD-3`) (W8)                                                                                                                     |
| Q-122               | theo nguồn           | Người duyệt chi thấy Request đã tới bước chi (`US-05-15`, `FR-3.11`) (W8)                                                                                                             |
| Q-123               | kỹ thuật             | IT Admin toàn tổ chức — giữ hành vi `access-request.policy.ts` (W8)                                                                                                                   |
| Q-124               | theo nguồn — **đổi** | Super Admin **không** đọc danh sách/chi tiết/dòng thời gian Request; chỉ route cờ `accessRequestAuditFlagList` không tiền (`US-05-24` _Phạm vi quyền_, AC-4; BRD 5.5.3; `SoD-1`) (W8) |
| Q-125               | kỹ thuật             | theo `department_id` lúc gửi (`FR-3.3`) (W8)                                                                                                                                          |
| Q-126               | kỹ thuật             | `involvement` mặc định `SENT`; `myLine` chỉ dòng của mình (W8)                                                                                                                        |
| Q-127               | kỹ thuật + nguồn     | Audit Trail + allowlist; người thụ hưởng chỉ dòng của mình (DA8-11) (W8)                                                                                                              |
| Q-128               | kỹ thuật             | 403 danh sách / 404 chi tiết (W8)                                                                                                                                                     |
| Q-129               | theo nguồn           | không số tiền trên dòng (BRD 5.5.3) (W8)                                                                                                                                              |
| Q-132               | theo nguồn           | chỉ phần mềm trả phí (`QĐ-100ab`) (W8b)                                                                                                                                               |
| Q-133               | kỹ thuật             | lưu nháp `RENEWAL` không chạy cổng (W8)                                                                                                                                               |
| Q-134               | kỹ thuật             | ứng viên quyền theo vai không lọc theo phụ trách (W8)                                                                                                                                 |
| Q-135, Q-136, Q-137 | theo nguồn           | Finance đánh dấu + nhập số phía hóa đơn (`US-12-17` AC-5); chỉ IT Admin đóng 3 kết luận (`US-12-02` AC-7, AC-9); route hẹp Super Admin không tiền (`SoD-1`) (W8)                      |
| Q-138               | kỹ thuật             | `netAmount` sau credit (W8)                                                                                                                                                           |
| Q-139               | kỹ thuật — **đổi**   | việc cần nộp tính khi đọc, cửa sổ ứng viên từ 01/01 năm trước; phạm vi IT theo người (`US-12-17` AC-8) (W8)                                                                           |
| Q-140, Q-141        | theo nguồn           | dòng tiền = ngày hóa đơn (`FR-5.3`); chia đều theo tháng (`US-12-01` AC-2, `US-12-11` AC-11) (W8b)                                                                                    |
| Q-142(b)            | theo nguồn           | Người duyệt chi xem từng khoản chưa phân bổ (BRD 5.5.3) (W8b)                                                                                                                         |
| Q-143               | kỹ thuật             | `committedYearStartAuto` thay route (W8b)                                                                                                                                             |
| Q-144               | kỹ thuật — **đổi**   | lịch sử kỳ đọc Audit Trail, không bảng (DA8-18) (W8b)                                                                                                                                 |
| Q-146               | theo nguồn           | bản trưởng phòng chỉ dòng Cost Center (`US-12-14` AC-7, AC-17) (W8b)                                                                                                                  |
| Q-147               | kỹ thuật             | khoản bù âm, một năm (W8b)                                                                                                                                                            |
| Q-148, Q-149        | theo nguồn           | tiềm năng `G1`–`G4` (`US-12-04`); `K1` thực (`US-12-04` AC-11, L3-32) (W8b)                                                                                                           |
| Q-150, Q-152, Q-154 | kỹ thuật             | đếm việc cần làm; không route tóm tắt, không bảng (DA8-17); thông báo theo phòng (W8b)                                                                                                |
| Q-151, Q-153, Q-155 | theo nguồn           | Người duyệt chi đọc điều chỉnh (BRD 5.5.4); 4 việc + cảnh báo đỏ; chỉ lúc xác nhận hóa đơn (W8b)                                                                                      |
| Q-156               | theo nguồn           | một khóa `BUSINESS_EMAIL_ENABLED`, mặc định `OFF` (`US-11-08` AC-9, `US-12-15` AC-15) (W8)                                                                                            |
| Q-157               | kỹ thuật             | báo theo dõi lúc cấp chỉ `PERSONAL` (W8)                                                                                                                                              |
| Q-158, Q-159        | **đóng**             | báo cáo hiệu suất sử dụng ra ledger `NGOÀI-PHẠM-VI` (DA8-07)                                                                                                                          |

Kỹ thuật thêm (không cần Owner): route cờ Super Admin tách theo module sở hữu (`requests`, `budgets`) thay vì một route gộp (DA8-20); nguồn thực
chi W8b là một đoạn SQL L0 dùng chung với hàm tổng (DA8-05).
