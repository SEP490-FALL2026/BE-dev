| DEMO | Vai (email) | Route | HTTP | Điểm then chốt |
| --- | --- | --- | --- | --- |
| DEMO-1 | dung.pham | `GET /access-requests/b9855297-28d3-46dd-8bbf-b8f5d6ece944` | 200 | R08: state=AWAITING_IT_ASSESSMENT, proposal=Miro |
| DEMO-1 | xuan.chau | `GET /access-requests/f04701c9-f7d1-4ea5-a278-dca0c1af72e2` | 200 | R29: state=AWAITING_IT_ASSESSMENT, proposal=Canva |
| DEMO-2 | thu.ly | `GET /access-requests/0f044be5-9ea2-4533-8750-7a212caf18e1` | 200 | R28: state=COMPLETED |
| DEMO-2 | thu.ly | `GET /access-requests/464a426b-2672-4fb3-83ea-09ca703a74df` | 200 | R13: state=WAITING_CONTROLLED |
| DEMO-2 | thu.ly | `GET /access-requests/c8c7cc58-2e22-4963-a1ac-72d5eb984651` | 200 | R30: state=WAITING_CONTROLLED, proposal=DocuSign |
| DEMO-3 | hanh.le | `GET /access-requests/7a95c11e-ef2a-4033-924a-f37a54e7c00c` | 200 | R31: state=AWAITING_SPEND_DECISION, termCutAt=2027-01-31 |
| DEMO-4 | dung.pham | `GET /access-requests/f8e7b7a1-2065-4cb4-a6fb-f10e15123294` | 200 | R32: state=COMPLETED |
| DEMO-4 | dung.pham | `GET /access-requests/cf209575-0d81-4c73-8082-95a8ca3df8d8` | 200 | R01: state=COMPLETED |
| DEMO-5 | bao.quach | `GET /access-requests/34f11f69-ba02-4688-afdc-2a6ed1241159` | 200 | R33: state=PENDING |
| DEMO-8 | quan.ly | `GET /license-assignments?employeeId=e92131bc-1bdb-44bd-a861-f3bd64cb80df` | 200 | NV-ITA3:isMachineAccount=true |
| DEMO-6 | system.admin | `GET /offboarding-cases` | 200 | NV-OFF1:LEFT/BLOCK_NOW, NV-ITA4:HANDING_OVER/WITH_LAST_DAY |
| DEMO-7 | system.admin | `GET /department-transfers` | 200 | NV-DEV4:PENDING |
| DEMO-7 | quan.ly | `GET /subscriptions?pageSize=100` | 200 | Canva Teams:ownerAccountEmailMissing |
| DEMO-8 | rang.mai | `GET /ghost-seat-recommendations?pageSize=100` | 200 | {"G3/ACTION/AWAITING_DECISION":1,"G4/ACTION/CLOSED":1,"G4/REVIEW/AWAITING_DECISION":1,"G4/REVIEW/CLOSED":2,"G4/MONITOR/OPEN":1,"G4/REVIEW/RECLAIM_DECIDED":1,"G1//OPEN":7} |
| DEMO-9 | quan.ly | `GET /contracts` | 200 | SV-HD-ATL-01, SV-HD-JB-01 |
| DEMO-10 | phuc.trinh | `GET /purchase-invoices?pageSize=100` | 200 | SV-INV-004:CONFIRMED/PRICE_QUANTITY_EXCEPTION, SV-INV-003:RETURNED/MATCHED, SV-INV-002:CONFIRMED/PRICE_QUANTITY_EXCEPTION, SV-INV-001:SUBMITTED/MATCHED |
| DEMO-10 | phuc.trinh | `GET /purchase-invoices/missing-periods` | 200 | kỳ thiếu hóa đơn: 0 |
| DEMO-11 | phuc.trinh | `GET /invoice-discrepancies` | 200 | OPEN:QUANTITY, OPEN:QUANTITY |
| DEMO-11 | rang.mai | `GET /vendor-account-discrepancies` | 200 | {"NO_ASSIGNMENT":2,"UNMATCHED_IDENTITY":1} |
| DEMO-11 | phuc.trinh | `GET /out-of-process-cases` | 200 | CLOSED/RECORD_SPENT |
| DEMO-12 | phuc.trinh | `GET /budget-review-periods?year=2026&pageSize=100` | 200 | 10:M/SNAPSHOT, 9:Q/AWAITING_EXPLANATIONS, 8:M/SNAPSHOT, 7:M/SNAPSHOT, 6:Q/AWAITING_EXPLANATIONS, 5:M/SNAPSHOT, 4:M/SNAPSHOT, 3:Q/AWAITING_EXPLANATIONS, 2:M/SNAPSHOT, 1:M/SNAPSHOT |
| DEMO-13 | phuc.trinh | `GET /budget-review-periods/01a1e401-f210-7138-bea8-d4b11dce12b6?pageSize=100` | 200 | 9/AWAITING_EXPLANATIONS due=2026-11-20; CC-DES:YELLOW/EXPLAINED, CC-MKT:YELLOW/PENDING, CC-BOD:UNDER/PENDING, CC-FIN:UNDER/PENDING, CC-ENG:UNDER/PENDING, CC-SAL:UNDER/PENDING, CC-ITO:UNDER/PENDING |
| DEMO-12 | phuc.trinh | `GET /budgets?year=2026&pageSize=100` | 200 | CC-BOD:ACTIVE, CC-FIN:ACTIVE, CC-DES:ACTIVE, CC-ENG:ACTIVE, CC-MKT:ACTIVE, CC-SAL:ACTIVE, CC-ITO:ACTIVE |
| DEMO-12 | phuc.trinh | `GET /notifications?pageSize=50` | 200 | không có BUDGET_THRESHOLD_REACHED |
| DEMO-12 | uyen.dinh | `GET /notifications?pageSize=50` | 200 | không có BUDGET_THRESHOLD_REACHED |
| DEMO-14 | phuc.trinh | `GET /budget-adjustments?year=2026` | 200 | 0 (chờ kỳ khóa) |
| DEMO-15 | phuc.trinh | `GET /budget-cycles?pageSize=10` | 200 | 2028:DRAFT, 2027:OPEN, 2026:OPEN |
| DEMO-15 | phuc.trinh | `GET /budget-versions?year=2027&pageSize=100` | 200 | CC-ENG:APPROVED, CC-MKT:SENT, CC-SAL:CHANGES_REQUESTED |
| DEMO-15 | phuc.trinh | `GET /budget-cycles/2027/package` | 200 | BOD:không BM-10/-/BEFORE_DEADLINE, DES:không BM-10/-/BEFORE_DEADLINE, MKT:REVIEWED/SENT/BEFORE_DEADLINE, LGL:không BM-10/-/BEFORE_DEADLINE, ADMIN:không BM-10/-/BEFORE_DEADLINE, ITO:SUBMITTED/-/BEFORE_DEADLINE, SAL:REVIEWED/CHANGES_REQUESTED/BEFORE_DEADLINE, OPS:không BM-10/-/BEFORE_DEADLINE, FIN:không BM-10/-/BEFORE_DEADLINE, ENG:REVIEWED/APPROVED/BEFORE_DEADLINE |
| DEMO-15 | an.nguyen | `GET /access-requests/8a13c3e7-b0cf-4f8a-9420-ad8030731b70/spend-approval` | 200 | nextYearBudget={"year":2027,"approved":{"amount":"123200000","currency":"VND"},"remaining":{"amount":"109080000","currency":"VND"},"remainingAfter":{"amount":"107880000","currency":"VND"},"warning":false} |
| MF-1 | an.nguyen | `GET /spend-approvals` | 200 | chờ duyệt chi: 4 |
| MF-1 | quan.ly | `GET /provisioning-tasks?scope=ALL` | 200 | tác vụ: 10 |
| MF-2 | system.admin | `GET /offboarding-cases` | 200 | hồ sơ: 2 |
| MF-3 | phi.luong | `GET /me/department-transfer` | 200 | null |
| MF-4 | cuong.le | `GET /budgets/mine?year=2026` | 200 | CC-ENG:ACTIVE total=660000000 |
| MF-5 | khanh.bui | `GET /ghost-seat-queue` | 200 | hàng quyết: 2 |
| CHUNG | quan.ly | `GET /functional-groups` | 200 | Chuyên ngành(?), Khác(?), Lập trình & kỹ thuật(?), Liên lạc (email, chat, họp)(?), Thiết kế & sáng tạo(?), Trợ lý AI(?), Văn phòng & cộng tác(?) |
| CHUNG | rang.mai | `GET /policies` | 200 | POL-GEN v1:PENDING, POL-MF1 v1:PENDING, POL-MF2 v2:PENDING, POL-MF3 v1:PENDING, POL-MF4 v1:NOT_REQUIRED, POL-MF5 v1:PENDING, POL-SAAS v1:PENDING, POL-USAGE v1:PENDING |
