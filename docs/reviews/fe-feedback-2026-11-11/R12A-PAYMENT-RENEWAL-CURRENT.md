# R12A — Phần tiền sau cấp phát và gia hạn: thiết kế hiện tại (Docs + code)

> Chỉ đọc, 12/11/2026. Docs `main` @ `8480e79`; BE nhánh `feat/mf2-mf3` @ `b71ed330`. Không chạy test.
> Ký hiệu nguồn: `Docs/…` = `d:\FPT\FALL2026\Docs\`; `BE/…` = gốc repo BE. **[DOCS]** = thiết kế đã chốt; **[CODE]** = hiện
> thực trong BE; **chưa có** = không tìm thấy sau khi grep.
> Viết tắt tệp: `BRD` = `Docs/Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md`;
> `QT` = `Docs/Requiments/Quy trình và chính sách theo main flow.md`; `SCOPE` = `Docs/Requiments/Định nghĩa phạm vi & nghiệp vụ.md`;
> `QĐ` = `Docs/Decisions/project-decisions.md`; `SBF` = `Docs/Diagrams/supporting-business-flows/`.

## 1. Ai trả tiền, IT ghi gì sau khi mua

**[DOCS]**

- IT Admin là người thực hiện **mọi** lần mua (`K1`, `K2`, `K4`, kỳ gia hạn) — `QĐ:525` (`QĐ-103l`), `BRD:933`, `QT:961`.
- **Ai trả / phương tiện thanh toán / hoàn tiền cho IT: ngoài phạm vi**; "không có bước IT xác nhận đã nhận tiền" —
  `QĐ:525`, `BRD:933`, `QT:965`, `SCOPE:278`, `SBF/SBF-19-…md:15,35`. Hệ thống "không kết luận đã/chưa thanh toán, không
  có chức năng thanh toán" — `BRD:932`. Không có luồng "Finance trả nhà cung cấp theo hóa đơn".
- Thẻ công ty chỉ xuất hiện như bối cảnh: PP-2 (thẻ công ty bị trừ tiền vì quên hủy) `BRD:70`; giả định GĐ-6 "phần lớn phần
  mềm mua bằng tài khoản doanh nghiệp, thanh toán qua kênh có sao kê" `BRD:255`; "hoàn ứng cá nhân" được liệt kê là **điểm
  mù** của nguồn sao kê `BRD:1183`. "Nhân viên tự trả tiền cho mình" ngoài phạm vi (`QĐ-103m`) `QĐ:556`, `BRD:1139`.
- Sau khi mua, IT nộp **mỗi hóa đơn một đề nghị** trong 5 ngày làm việc (`SBF-19`): liên kết **Request/tác vụ cấp hoặc
  thuê bao/kỳ**, số tiền, tiền tệ, ngày, nhà cung cấp, số hóa đơn, **tệp hóa đơn/biên lai** — `QĐ:525`, `BRD:933`,
  `SBF/SBF-19-…md:35`, US-12-16 `Docs/BE-UserStory/epics/EP-12.md:782,794`. Trạng thái đề nghị: chờ Finance · đã xác nhận ·
  bị trả lại; nộp lại sau trả lại — `EP-12.md:794`. Nộp song song với cấp, cấp không chờ Finance — `QĐ:348` (`QĐ-103w`(5)).
- Hệ thống: chặn trùng (nhà cung cấp + số hóa đơn), khớp 3 bên, cờ _vượt số được duyệt_ / _kỳ ngoài thời hạn_ —
  `SBF/SBF-19-…md:36-38`, `QĐ:348`. Dòng thuế do **Finance** ghi khi xác nhận — `BRD:940` (`FR-5.13`(3)).

**[CODE]**

- Ghi hóa đơn hiện là **Finance-only**, vào **một khoản cam kết**: `POST /budget-commitments/{id}/invoices`
  `@RequireRoles('FINANCE')` — `BE/src/modules/budgets/invoice/budget-invoices.controller.ts:26-37`; "IT Admin … cannot record
  or read them" (`:27`).
- Model `Invoice`: bắt buộc `commitmentId`; có số, ngày, net/thuế, `matchResult`; **không** có tệp, **không** liên kết tác vụ
  cấp hay thuê bao/kỳ, **không** có trạng thái xác nhận/trả lại, **không** có người trả tiền — `BE/prisma/models/budgets.prisma:379-419`.
  Body chỉ `number, issuedOn, netAmount, deductibleTax, nonDeductibleTax, note` — `BE/src/modules/budgets/invoice/invoice.dto.ts:16-32`.
- Tác vụ cấp chỉ ghi **loại mua** (`POOL_TOP_UP` · `KEY_PURCHASE` · `K1_SUBSCRIPTION`), lý do và thời điểm — **không** số tiền,
  không hóa đơn — `BE/src/modules/licensing/provisioning/tasks/provisioning-grant.policy.ts:1-22`,
  `BE/prisma/models/licensing.prisma:188-190`, body `purchase: { reason }` `BE/src/modules/licensing/provisioning/provisioning.dto.ts:17-18,28-29`.
- Tệp `PURCHASE_DOCUMENT` (IT/Finance tải) chỉ **gắn vào hợp đồng**, không vào hóa đơn/Request/tác vụ —
  `BE/src/modules/catalog/contract/contract.policy.ts:28-39`.
- Roadmap: `US-12-16`, `US-12-17` "để sau — chưa có `/purchase-invoices`; còn route cũ Finance ghi hóa đơn vào khoản cam kết"
  `BE/docs/roadmap.md:1272`; `SBF-19` là "luồng phụ để đợt sau" `BE/docs/roadmap.md:145`. API doc FE xác nhận "chưa có … IT
  Admin đính kèm biên lai" `Docs/Figma UI-UX/API-Integration/flows/finance-screens.md:104-105`.
- Người trả tiền / hoàn ứng / tạm ứng / thẻ: **chưa có** trường hay bảng nào (grep `reimburs|receipt|payment|statement` trong
  `prisma/models`: chỉ `paymentSchedule`/`PaymentFrequency` của báo giá Request — `BE/prisma/models/requests.prisma:195-196,477-483`).

## 2. Các bước của Finance và các luồng đối soát

**[DOCS] — mỗi luồng là gì**

| Luồng     | Là gì (nguồn)                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SBF-19`  | IT nộp hóa đơn → hệ thống chặn trùng/khớp/gắn cờ → **Finance đối chiếu trong 5 ngày làm việc ⟹ xác nhận (bản ghi phê duyệt điện tử `QĐ-53a`) hoặc trả lại kèm lý do**; xác nhận ⟹ cam kết `K1`/`K4` thành thực chi, hóa đơn `K2` vào kho — `SBF/SBF-19-…md:39-41`, `QT:963`. Người nộp ≠ người xác nhận `QT:127`. Trả lại chưa nộp lại = việc tồn dashboard IT `SBF-19-…md:51`. |
| `SBF-07`  | Đối soát **dòng tiền đi** trên sao kê ngân hàng/thẻ Finance import; gắn vào hóa đơn đã xác nhận hoặc so căn cứ (thực chi tạm) — `SBF/SBF-07-spend-reconciliation.md:11`, `QT:930`, `BRD:934`.                                                                                                                                                                                   |
| `SBF-07a` | Chi/quyền **ngoài quy trình**: chỉ ghi nhận và báo cáo; 3 kết cục báo nhầm · ghi phần đã chi vào phòng dùng · IT thu hồi — `SBF/SBF-07a-…md:11`, `QĐ:556`.                                                                                                                                                                                                                      |
| `SBF-08`  | Đối soát tài khoản thật ở nhà cung cấp với quyền đã ghi (job connector), hồ sơ sai lệch giữ cả hai giá trị — `SBF/SBF-08-…md:11`.                                                                                                                                                                                                                                               |
| `SBF-11a` | Xử lý **sai lệch số lượng/đơn giá** của hóa đơn đã xác nhận; mở hồ sơ rồi trả về `SBF-19` ngay, điều tra song song — `SBF/SBF-11a-…md:11`, `QĐ:348`.                                                                                                                                                                                                                            |

- "Finance ký xác nhận": **có** — là bản ghi phê duyệt điện tử, nghĩa là **chấp nhận chứng từ/thực chi**, không phải duyệt
  trả tiền cho IT (`QĐ:525`, `EP-12.md:836`). "IT xác nhận đã nhận tiền": **không có, bị loại trừ rõ** — `QĐ:525`, `BRD:933`.

**[CODE]**

- `SBF-19` xác nhận/trả lại: **chưa có** (xem §1). `SBF-07` sao kê: **chưa có** model/route (F3 BUG-2b
  `F3-CATALOG-DEPT-CONTRACT.md:102`); chỉ có mục đích tải tệp `COST_STATEMENT` cho Finance `contract.policy.ts:35`.
  `SBF-07a`: **chưa có** (BUG-2c `:103`). `SBF-08`: một phần qua usage (BUG-2d `:104`). `SBF-11a`: chỉ `Invoice.matchResult`,
  không có hồ sơ (BUG-2e `:105`, `budgets.prisma:381-385`).
- Owner đã chốt 11/11: Q31 "làm đủ `SBF-07`, `SBF-07a`, `SBF-08`, `SBF-11a` (+ `SBF-19` làm nền)" — `DECISIONS.md:46`.

## 3. Gia hạn: tháng vs năm, ghi gì mỗi kỳ

**[DOCS]**

- Ba kiểu: `K1` gói cá nhân **chỉ kỳ tháng**, trên email công ty của người dùng, IT đăng ký và **nộp hóa đơn từng kỳ**; thu
  hồi = hủy gia hạn — `QĐ:287` (`QĐ-103d`(1)). `K2` thuê bao dùng chung có **kỳ cam kết 1/12 tháng** tách **chu kỳ trả tiền**
  (gói năm trả tháng được phép) — `QĐ:288,291`. `K4` khóa vĩnh viễn, **không có kỳ** — `SBF/SBF-20-…md:56`.
- **`K2` — một điểm điều chỉnh mỗi kỳ** (gói tháng 7 ngày trước ngày thanh toán; gói năm 30 ngày trước hạn chót báo hủy):
  hệ thống tính số seat cần → IT gia hạn **đúng số đó** với nhà cung cấp (ngoài hệ thống) → IT ghi kết quả → hệ thống ghi kỳ
  mới, báo Finance → nhánh song song IT nộp hóa đơn kỳ qua `SBF-19` — `SBF/SBF-20-…md:35-40`, `QT:1012-1024`. Không có bước
  trưởng phòng/Người duyệt chi `QĐ:288`. "Hệ thống không tự gia hạn, hủy hay thanh toán ở nhà cung cấp" `QT:1018`.
- Gói tháng `K2` chưa ghi kết quả tới ngày thanh toán ⟹ coi như giữ nguyên số seat, nhắc IT, không cảnh báo đỏ —
  `SBF-20-…md:48`. Gói năm chưa ghi 7 ngày trước hạn chót ⟹ cảnh báo đỏ IT + Finance `SBF-20-…md:47`. Đã ghi giảm/hủy mà nhà
  cung cấp vẫn tự gia hạn ⟹ sự cố gia hạn ngoài ý muốn `SBF-20-…md:68`, `QĐ:292`.
- **Lời nhắc duy trì kỳ** (`US-11-09`): 7 ngày trước **mỗi kỳ thanh toán** khi quyền còn chạy, cho `K1` và `K2` cam kết năm
  trả tháng; **`K2` gói tháng không có lời nhắc riêng** (điểm điều chỉnh thay) — `QĐ:292` (`QĐ-106i`(5)), `BRD:439,445,1244`,
  `Docs/BE-UserStory/epics/EP-11.md:223,235,239,252,257-258`. IT duy trì với nhà cung cấp ngoài hệ thống rồi nộp **một hóa đơn
  mỗi kỳ** qua `SBF-19`; **không** Request/kiểm ngân sách/duyệt chi mới — `EP-11.md:239,253-254`, `QĐ:281` (`QĐ-94c`(6)).
- Hình thức là **lời nhắc + mục trên dashboard IT** ("nhắc duy trì kỳ thanh toán", "hóa đơn mua hàng cần nộp") `BRD:1024,1039`;
  **không** tìm thấy đối tượng "tác vụ gia hạn" có trạng thái cho mỗi kỳ (khác tác vụ cấp/thu hồi).
- Mỗi kỳ ghi: `K2` — kết quả điều chỉnh (số seat chốt, kỳ mới) + hóa đơn kỳ (đối chiếu với seat chốt × giá gói) `QĐ:348`;
  `K1` — hóa đơn kỳ liên kết Request; kỳ ngoài thời hạn của quyền có thời hạn bị gắn cờ và trả lại `EP-11.md:256`.

**[CODE]**

- `subscription-renewal` vẫn theo **mô hình cũ trước `QĐ-103e`**: IT **đề xuất** RENEW/REDUCE/CANCEL
  (`subscription-renewals.controller.ts:128-135`) → **trưởng phòng xác nhận** (`:172-179`) → IT ghi kết quả (`:222-230`);
  model `SubscriptionRenewal` có `businessOwnerOpinion`, `decidedBy…` — `BE/prisma/models/licensing.prisma:553-647`;
  README `BE/src/modules/licensing/README.md:133-140`. Roadmap: `US-11-08` "để sau — code còn mô hình đề xuất/xác nhận trước
  `QĐ-103e`" `BE/docs/roadmap.md:1268`.
- Kết quả gia hạn chỉ ghi `nextPeriod` (số seat, đơn giá, chu kỳ, ngày, `autoRenew`…) — **không** số tiền thực trả, **không**
  hóa đơn — `BE/src/modules/licensing/subscription-renewal/subscription-renewal.dto.ts:48-73`.
- Cảnh báo theo mốc cũ T−15/T−7 trước hạn chót (`RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` mặc định `[15, 7]`) —
  `BE/src/modules/operating-parameters/parameter-definitions.policy.ts:313-321`.
- Thuê bao đã có `commitmentTermMonths`, `billingCycle`, `autoRenew` — `BE/prisma/models/catalog.prisma:317-353`; luật `K1`
  chỉ tháng được ép — `BE/src/modules/catalog/subscription/pool/subscription-pool.policy.ts:35-54`.
- **Lời nhắc duy trì kỳ (`US-11-09`): chưa có** — không có job nào (danh sách `*.job.ts` dưới `src/modules` không có),
  roadmap `US-11-09` "để sau" `BE/docs/roadmap.md:1269`.

## 4. Thu hồi `K1`

**[DOCS]**

- `QĐ-77l`: tác vụ thu hồi `K1` ghi hai sự thật — **đã hủy gia hạn** (bằng chứng, ngày hết kỳ đã trả X) và truy cập **đã
  cắt** (có bằng chứng) hoặc **còn tới X**; Assignment _đang chấm dứt_, kết thúc ở mốc sớm hơn; **chi phí tính tới X** —
  `QĐ:485`, `BRD:492`. Ca nghỉ việc: phải ghi trạng thái truy cập; _còn tới X_ ⟹ cảnh báo, mục (2) `BM-08` chưa đóng —
  US-07-05 AC-19 `Docs/BE-UserStory/epics/EP-07.md:272`; AC-5 `:258`.
- "Cắt ngay": AC-19 chỉ nêu **ví dụ bằng chứng** "xóa tài khoản, gỡ đăng nhập, đổi email" `EP-07.md:272`; **không tìm thấy**
  mô tả cách IT thao tác cụ thể. Hóa đơn kỳ mới tới sau khi hủy ⟹ mở sai lệch đối soát chi phí `EP-07.md:272`.
- Không lưu mật khẩu: SaaS-Sentry không lưu mật khẩu quản trị `QĐ:171` (`QĐ-77d`); không quản lý bộ đăng nhập dùng chung
  `QĐ:318` (`QĐ-75a`); Owner 11/11 Q23 "Không lưu mật khẩu; mục cá nhân = `K1` trên email công ty" `DECISIONS.md:38`.
- **Gói `K1` năm: không tồn tại trong thiết kế** — `K1` chỉ kỳ tháng `QĐ:287`; cần seat dùng lại thì dùng `K2`.

**[CODE]** (khớp Docs)

- `K1` chỉ hoàn tất bằng `RENEWAL_CANCELLED` — `BE/src/modules/licensing/provisioning/revocation.policy.ts:74-77`.
- `planCompletion`: bắt buộc `paidThroughOn` + `accessState`; `UNTIL_PAID_END` ⟹ kết thúc ở ngày hết kỳ đã trả; `CUT` cần
  `accessCutOn` ≤ hôm nay + bằng chứng ⟹ kết thúc ở mốc sớm hơn — `revocation.policy.ts:162-221`.
- `planAccessCut` (`POST /provisioning-tasks/{id}/access-cut`, `IT_ADMIN`): ghi cắt sớm một lần cho ghế đang chạy tới hết kỳ,
  rút ngắn Assignment nếu sớm hơn — `revocation.policy.ts:223-245`, `revocation-tasks.controller.ts:92-96`.
- `isTerminating`: suy ra (không lưu) khi `REVOKE` + `COMPLETED` + `UNTIL_PAID_END` + `validUntil > today` —
  `revocation.policy.ts:247-263`.
- Hoàn tất thu hồi "writes no saving, invoice, contract or budget" — `revocation-tasks.controller.ts:46-47`. Không ô mật khẩu:
  `BE/src/modules/licensing/provisioning/provisioning.dto.ts:10-13`.

## 5. Khoảng trống so với quy trình Owner mô tả

Quy trình Owner: _IT tự bỏ tiền/dùng thẻ ngoài hệ thống → nộp hóa đơn (form tiền, Request, nhiệm vụ cấp phát, file) → Finance
đối chiếu và ký xác nhận (đồng ý trích tiền trả lại IT) → IT xác nhận lại._

| #   | Bước Owner                                                | DOCS hiện tại                                                                                                                                                                | CODE hiện tại                                                                                                                                       | Khoảng trống                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | IT trả bằng tiền túi/thẻ, ngoài hệ thống                  | Khớp vế "ngoài hệ thống": phương tiện thanh toán ngoài phạm vi `QĐ:525`                                                                                                      | Không có gì                                                                                                                                         | Không lưu **ai trả** (IT cá nhân / thẻ công ty). Nếu IT trả tiền túi thì sao kê công ty chỉ có dòng **hoàn tiền cho IT**, không phải dòng trả nhà cung cấp ⟹ `SBF-07` khớp theo nhà cung cấp không áp được; trái giả định GĐ-6 `BRD:255`, và "hoàn ứng cá nhân" là điểm mù `BRD:1183` |
| G2  | Nộp hóa đơn: số tiền, Request, nhiệm vụ cấp, file         | **Có** (`SBF-19`, `US-12-16`)                                                                                                                                                | **Chưa có**: chỉ Finance ghi vào khoản cam kết, không file, không liên kết tác vụ (`budget-invoices.controller.ts:26-37`, `budgets.prisma:387-419`) | Toàn bộ `SBF-19` phía code (`roadmap.md:1272`)                                                                                                                                                                                                                                        |
| G3  | Finance đối chiếu, ký xác nhận                            | **Có**: xác nhận/trả lại, bản ghi phê duyệt điện tử `SBF-19-…md:39-41`                                                                                                       | **Chưa có** trạng thái xác nhận/trả lại                                                                                                             | Code                                                                                                                                                                                                                                                                                  |
| G4  | Xác nhận = "đồng ý trích tiền trả lại IT"                 | **Khác nghĩa**: xác nhận chỉ biến cam kết thành thực chi; hoàn tiền ngoài phạm vi `QĐ:525`, `BRD:932-933`                                                                    | Không có                                                                                                                                            | Cần **QĐ mới** nếu muốn xác nhận mang nghĩa duyệt hoàn ứng (vd. trường người trả, trạng thái _đã hoàn_)                                                                                                                                                                               |
| G5  | IT xác nhận lại (đã nhận tiền)                            | **Bị loại trừ rõ**: "không có bước IT xác nhận đã nhận tiền" `QĐ:525`, `QT:965`                                                                                              | Không có                                                                                                                                            | Mâu thuẫn trực tiếp với `QĐ-103l` ⟹ cần Owner quyết                                                                                                                                                                                                                                   |
| G6  | Gói tháng: mỗi tháng nhắc + việc gia hạn + IT nộp hóa đơn | `K1` và `K2` năm-trả-tháng: **lời nhắc 7 ngày trước mỗi kỳ** + hóa đơn mỗi kỳ (`US-11-09`); `K2` gói tháng: **điểm điều chỉnh** mỗi kỳ thay lời nhắc + hóa đơn kỳ (`SBF-20`) | **Chưa có** lời nhắc kỳ, chưa có điểm điều chỉnh mới; renewal còn mô hình đề xuất/xác nhận, cảnh báo T−15/T−7                                       | Docs dùng **lời nhắc + mục dashboard**, không có "tác vụ gia hạn" có trạng thái mỗi kỳ; nếu Owner muốn task thật mỗi kỳ ⟹ QĐ mới. Code thiếu cả `US-11-08` lẫn `US-11-09`                                                                                                             |
| G7  | Gói cá nhân trả năm                                       | Không có: `K1` chỉ tháng `QĐ:287`                                                                                                                                            | Ép tháng `subscription-pool.policy.ts:50-53`                                                                                                        | Nếu Owner muốn `K1` năm ⟹ QĐ mới (kéo theo AC-19: cắt sớm nhưng chi phí vẫn tính tới hết kỳ đã trả `QĐ:485`)                                                                                                                                                                          |
| G8  | Hóa đơn `K2` vào kho, dòng _Chưa phân bổ_                 | Có `QĐ:527` (`QĐ-104c`)                                                                                                                                                      | **Chưa có** (`finance-screens.md:104-105`)                                                                                                          | Code                                                                                                                                                                                                                                                                                  |

Owner đã chốt hướng làm đối soát đầy đủ (`DECISIONS.md:46`, Q31) nhưng **chưa** có QĐ nào về hoàn ứng cho IT (G1, G4, G5) —
không tìm thấy trong `QĐ` hay `DECISIONS.md`.
