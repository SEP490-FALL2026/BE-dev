| DEMO | Vai (email) | Route | HTTP | Điểm then chốt |
| --- | --- | --- | --- | --- |
| DEMO-1 | dung.pham | `GET /access-requests/7c0fdf3a-8b50-4a74-8bd1-8426a6399356` | 200 | R08: state=AWAITING_IT_ASSESSMENT, proposal=Miro |
| DEMO-1 | xuan.chau | `GET /access-requests/29e5ded0-cd80-4f7b-a060-e0b03bb10099` | 200 | R29: state=AWAITING_IT_ASSESSMENT, proposal=Canva |
| DEMO-2 | thu.ly | `GET /access-requests/249e82e9-0f13-4bed-ac78-b3b6a1db0cdf` | 200 | R28: state=COMPLETED |
| DEMO-2 | thu.ly | `GET /access-requests/f64237fc-b187-4370-8bb3-d0c8d7bea4f1` | 200 | R13: state=WAITING_CONTROLLED |
| DEMO-2 | thu.ly | `GET /access-requests/f33150bf-2ddf-4f33-8d24-7050239e2036` | 200 | R30: state=WAITING_CONTROLLED, proposal=DocuSign |
| DEMO-3 | hanh.le | `GET /access-requests/427c598d-a679-48af-92cd-277730f10396` | 200 | R31: state=AWAITING_SPEND_DECISION, termCutAt=2027-01-31 |
| DEMO-4 | dung.pham | `GET /access-requests/e0b4949b-4a13-4003-9ac0-3d8546022b28` | 200 | R32: state=COMPLETED |
| DEMO-4 | dung.pham | `GET /access-requests/029e4074-1046-440a-9083-1f2c8d5da7a5` | 200 | R01: state=COMPLETED |
| DEMO-6 | system.admin | `GET /offboarding-cases` | 200 | NV-OFF1:LEFT/BLOCK_NOW, NV-ITA4:HANDING_OVER/WITH_LAST_DAY |
| DEMO-7 | system.admin | `GET /department-transfers` | 200 | NV-DEV4:PENDING |
| DEMO-7 | quan.ly | `GET /subscriptions?pageSize=100` | 200 | Canva Teams:ownerAccountEmailMissing |
| DEMO-8 | rang.mai | `GET /ghost-seat-recommendations?pageSize=100` | 200 | {"G3/ACTION/AWAITING_DECISION":1,"G4/MONITOR/OPEN":1,"G4/REVIEW/CLOSED":2,"G4/REVIEW/RECLAIM_DECIDED":1,"G4/ACTION/CLOSED":1,"G4/REVIEW/AWAITING_DECISION":1,"G1//OPEN":7} |
| DEMO-9 | quan.ly | `GET /contracts` | 200 | SV-HD-ATL-01, SV-HD-JB-01 |
| DEMO-10 | phuc.trinh | `GET /purchase-invoices?pageSize=100` | 200 | SV-INV-004:CONFIRMED/PRICE_QUANTITY_EXCEPTION, SV-INV-003:RETURNED/MATCHED, SV-INV-002:CONFIRMED/MATCHED, SV-INV-001:SUBMITTED/MATCHED |
| DEMO-10 | phuc.trinh | `GET /purchase-invoices/missing-periods` | 200 | kỳ thiếu hóa đơn: 0 |
| DEMO-11 | phuc.trinh | `GET /invoice-discrepancies` | 200 | OPEN:QUANTITY |
| DEMO-11 | rang.mai | `GET /vendor-account-discrepancies` | 200 | {"UNMATCHED_IDENTITY":1} |
| DEMO-11 | phuc.trinh | `GET /out-of-process-cases` | 200 | ca: 0 |
| DEMO-12 | phuc.trinh | `GET /budget-review-periods?year=2026&pageSize=100` | 200 | 10:M/SNAPSHOT, 9:Q/AWAITING_EXPLANATIONS, 8:M/SNAPSHOT, 7:M/SNAPSHOT, 6:Q/AWAITING_EXPLANATIONS, 5:M/SNAPSHOT, 4:M/SNAPSHOT, 3:Q/AWAITING_EXPLANATIONS, 2:M/SNAPSHOT, 1:M/SNAPSHOT |
| DEMO-13 | phuc.trinh | `GET /budget-review-periods/01a1e3de-05e0-7558-8254-76428b277b97?pageSize=100` | 200 | 9/AWAITING_EXPLANATIONS due=2026-11-20; CC-DES:YELLOW/EXPLAINED, CC-MKT:YELLOW/PENDING, CC-BOD:UNDER/PENDING, CC-FIN:UNDER/PENDING, CC-ENG:UNDER/PENDING, CC-SAL:UNDER/PENDING, CC-ITO:UNDER/PENDING |
| DEMO-12 | phuc.trinh | `GET /budgets?year=2026&pageSize=100` | 200 | CC-BOD:ACTIVE, CC-DES:ACTIVE, CC-MKT:ACTIVE, CC-FIN:ACTIVE, CC-ENG:ACTIVE, CC-SAL:ACTIVE, CC-ITO:ACTIVE |
| DEMO-12 | phuc.trinh | `GET /notifications?pageSize=50` | 200 | không có BUDGET_THRESHOLD_REACHED |
| DEMO-12 | uyen.dinh | `GET /notifications?pageSize=50` | 200 | không có BUDGET_THRESHOLD_REACHED |
| DEMO-14 | phuc.trinh | `GET /budget-adjustments?year=2026` | 200 | 0 (chờ kỳ khóa) |
| DEMO-15 | phuc.trinh | `GET /budget-cycles?pageSize=10` | 200 | 2028:DRAFT, 2027:OPEN, 2026:OPEN |
| DEMO-15 | phuc.trinh | `GET /budget-versions?year=2027&pageSize=100` | 200 | CC-MKT:SENT, CC-ENG:APPROVED, CC-SAL:CHANGES_REQUESTED |
| DEMO-15 | phuc.trinh | `GET /budget-cycles/2027/package` | 200 | ITO:SUBMITTED/-/BEFORE_DEADLINE, MKT:REVIEWED/SENT/BEFORE_DEADLINE, SAL:REVIEWED/CHANGES_REQUESTED/BEFORE_DEADLINE, OPS:không BM-10/-/BEFORE_DEADLINE, LGL:không BM-10/-/BEFORE_DEADLINE, ADMIN:không BM-10/-/BEFORE_DEADLINE, BOD:không BM-10/-/BEFORE_DEADLINE, FIN:không BM-10/-/BEFORE_DEADLINE, ENG:REVIEWED/APPROVED/BEFORE_DEADLINE, DES:không BM-10/-/BEFORE_DEADLINE |
| DEMO-15 | an.nguyen | `GET /access-requests/c52a1dea-d51d-443a-869a-a6203a14ffea/spend-approval` | 200 | nextYearBudget={"year":2027,"approved":{"amount":"123200000","currency":"VND"},"remaining":{"amount":"109080000","currency":"VND"},"remainingAfter":{"amount":"107880000","currency":"VND"},"warning":false} |
| MF-1 | an.nguyen | `GET /spend-approvals` | 200 | chờ duyệt chi: 4 |
| MF-1 | quan.ly | `GET /provisioning-tasks?scope=ALL` | 200 | tác vụ: 10 |
| MF-2 | system.admin | `GET /offboarding-cases` | 200 | hồ sơ: 2 |
| MF-3 | phi.luong | `GET /me/department-transfer` | 200 | null |
| MF-4 | cuong.le | `GET /budgets/mine?year=2026` | 200 | CC-ENG:ACTIVE total=660000000 |
| MF-5 | khanh.bui | `GET /ghost-seat-queue` | 200 | hàng quyết: 2 |
| CHUNG | quan.ly | `GET /functional-groups` | 200 | Chuyên ngành(?), Khác(?), Lập trình & kỹ thuật(?), Liên lạc (email, chat, họp)(?), Thiết kế & sáng tạo(?), Trợ lý AI(?), Văn phòng & cộng tác(?) |
| CHUNG | rang.mai | `GET /policies` | 200 | POL-GEN v1:PENDING, POL-MF1 v1:PENDING, POL-MF2 v2:PENDING, POL-MF3 v1:PENDING, POL-MF4 v1:NOT_REQUIRED, POL-MF5 v1:PENDING, POL-SAAS v1:PENDING, POL-USAGE v1:PENDING |
