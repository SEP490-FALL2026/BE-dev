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
