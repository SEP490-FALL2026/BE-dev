# Shared demo v3

The single versioned dataset for seed. All identities are fictional. Passwords come only from operator stdin; this file contains none.

## Installation

| Organization                       | Root department | Super Admin | Login                        | Purpose                                                                                                                                                                                                                   |
| ---------------------------------- | --------------- | ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Công ty Cổ phần Công nghệ Sao Việt | ADMIN           | NV-SA       | system.admin@saoviet.example | Bootstrap and account administration; root department is never reused by organization steps. The email is the default: `--super-admin-email` (`SEED_SUPER_ADMIN_EMAIL`) replaces it as login and work email at bootstrap. |

## Departments

| Code | Name                      | Head    | IT Admin | Cost Center | Demo purpose                                           |
| ---- | ------------------------- | ------- | -------- | ----------- | ------------------------------------------------------ |
| BOD  | Ban Giám đốc              | NV-DEP  | NV-ITA2  | CC-BOD      | Department ownership, membership and approval scope    |
| ENG  | Phòng Kỹ thuật            | NV-ENGH | NV-ITA1  | CC-ENG      | Department ownership, membership and approval scope    |
| DES  | Phòng Thiết kế            | NV-DESH | NV-ITA2  | CC-DES      | Department ownership, membership and approval scope    |
| FIN  | Phòng Tài chính - Kế toán | NV-FINH | NV-ITA2  | CC-FIN      | Department ownership, membership and approval scope    |
| ITO  | Phòng Công nghệ thông tin | NV-ITOH | NV-ITA1  | CC-ITO      | Department ownership, membership and approval scope    |
| MKT  | Phòng Marketing           | NV-MKTH | NV-ITA2  | CC-MKT      | Department ownership, membership and approval scope    |
| SAL  | Phòng Kinh doanh          | NV-SALH | NV-ITA1  | CC-SAL      | Department ownership, membership and approval scope    |
| OPS  | Phòng Vận hành            | -       | -        | -           | Intentional incomplete configuration and refusal cases |

## People and accounts

23 dataset people, 21 dataset accounts; installation adds one separate Super Admin and one root department. Each account has exactly one effective role. CEO starts as EMPLOYEE and the role step replaces it with SPENDING_APPROVER.

| Employee | Name            | Login email (or no account) | Final role        | Department | Heads | Demo purpose                                  |
| -------- | --------------- | --------------------------- | ----------------- | ---------- | ----- | --------------------------------------------- |
| NV-CEO   | Nguyễn Văn An   | an.nguyen@saoviet.example   | SPENDING_APPROVER | BOD        | -     | Spend approval; never a Request party         |
| NV-DEP   | Trần Thị Bích   | bich.tran@saoviet.example   | MANAGER           | BOD        | BOD   | Department need approval and budget proposals |
| NV-ENGH  | Lê Minh Cường   | cuong.le@saoviet.example    | MANAGER           | ENG        | ENG   | Department need approval and budget proposals |
| NV-DEV1  | Phạm Thu Dung   | dung.pham@saoviet.example   | EMPLOYEE          | ENG        | -     | Own software, requests and self-service       |
| NV-DEV2  | Hoàng Văn Em    | em.hoang@saoviet.example    | EMPLOYEE          | ENG        | -     | Own software, requests and self-service       |
| NV-DEV3  | Vũ Thị Giang    | giang.vu@saoviet.example    | EMPLOYEE          | ENG        | -     | Own software, requests and self-service       |
| NV-INT1  | Đặng Quốc Huy   | no account                  | -                 | ENG        | -     | Candidate for account creation                |
| NV-DESH  | Bùi Ngọc Khánh  | khanh.bui@saoviet.example   | MANAGER           | DES        | DES   | Department need approval and budget proposals |
| NV-DES1  | Đỗ Thị Lan      | lan.do@saoviet.example      | EMPLOYEE          | DES        | -     | Own software, requests and self-service       |
| NV-DES2  | Ngô Văn Mạnh    | manh.ngo@saoviet.example    | EMPLOYEE          | DES        | -     | Own software, requests and self-service       |
| NV-FINH  | Phan Thị Ngọc   | ngoc.phan@saoviet.example   | MANAGER           | FIN        | FIN   | Department need approval and budget proposals |
| NV-FIN1  | Trịnh Văn Phúc  | phuc.trinh@saoviet.example  | FINANCE           | FIN        | -     | Budget and exception review                   |
| NV-ITOH  | Trần Minh Thanh | thanh.tran@saoviet.example  | MANAGER           | ITO        | ITO   | Department need approval and budget proposals |
| NV-ITA1  | Lý Minh Quân    | quan.ly@saoviet.example     | IT_ADMIN          | ITO        | -     | Catalog and provisioning                      |
| NV-ITA2  | Mai Thị Rạng    | rang.mai@saoviet.example    | IT_ADMIN          | ITO        | -     | Catalog and provisioning                      |
| NV-MKTH  | Đinh Thị Uyên   | uyen.dinh@saoviet.example   | MANAGER           | MKT        | MKT   | Department need approval and budget proposals |
| NV-MKT1  | Lâm Văn Vinh    | vinh.lam@saoviet.example    | EMPLOYEE          | MKT        | -     | Own software, requests and self-service       |
| NV-MKT2  | Châu Thị Xuân   | xuan.chau@saoviet.example   | EMPLOYEE          | MKT        | -     | Own software, requests and self-service       |
| NV-SALH  | Trương Văn Yên  | yen.truong@saoviet.example  | MANAGER           | SAL        | SAL   | Department need approval and budget proposals |
| NV-SAL1  | Kiều Thị Ánh    | anh.kieu@saoviet.example    | EMPLOYEE          | SAL        | -     | Own software, requests and self-service       |
| NV-SAL2  | Quách Văn Bảo   | bao.quach@saoviet.example   | EMPLOYEE          | SAL        | -     | Own software, requests and self-service       |
| NV-OPS1  | Tạ Văn Sơn      | son.ta@saoviet.example      | EMPLOYEE          | OPS        | -     | Own software, requests and self-service       |
| NV-NEW1  | Hồ Thị Tâm      | no account                  | -                 | OPS        | -     | Candidate for account creation                |

## Catalog

| Application | Plan               | Type | Demo purpose                                                                      |
| ----------- | ------------------ | ---- | --------------------------------------------------------------------------------- |
| jira        | jira-standard      | K2   | Catalog, request and execution scenario                                           |
| figma       | figma-professional | K2   | Chuyển quyền sở hữu các tệp thiết kế cá nhân sang thư mục của phòng trước khi gỡ. |
| chatgpt     | chatgpt-plus       | K1   | Catalog, request and execution scenario                                           |
| hr-portal   | hr-portal-access   | K5   | Catalog, request and execution scenario                                           |

| Subscription | Plan               | Owner department | Seats | Demo purpose                                         |
| ------------ | ------------------ | ---------------- | ----- | ---------------------------------------------------- |
| jira-eng     | jira-standard      | ENG              | 20    | Department-owned subscription and available capacity |
| figma-eng    | figma-professional | ENG              | 5     | Department-owned subscription and available capacity |
| figma-des    | figma-professional | DES              | 10    | Department-owned subscription and available capacity |
| chatgpt-eng  | chatgpt-plus       | ENG              | 5     | Department-owned subscription and available capacity |
| chatgpt-mkt  | chatgpt-plus       | MKT              | 5     | Department-owned subscription and available capacity |
| figma-mkt    | figma-professional | MKT              | 3     | Department-owned subscription and available capacity |
| jira-sal     | jira-standard      | SAL              | 10    | Department-owned subscription and available capacity |
| chatgpt-sal  | chatgpt-plus       | SAL              | 5     | Department-owned subscription and available capacity |

## Finance

| Record            | Purpose                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tax profile figma | Supplier VAT and deductible calculation                                                                                                               |
| ENG budget        | 1: Jira Standard cho cả phòng; 2: Figma Professional cho nhóm UI; 3: ChatGPT Plus cho nhóm R&D; same ordered lines in both fiscal years when required |
| MKT budget        | 1: ChatGPT Plus cho nhóm nội dung; 2: Figma Professional cho nhóm quảng cáo; same ordered lines in both fiscal years when required                    |
| SAL budget        | 1: Jira Standard cho nhóm bán hàng; 2: ChatGPT Plus cho nhóm chăm sóc khách hàng; same ordered lines in both fiscal years when required               |

## Requests and extras

| Record | Requester | Target                    | Demo purpose                                                                          |
| ------ | --------- | ------------------------- | ------------------------------------------------------------------------------------- |
| R1     | NV-DEV1   | COMPLETED                 | Trọn luồng D-1: duyệt nhu cầu → trình lô → duyệt chi → IT cấp xong.                   |
| R2     | NV-DEV2   | AWAITING_SPEND_DECISION   | Đang chờ Người duyệt chi (đã kiểm tra ngân sách BUDGET_OK).                           |
| R3     | NV-DEV3   | PENDING                   | Đang chờ trưởng phòng duyệt nhu cầu.                                                  |
| R4     | NV-DES1   | REJECTED                  | Trưởng phòng Thiết kế từ chối ở bước nhu cầu.                                         |
| R5     | NV-DEV1   | WITHDRAWN                 | Người yêu cầu tự rút khi còn chờ.                                                     |
| R6     | NV-DES1   | AWAITING_EXECUTION        | Phần mềm nội bộ không phí: đã duyệt nhu cầu, chờ IT Admin cấp.                        |
| R7     | NV-DEV2   | AWAITING_SPEND_SUBMISSION | Đã duyệt nhu cầu, nằm trong hàng trình lô của trưởng phòng.                           |
| R8     | NV-DEV1   | AWAITING_IT_ASSESSMENT    | Đề xuất phần mềm ngoài danh mục: đã duyệt nhu cầu, chờ IT Admin thẩm định.            |
| R9     | NV-DES2   | AWAITING_FINANCE_REVIEW   | Phòng Thiết kế chưa có ngân sách năm: kiểm tra NO_ACTIVE_BUDGET, chờ Finance rà soát. |

| Record           | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| Draft            | NV-DEV3 prepares an unsent request                         |
| SaaS issue       | R1 assigned user reports a real issue through self-service |
| Personnel notice | NV-ENGH reports planned long leave for NV-DEV3             |

## Current decisions and limits

QD-95: heads hold only MANAGER; IT Admin, Finance, spending approver and Super Admin are separate. QD-93: no fallback/substitute approvers or Project entities; every code matches the current uppercase/hyphen format. QD-94 implemented API: each subscription belongs to one department; requests use the requester department and current batch/review routes. R1/R2 use budget lines 1/2; R7 stays off-plan; R9 deliberately has no department budget.

Next-year branch: paid requests share the first working day of next year and ENG/MKT/SAL get both budget years. R1 is still granted from the current-year jira-eng subscription, ending December 31. Late-November/December seeding can produce renewal events whose notice milestones already passed; that is current sweep behavior. Calendar-year mismatch requires the wrapper reset path.

## Future data candidates

Subscriptions guaranteed inside renewal alert windows [15, 7] days are deferred by OD-S6. QD-94 continuation requests, annual envelopes and ND-90/60/30 need future APIs; no extra record types were added here.

## Adding data

For an existing type, edit its fixture file and update this record inventory/account table and tests. A new type needs one step, one fixture section and one verification.
