# Shared demo v2

The single versioned dataset for seed. All identities are fictional. Passwords come only from operator stdin; this file contains none.

## Installation

| Organization | Root department | Super Admin | Login                         | Purpose                                                                                                                                                                                                                   |
| ------------ | --------------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLM Demo     | DS1-ADMIN       | DS1-SA      | system.admin@slm-demo.example | Bootstrap and account administration; root department is never reused by organization steps. The email is the default: `--super-admin-email` (`SEED_SUPER_ADMIN_EMAIL`) replaces it as login and work email at bootstrap. |

## Departments

| Code    | Name                                      | Head     | IT Admin | Cost Center | Demo purpose                                           |
| ------- | ----------------------------------------- | -------- | -------- | ----------- | ------------------------------------------------------ |
| DS1-BOD | Ban Giám đốc (demo)                       | DS1-DEP  | DS1-ITA2 | DS1-CC-BOD  | Department ownership, membership and approval scope    |
| DS1-ENG | Phòng Kỹ thuật (demo)                     | DS1-ENGH | DS1-ITA1 | DS1-CC-ENG  | Department ownership, membership and approval scope    |
| DS1-DES | Phòng Thiết kế (demo)                     | DS1-DESH | DS1-ITA2 | DS1-CC-DES  | Department ownership, membership and approval scope    |
| DS1-FIN | Phòng Tài chính - Kế toán (demo)          | DS1-FINH | DS1-ITA2 | DS1-CC-FIN  | Department ownership, membership and approval scope    |
| DS1-ITO | Phòng Công nghệ thông tin (demo)          | DS1-ITOH | DS1-ITA1 | DS1-CC-ITO  | Department ownership, membership and approval scope    |
| DS1-MKT | Phòng Marketing (demo)                    | DS1-MKTH | DS1-ITA2 | DS1-CC-MKT  | Department ownership, membership and approval scope    |
| DS1-SAL | Phòng Kinh doanh (demo)                   | DS1-SALH | DS1-ITA1 | DS1-CC-SAL  | Department ownership, membership and approval scope    |
| DS1-OPS | Phòng Vận hành (demo, chưa cấu hình xong) | -        | -        | -           | Intentional incomplete configuration and refusal cases |

## People and accounts

23 dataset people, 21 dataset accounts; installation adds one separate Super Admin and one root department. Each account has exactly one effective role. CEO starts as EMPLOYEE and the role step replaces it with SPENDING_APPROVER.

| Employee | Name            | Login email (or no account)     | Final role        | Department | Heads   | Demo purpose                                  |
| -------- | --------------- | ------------------------------- | ----------------- | ---------- | ------- | --------------------------------------------- |
| DS1-CEO  | Nguyễn Văn An   | an.nguyen@ds1.slm-demo.example  | SPENDING_APPROVER | DS1-BOD    | -       | Spend approval; never a Request party         |
| DS1-DEP  | Trần Thị Bích   | bich.tran@ds1.slm-demo.example  | MANAGER           | DS1-BOD    | DS1-BOD | Department need approval and budget proposals |
| DS1-ENGH | Lê Minh Cường   | cuong.le@ds1.slm-demo.example   | MANAGER           | DS1-ENG    | DS1-ENG | Department need approval and budget proposals |
| DS1-DEV1 | Phạm Thu Dung   | dung.pham@ds1.slm-demo.example  | EMPLOYEE          | DS1-ENG    | -       | Own software, requests and self-service       |
| DS1-DEV2 | Hoàng Văn Em    | em.hoang@ds1.slm-demo.example   | EMPLOYEE          | DS1-ENG    | -       | Own software, requests and self-service       |
| DS1-DEV3 | Vũ Thị Giang    | giang.vu@ds1.slm-demo.example   | EMPLOYEE          | DS1-ENG    | -       | Own software, requests and self-service       |
| DS1-INT1 | Đặng Quốc Huy   | no account                      | -                 | DS1-ENG    | -       | Candidate for account creation                |
| DS1-DESH | Bùi Ngọc Khánh  | khanh.bui@ds1.slm-demo.example  | MANAGER           | DS1-DES    | DS1-DES | Department need approval and budget proposals |
| DS1-DES1 | Đỗ Thị Lan      | lan.do@ds1.slm-demo.example     | EMPLOYEE          | DS1-DES    | -       | Own software, requests and self-service       |
| DS1-DES2 | Ngô Văn Mạnh    | manh.ngo@ds1.slm-demo.example   | EMPLOYEE          | DS1-DES    | -       | Own software, requests and self-service       |
| DS1-FINH | Phan Thị Ngọc   | ngoc.phan@ds1.slm-demo.example  | MANAGER           | DS1-FIN    | DS1-FIN | Department need approval and budget proposals |
| DS1-FIN1 | Trịnh Văn Phúc  | phuc.trinh@ds1.slm-demo.example | FINANCE           | DS1-FIN    | -       | Budget and exception review                   |
| DS1-ITOH | Tran Minh Thanh | thanh.tran@ds1.slm-demo.example | MANAGER           | DS1-ITO    | DS1-ITO | Department need approval and budget proposals |
| DS1-ITA1 | Lý Minh Quân    | quan.ly@ds1.slm-demo.example    | IT_ADMIN          | DS1-ITO    | -       | Catalog and provisioning                      |
| DS1-ITA2 | Mai Thị Rạng    | rang.mai@ds1.slm-demo.example   | IT_ADMIN          | DS1-ITO    | -       | Catalog and provisioning                      |
| DS1-MKTH | Đinh Thị Uyên   | uyen.dinh@ds1.slm-demo.example  | MANAGER           | DS1-MKT    | DS1-MKT | Department need approval and budget proposals |
| DS1-MKT1 | Lâm Văn Vinh    | vinh.lam@ds1.slm-demo.example   | EMPLOYEE          | DS1-MKT    | -       | Own software, requests and self-service       |
| DS1-MKT2 | Châu Thị Xuân   | xuan.chau@ds1.slm-demo.example  | EMPLOYEE          | DS1-MKT    | -       | Own software, requests and self-service       |
| DS1-SALH | Trương Văn Yên  | yen.truong@ds1.slm-demo.example | MANAGER           | DS1-SAL    | DS1-SAL | Department need approval and budget proposals |
| DS1-SAL1 | Kiều Thị Ánh    | anh.kieu@ds1.slm-demo.example   | EMPLOYEE          | DS1-SAL    | -       | Own software, requests and self-service       |
| DS1-SAL2 | Quách Văn Bảo   | bao.quach@ds1.slm-demo.example  | EMPLOYEE          | DS1-SAL    | -       | Own software, requests and self-service       |
| DS1-OPS1 | Tạ Văn Sơn      | son.ta@ds1.slm-demo.example     | EMPLOYEE          | DS1-OPS    | -       | Own software, requests and self-service       |
| DS1-NEW1 | Hồ Thị Tâm      | no account                      | -                 | DS1-OPS    | -       | Candidate for account creation                |

## Catalog

| Application | Plan               | Type | Demo purpose                                                                      |
| ----------- | ------------------ | ---- | --------------------------------------------------------------------------------- |
| jira        | jira-standard      | K2   | Catalog, request and execution scenario                                           |
| figma       | figma-professional | K2   | Chuyển quyền sở hữu các tệp thiết kế cá nhân sang thư mục của phòng trước khi gỡ. |
| chatgpt     | chatgpt-plus       | K1   | Catalog, request and execution scenario                                           |
| hr-portal   | hr-portal-access   | K5   | Catalog, request and execution scenario                                           |

| Subscription | Plan               | Owner department | Seats | Demo purpose                                         |
| ------------ | ------------------ | ---------------- | ----- | ---------------------------------------------------- |
| jira-eng     | jira-standard      | DS1-ENG          | 20    | Department-owned subscription and available capacity |
| figma-eng    | figma-professional | DS1-ENG          | 5     | Department-owned subscription and available capacity |
| figma-des    | figma-professional | DS1-DES          | 10    | Department-owned subscription and available capacity |
| chatgpt-eng  | chatgpt-plus       | DS1-ENG          | 5     | Department-owned subscription and available capacity |
| chatgpt-mkt  | chatgpt-plus       | DS1-MKT          | 5     | Department-owned subscription and available capacity |
| figma-mkt    | figma-professional | DS1-MKT          | 3     | Department-owned subscription and available capacity |
| jira-sal     | jira-standard      | DS1-SAL          | 10    | Department-owned subscription and available capacity |
| chatgpt-sal  | chatgpt-plus       | DS1-SAL          | 5     | Department-owned subscription and available capacity |

## Finance

| Record            | Purpose                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tax profile figma | Supplier VAT and deductible calculation                                                                                                               |
| DS1-ENG budget    | 1: Jira Standard cho cả phòng; 2: Figma Professional cho nhóm UI; 3: ChatGPT Plus cho nhóm R&D; same ordered lines in both fiscal years when required |
| DS1-MKT budget    | 1: ChatGPT Plus cho nhóm nội dung; 2: Figma Professional cho nhóm quảng cáo; same ordered lines in both fiscal years when required                    |
| DS1-SAL budget    | 1: Jira Standard cho nhóm bán hàng; 2: ChatGPT Plus cho nhóm chăm sóc khách hàng; same ordered lines in both fiscal years when required               |

## Requests and extras

| Record | Requester | Target                    | Demo purpose                                                                            |
| ------ | --------- | ------------------------- | --------------------------------------------------------------------------------------- |
| R1     | DS1-DEV1  | COMPLETED                 | Trọn luồng D-1: duyệt nhu cầu (gắn dòng kế hoạch) → trình lô → duyệt chi → IT cấp xong. |
| R2     | DS1-DEV2  | AWAITING_SPEND_DECISION   | Đang chờ Người duyệt chi (đã kiểm tra ngân sách BUDGET_OK).                             |
| R3     | DS1-DEV3  | PENDING                   | Đang chờ trưởng phòng duyệt nhu cầu.                                                    |
| R4     | DS1-DES1  | REJECTED                  | Trưởng phòng Thiết kế từ chối ở bước nhu cầu.                                           |
| R5     | DS1-DEV1  | WITHDRAWN                 | Người yêu cầu tự rút khi còn chờ.                                                       |
| R6     | DS1-DES1  | AWAITING_EXECUTION        | Phần mềm nội bộ không phí: đã duyệt nhu cầu, chờ IT Admin cấp.                          |
| R7     | DS1-DEV2  | AWAITING_SPEND_SUBMISSION | Đã duyệt nhu cầu (ngoài kế hoạch), nằm trong hàng trình lô của trưởng phòng.            |
| R8     | DS1-DEV1  | AWAITING_IT_ASSESSMENT    | Đề xuất phần mềm ngoài danh mục: đã duyệt nhu cầu, chờ IT Admin thẩm định.              |
| R9     | DS1-DES2  | AWAITING_FINANCE_REVIEW   | Phòng Thiết kế chưa có ngân sách năm: kiểm tra NO_ACTIVE_BUDGET, chờ Finance rà soát.   |

| Record           | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| Draft            | DS1-DEV3 prepares an unsent request                        |
| SaaS issue       | R1 assigned user reports a real issue through self-service |
| Personnel notice | DS1-ENGH reports planned long leave for DS1-DEV3           |

## Current decisions and limits

QD-95: heads hold only MANAGER; IT Admin, Finance, spending approver and Super Admin are separate. QD-93: no fallback/substitute approvers or Project entities; every code matches the current uppercase/hyphen format. QD-94 implemented API: each subscription belongs to one department; requests use the requester department and current batch/review routes. R1/R2 use budget lines 1/2; R7 stays off-plan; R9 deliberately has no department budget.

Next-year branch: paid requests share the first working day of next year and ENG/MKT/SAL get both budget years. R1 is still granted from the current-year jira-eng subscription, ending December 31. Late-November/December seeding can produce renewal events whose notice milestones already passed; that is current sweep behavior. Calendar-year mismatch requires the wrapper reset path.

## Future data candidates

Subscriptions guaranteed inside renewal alert windows [15, 7] days are deferred by OD-S6. QD-94 continuation requests, annual envelopes and ND-90/60/30 need future APIs; no extra record types were added here.

## Adding data

For an existing type, edit its fixture file and update this record inventory/account table and tests. A new type needs one step, one fixture section and one verification. Published fixture versions are immutable after shared deployment.
