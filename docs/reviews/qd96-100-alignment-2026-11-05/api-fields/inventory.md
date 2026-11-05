# API field inventory (generated)

Nguồn: `openapi.json` + `docs/generated/routes.md` của BE `3e4553b9`. Sinh bằng script, không sửa tay. Vai lấy từ mô tả response 403.

Tổng: 311 operation, 165 ghi.

## access-requests

### POST `/api/v1/access-requests/drafts` — `accessRequestDraftSave`

- Summary: Save a request as a draft
- Roles (403): The Super Admin sends no request, so keeps no draft of one (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `AugmentedZodDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `{variant1:}.planId` | string:uuid | yes |  |  |
| `{variant1:}.businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `{variant1:}.termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `{variant1:}.expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `{variant1:}.kind` | enum(INDIVIDUAL) | yes |  |  |
| `{variant2:}.planId` | string:uuid | yes |  |  |
| `{variant2:}.lines` | array<object> | yes | minItems=1 maxItems=1000 |  |
| `{variant2:}.lines[].employeeId` | string:uuid | yes |  |  |
| `{variant2:}.lines[].expectedEndDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `{variant2:}.businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `{variant2:}.termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `{variant2:}.expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `{variant2:}.termConfirmation` | object |  |  |  |
| `{variant2:}.termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |
| `{variant2:}.kind` | enum(GROUP) | yes |  |  |
| `{variant3:}.planId` | string:uuid | yes |  |  |
| `{variant3:}.purpose` | string | yes | minLength=1 maxLength=1000 |  |
| `{variant3:}.expectedIdentifier` | string | yes | minLength=1 maxLength=254 |  |
| `{variant3:}.businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `{variant3:}.termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `{variant3:}.expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `{variant3:}.kind` | enum(SERVICE_ACCOUNT) | yes |  |  |

### GET `/api/v1/access-requests/drafts` — `accessRequestDraftList`

- Summary: List the drafts of the caller
- Roles (403): The Super Admin sends no request, so keeps no draft of one (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Params: query:page(integer minimum=1 maximum=9007199254740991 default=1), query:pageSize(integer minimum=1 maximum=100 default=20)

### POST `/api/v1/access-requests/drafts/{id}/submission` — `accessRequestDraftSubmit`

- Summary: Send a draft
- Roles (403): The Super Admin sends no request, so keeps no draft of one (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Params: path:id*(string:uuid)
- Body: `DraftSubmitBodyDto` (required)


### DELETE `/api/v1/access-requests/drafts/{id}` — `accessRequestDraftDelete`

- Summary: Delete a draft
- Roles (403): The Super Admin sends no request, so keeps no draft of one (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Params: path:id*(string:uuid)

### POST `/api/v1/access-requests` — `accessRequestSubmit`

- Summary: Send a request for access to software
- Roles (403): The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `SubmitBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |
| `businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/access-requests/preview` — `accessRequestPreview`

- Summary: Preview a request before sending it
- Roles (403): (no 403 — any authenticated or public)
- Body: `PreviewBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### GET `/api/v1/access-requests/{id}` — `accessRequestGet`

- Summary: Get a request for access to software
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### POST `/api/v1/access-requests/{id}/need-decision` — `accessRequestNeedDecide`

- Summary: Approve or refuse the need step of a request
- Roles (403): The caller asked for or is given the request (ACCESS_REQUEST.OWN_REQUEST), or does not hold the step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).
- Params: path:id*(string:uuid)
- Body: `NeedDecisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `decision` | enum(APPROVE/REJECT) | yes |  |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |
| `termConfirmation` | object |  |  |  |
| `termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |
| `spend` | object |  |  | Choose exactly one: a line of the plan of the budget (planLine), or that the spend is outside it (offPlan: true). |
| `spend.planLine` | object |  |  |  |
| `spend.planLine.position` | integer | yes | minimum=1 maximum=9007199254740991 |  |
| `spend.planLine.stillNeeded` | boolean |  |  |  |
| `spend.offPlan` | enum(true) |  |  |  |
| `spend.expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/access-requests/{id}/withdraw` — `accessRequestWithdraw`

- Summary: Withdraw a request that is still waiting
- Roles (403): The caller is not the requester, the person it was sent for included, and not the head in a stage the head acts on (ACCESS_REQUEST.NOT_REQUESTER).
- Params: path:id*(string:uuid)
- Body: `WithdrawBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### GET `/api/v1/access-requests/{id}/similar-seats` — `accessRequestSimilarSeatList`

- Summary: List the similar seats of the person asked for
- Roles (403): The caller has a part in the request but does not hold its need step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20), query:employeeId(string:uuid)

### POST `/api/v1/access-requests/{id}/cancellation` — `accessRequestCancelForDeparture`

- Summary: Close a request because the person it was for left
- Roles (403): Only an IT Admin closes a request because the person it was for left.
- Params: path:id*(string:uuid)
- Body: `CancelBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `cause` | enum(BENEFICIARY_LEFT/BENEFICIARY_TRANSFERRED) | yes |  |  |
| `note` | string |  | minLength=1 maxLength=1000 |  |
| `evidence` | string |  | minLength=1 maxLength=1000 |  |

### POST `/api/v1/access-requests/proposals` — `accessRequestPropose`

- Summary: Propose software that is not in the catalog
- Roles (403): The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `ProposalBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `softwareName` | string | yes | minLength=1 maxLength=200 |  |
| `homepageUrl` | string | yes | maxLength=500 | An absolute web address, http or https, with a host; surrounding whitespace is trimmed first. |
| `purpose` | string | yes | minLength=1 maxLength=1000 |  |
| `dataDescription` | string | yes | minLength=1 maxLength=1000 |  |
| `expectedUsers` | integer | yes | minimum=1 maximum=1000000 |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### GET `/api/v1/access-requests/{id}/assessment` — `accessRequestAssessmentGet`

- Summary: Get the assessment of a proposal
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### PUT `/api/v1/access-requests/{id}/assessment` — `accessRequestAssessmentSave`

- Summary: Fill the assessment of a proposal
- Roles (403): Only an IT Admin does this, and not for a request they asked for or are given (ACCESS_REQUEST.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `AssessmentPatchDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `classification` | enum(INTERNAL/PAID_LICENSED) |  |  |  |
| `vendorId` | string:uuid |  | nullable |  |
| `vendorName` | string |  | minLength=1 maxLength=200 |  |
| `plannedPlanName` | string |  | minLength=1 maxLength=200 |  |
| `provisioningType` | enum(K1/K2/K3/K4) |  |  |  |
| `adminConsole` | boolean |  |  |  |
| `memberExport` | boolean |  |  |  |
| `sso` | boolean |  |  |  |
| `termsSummary` | string |  | minLength=1 maxLength=2000 |  |
| `memberUsageMethod` | string |  | minLength=1 maxLength=1000 |  |
| `grantRevokeMethod` | string |  | minLength=1 maxLength=1000 |  |
| `dataSensitivity` | enum(LOW/MEDIUM/HIGH) |  |  |  |
| `opinion` | object |  | nullable |  |
| `opinion.status` | enum(OBTAINED/NOT_AVAILABLE) | yes |  |  |
| `opinion.note` | string |  | minLength=1 maxLength=1000 |  |
| `equivalentPlanId` | string:uuid |  | nullable |  |
| `proposedBusinessOwnerEmployeeId` | string:uuid |  | nullable |  |
| `controlLevel` | enum(FULL/PARTIAL/UNCONTROLLABLE) |  |  |  |
| `controlRiskNote` | string |  | minLength=1 maxLength=1000 nullable |  |
| `quote` | object |  | nullable |  |
| `quote.unitPrice` | object | yes |  |  |
| `quote.unitPrice.amount` | string | yes | maxLength=40 |  |
| `quote.unitPrice.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quote.billingCycle` | enum(MONTHLY/QUARTERLY/ANNUAL) | yes |  |  |
| `quote.validFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `quote.validUntil` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `quote.commitmentMonths` | integer |  | minimum=1 maximum=120 nullable |  |
| `quote.paymentFrequency` | enum(MONTHLY/QUARTERLY/ANNUAL/UPFRONT_ONCE/) |  | nullable |  |
| `quote.firstPaymentOn` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/access-requests/{id}/assessment/completion` — `accessRequestAssessmentComplete`

- Summary: Complete the assessment of a proposal
- Roles (403): Only an IT Admin does this, and not for a request they asked for or are given (ACCESS_REQUEST.OWN_REQUEST).
- Params: path:id*(string:uuid)

### POST `/api/v1/access-requests/{id}/assessment/rejection` — `accessRequestAssessmentReject`

- Summary: Refuse a proposal at the gate
- Roles (403): Only an IT Admin does this, and not for a request they asked for or are given (ACCESS_REQUEST.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `AssessmentRejectionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `kind` | enum(UNCONTROLLABLE/NOT_ELIGIBLE) | yes |  |  |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |
| `alternativePlanId` | string:uuid |  |  |  |
| `alternativeNote` | string |  | minLength=1 maxLength=1000 |  |

### POST `/api/v1/access-requests/{id}/internal-registration` — `accessRequestInternalRegister`

- Summary: Register the internal software of a proposal
- Roles (403): Only an IT Admin does this, and not for a request they asked for or are given (ACCESS_REQUEST.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `InternalRegistrationBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `businessOwnerEmployeeId` | string:uuid | yes |  |  |
| `softwareName` | string |  | minLength=1 maxLength=200 |  |
| `dataSensitivity` | enum(LOW/MEDIUM/HIGH) |  |  |  |
| `spend` | object |  |  |  |
| `spend.quote` | object | yes |  |  |
| `spend.quote.unitPrice` | object | yes |  |  |
| `spend.quote.unitPrice.amount` | string | yes | maxLength=40 |  |
| `spend.quote.unitPrice.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `spend.quote.billingCycle` | enum(MONTHLY/QUARTERLY/ANNUAL) | yes |  |  |
| `spend.quote.validFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `spend.quote.validUntil` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `spend.quote.commitmentMonths` | integer |  | minimum=1 maximum=120 nullable |  |
| `spend.quote.paymentFrequency` | enum(MONTHLY/QUARTERLY/ANNUAL/UPFRONT_ONCE/) |  | nullable |  |
| `spend.quote.firstPaymentOn` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/access-requests/{id}/catalog-link` — `accessRequestCatalogLink`

- Summary: Link a proposal to its registered plan
- Roles (403): Only an IT Admin does this, and not for a request they asked for or are given (ACCESS_REQUEST.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `CatalogLinkBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |

### GET `/api/v1/assessment-queue` — `assessmentQueueList`

- Summary: List the proposals waiting for IT assessment
- Roles (403): Only an IT Admin reads the proposals that wait for IT assessment.
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/access-requests/service-accounts` — `accessRequestServiceAccountSubmit`

- Summary: Send a request for a service account
- Roles (403): The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `ServiceAccountSubmitBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |
| `purpose` | string | yes | minLength=1 maxLength=1000 |  |
| `expectedIdentifier` | string | yes | minLength=1 maxLength=254 |  |
| `businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/access-requests/{id}/service-account-review` — `accessRequestServiceAccountReview`

- Summary: Accept or refuse the boundary of a service account
- Roles (403): Only an IT Admin decides, and one who answers for the account themselves waits for another usable IT Admin (PROVISIONING.ANOTHER_IT_ADMIN_NEEDED).
- Params: path:id*(string:uuid)
- Body: `ServiceAccountReviewBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `decision` | enum(ACCEPT/REJECT) | yes |  |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### POST `/api/v1/access-requests/renewals` — `accessRequestRenewalSubmit`

- Summary: Ask to renew a right that ends on a day
- Roles (403): The caller is neither the holder nor the head of the department of the holder (RENEWAL_REQUEST.NOT_HOLDER), heads another department (RENEWAL_REQUEST.OUTSIDE_DEPARTMENT), or is the Super Admin, who sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `RenewalBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `assignmentId` | string:uuid | yes |  |  |
| `newExpectedEndDate` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `termConfirmation` | object |  |  |  |
| `termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |

### GET `/api/v1/access-requests/{id}/timings` — `accessRequestTimingsGet`

- Summary: Read the time a request took
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

## app-users

### GET `/api/v1/account-candidates` — `accountCandidatesList`

- Summary: Find employees who can get an account
- Roles (403): Only the Super Admin may call this route.
- Params: query:search(string maxLength=100)

### POST `/api/v1/app-users` — `appUserCreate`

- Summary: Create an account for an employee
- Roles (403): Only the Super Admin may call this route.
- Body: `CreateAppUserBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `loginEmail` | string |  | maxLength=254 |  |
| `role` | enum(SUPER_ADMIN/IT_ADMIN/FINANCE/EMPLOYEE/MANAGER/SPENDING_APPROVER) |  | default="EMPLOYEE" |  |

### GET `/api/v1/app-users` — `appUserList`

- Summary: List accounts
- Description: Filter by department membership on a date; memberOn requires departmentId.
- Roles (403): Only the Super Admin may call this route.
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20), query:status(enum(ACTIVE|LOCKED)), query:activationState(enum(INVITED|ACTIVATED)), query:role(enum(SUPER_ADMIN|IT_ADMIN|FINANCE|EMPLOYEE|MANAGER|SPENDING_APPROVER)), query:departmentId(string:uuid), query:memberOn(string:date), query:employeeLeft(enum(true|false))

### GET `/api/v1/app-users/{id}` — `appUserGet`

- Summary: Get an account
- Roles (403): Only the Super Admin may call this route.
- Params: path:id*(string:uuid)

### POST `/api/v1/app-users/{id}/invitations` — `appUserResendInvitation`

- Summary: Send a new invitation
- Roles (403): Only the Super Admin may call this route.
- Params: path:id*(string:uuid)

### POST `/api/v1/app-users/{id}/lock` — `appUserLock`

- Summary: Lock an account
- Roles (403): Only the Super Admin may call this route.
- Params: path:id*(string:uuid)
- Body: `AccountStatusChangeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/app-users/{id}/unlock` — `appUserUnlock`

- Summary: Unlock an account
- Roles (403): Only the Super Admin may call this route.
- Params: path:id*(string:uuid)
- Body: `AccountStatusChangeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |

### PUT `/api/v1/app-users/{id}/role` — `appUserChangeRole`

- Summary: Change the role of an account
- Roles (403): Only the Super Admin may call this route.
- Params: path:id*(string:uuid)
- Body: `ChangeRoleBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `role` | enum(SUPER_ADMIN/IT_ADMIN/FINANCE/EMPLOYEE/MANAGER/SPENDING_APPROVER) | yes |  |  |

## applications

### GET `/api/v1/applications` — `applicationList`

- Summary: List applications
- Roles (403): Only the IT Admin and Finance read the application catalog.
- Params: query:search(string maxLength=100), query:kind(enum(SAAS|LICENSED|INTERNAL)), query:status(enum(APPROVED|RETIRED)), query:functionalGroupId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/applications` — `applicationCreate`

- Summary: Declare an application
- Roles (403): Only an IT Admin changes the application catalog.
- Body: `DeclareApplicationBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | maxLength=1000 |  |
| `kind` | enum(SAAS/LICENSED/INTERNAL) | yes |  |  |
| `vendorName` | string |  | maxLength=1000 |  |
| `dictionaryServiceLineId` | string:uuid |  |  |  |
| `domains` | array<string> |  | maxItems=100 |  |
| `dataSensitivity` | enum(LOW/MEDIUM/HIGH) | yes |  |  |
| `businessOwnerEmployeeId` | string:uuid | yes |  |  |
| `communication` | object | yes |  |  |
| `communication.personToPersonMessaging` | boolean | yes |  |  |
| `communication.callsOrMeetings` | boolean | yes |  |  |
| `communication.mailbox` | boolean | yes |  |  |
| `communication.note` | string |  | maxLength=5000 |  |
| `functionalGroupId` | string:uuid |  |  |  |

### GET `/api/v1/applications/{id}` — `applicationGet`

- Summary: Get an application
- Roles (403): Only the IT Admin and Finance read the application catalog.
- Params: path:id*(string:uuid)

### PATCH `/api/v1/applications/{id}` — `applicationUpdate`

- Summary: Update an application
- Roles (403): Only an IT Admin changes the application catalog.
- Params: path:id*(string:uuid)
- Body: `UpdateApplicationBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=1000 |  |
| `domains` | array<string> |  | maxItems=100 |  |
| `dataSensitivity` | enum(LOW/MEDIUM/HIGH) |  |  |  |
| `businessOwnerEmployeeId` | string:uuid |  |  |  |
| `communication` | object |  |  |  |
| `communication.personToPersonMessaging` | boolean |  |  |  |
| `communication.callsOrMeetings` | boolean |  |  |  |
| `communication.mailbox` | boolean |  |  |  |
| `communication.note` | string |  | maxLength=5000 nullable |  |
| `functionalGroupId` | string:uuid |  | nullable |  |
| `dictionaryServiceLineId` | string:uuid |  | nullable |  |

### GET `/api/v1/business-owner-warnings` — `businessOwnerWarningList`

- Summary: List the applications whose Business Owner has left
- Roles (403): Only an IT Admin reads the alerts.
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/applications/{id}/business-owners` — `applicationBusinessOwnerHistory`

- Summary: List the Business Owners an application had
- Roles (403): Only the IT Admin and Finance read the history.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/applications/{id}/retirement-confirmations` — `applicationRetirementConfirm`

- Summary: Record the confirmation of the Business Owner to retire an application
- Roles (403): Only an IT Admin records the confirmation.
- Params: path:id*(string:uuid)
- Body: `ConfirmRetirementBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `businessOwnerEmployeeId` | string:uuid | yes |  |  |
| `note` | string |  | maxLength=2000 default="" |  |

### GET `/api/v1/applications/{id}/retirement` — `applicationRetirementGet`

- Summary: See what stands between an application and its retirement
- Roles (403): Only the IT Admin and Finance read it.
- Params: path:id*(string:uuid)

### POST `/api/v1/applications/{id}/retire` — `applicationRetire`

- Summary: Retire an application
- Roles (403): Only an IT Admin retires an application.
- Params: path:id*(string:uuid)

## assignment-expiry

### GET `/api/v1/assignment-expiry-queue` — `assignmentExpiryQueueList`

- Summary: List the rights that ended and are still held
- Roles (403): Only an IT Admin reads the queue.
- Params: query:status(enum(WAITING_RENEWAL_DECISION|READY_TO_REVOKE|REVOCATION_OPEN)), query:debt(enum(true|false)), query:departmentId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/assignment-expiry-queue/{assignmentId}/revocation` — `assignmentExpiryStartRevocation`

- Summary: Start the revocation of a right that ended
- Roles (403): Only an IT Admin starts the revocation.
- Params: path:assignmentId*(string:uuid)

### GET `/api/v1/assignment-expiry-reminders` — `assignmentExpiryReminderList`

- Summary: List the reminders that a right is about to end
- Roles (403): Only an IT Admin asks for scope all (ASSIGNMENT_EXPIRY.SCOPE_FORBIDDEN).
- Params: query:scope(enum(mine|all) default="mine"), query:audience(enum(EMPLOYEE|HEAD|IT_ADMIN)), query:assignmentId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## audit

### GET `/api/v1/audit-events` — `auditEventList`

- Summary: Search the audit trail
- Roles (403): Only the Super Admin may read the Audit Trail.
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20), query:resourceType(string minLength=1 maxLength=100), query:resourceId(string minLength=1 maxLength=200), query:actorAppUserId(string:uuid), query:action(string minLength=1 maxLength=100), query:occurredFrom(string:date-time), query:occurredTo(string:date-time)

## auth

### POST `/api/v1/auth/login` — `authLogin`

- Summary: Sign in with email and password
- Roles (403): (no 403 — any authenticated or public)
- Body: `LoginBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `email` | string | yes | maxLength=254 |  |
| `password` | string | yes | minLength=1 maxLength=256 |  |

### POST `/api/v1/auth/refresh` — `authRefresh`

- Summary: Exchange a refresh token for a new pair
- Roles (403): (no 403 — any authenticated or public)
- Body: `RefreshTokenBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `refreshToken` | string | yes | minLength=1 maxLength=512 |  |

### POST `/api/v1/auth/logout` — `authLogout`

- Summary: Sign out the session of a refresh token
- Roles (403): (no 403 — any authenticated or public)
- Body: `RefreshTokenBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `refreshToken` | string | yes | minLength=1 maxLength=512 |  |

### POST `/api/v1/auth/password-reset-requests` — `authRequestPasswordReset`

- Summary: Request a password reset email
- Roles (403): (no 403 — any authenticated or public)
- Body: `PasswordResetRequestBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `email` | string:email | yes | minLength=1 maxLength=320 | An email address; surrounding whitespace is trimmed before it is checked. |

### POST `/api/v1/auth/password-resets` — `authResetPassword`

- Summary: Set a new password with a reset token
- Roles (403): (no 403 — any authenticated or public)
- Body: `PasswordResetBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `token` | string | yes | minLength=1 maxLength=256 |  |
| `newPassword` | string | yes | minLength=1 maxLength=1024 |  |

### POST `/api/v1/auth/invitations/redeem` — `authRedeemInvitation`

- Summary: Activate an account from an invitation
- Roles (403): (no 403 — any authenticated or public)
- Body: `RedeemInvitationBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `token` | string | yes | minLength=1 maxLength=256 |  |
| `password` | string | yes | minLength=1 maxLength=1024 |  |

## budget-commitments

### GET `/api/v1/budget-commitments` — `budgetCommitmentList`

- Summary: List the commitments held against the budgets
- Roles (403): Only Finance reads the commitments.
- Params: query:attached(enum(true|false)), query:year(integer minimum=2000 maximum=2200), query:costCenterId(string:uuid), query:requestId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/budget-commitments/{id}/releases` — `budgetCommitmentReleases`

- Summary: List what went back to the budget from a commitment
- Roles (403): Only Finance reads the commitments.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-commitments/{id}/release` — `budgetCommitmentRelease`

- Summary: Release what is left of a commitment
- Roles (403): Only Finance releases a commitment.
- Params: path:id*(string:uuid)
- Body: `ReleaseBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |

## budget-information

### POST `/api/v1/access-requests/{id}/budget-information-requests` — `budgetInformationAsk`

- Summary: Ask Finance for information on the budget
- Roles (403): The caller does not hold the spend step (BUDGET_INFORMATION.NOT_THE_ASSIGNEE) or asked for or is given the access (BUDGET_INFORMATION.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `AskBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `question` | string | yes | minLength=1 maxLength=2000 |  |

### GET `/api/v1/access-requests/{id}/budget-information-requests` — `budgetInformationOfRequest`

- Summary: List the questions put to Finance on a request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/budget-information-requests` — `budgetInformationList`

- Summary: List the questions put to Finance
- Roles (403): Only Finance reads the questions.
- Params: query:state(enum(OPEN|ANSWERED|CLOSED)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-information-requests/{id}/answer` — `budgetInformationAnswer`

- Summary: Answer a question on the budget
- Roles (403): The caller is not Finance, takes part in the request (BUDGET_INFORMATION.OWN_REQUEST) or decides it as the spending approver (BUDGET_INFORMATION.SOD_APPROVER).
- Params: path:id*(string:uuid)
- Body: `AnswerBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `answer` | enum(WITHIN_LIMIT/OVER_LIMIT/NO_BUDGET) | yes |  |  |
| `note` | string |  | minLength=1 maxLength=2000 |  |

## budget-proposals

### POST `/api/v1/budget-proposals` — `budgetProposalSubmit`

- Summary: Send a budget proposal
- Roles (403): Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).
- Body: `BudgetProposalBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `costCenterId` | string:uuid | yes |  |  |
| `year` | integer | yes | minimum=2000 maximum=2200 |  |
| `lines` | array<object> | yes | minItems=1 maxItems=200 |  |
| `lines[].description` | string | yes | minLength=1 maxLength=200 |  |
| `lines[].planId` | string:uuid |  |  |  |
| `lines[].seats` | integer |  | minimum=1 maximum=100000 |  |
| `lines[].amount` | object | yes |  |  |
| `lines[].amount.amount` | string | yes | maxLength=40 |  |
| `lines[].amount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `lines[].windowFrom` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].windowTo` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].servicePeriodMonths` | integer |  | minimum=1 maximum=120 |  |
| `lines[].repeatCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/ONE_TIME) |  |  |  |
| `lines[].quoteValidUntil` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].note` | string |  | minLength=1 maxLength=1000 |  |
| `attachmentIds` | array<string:uuid> |  | maxItems=20 |  |

### GET `/api/v1/budget-proposals` — `budgetProposalList`

- Summary: List budget proposals
- Roles (403): (no 403 — any authenticated or public)
- Params: query:state(enum(SUBMITTED|WITHDRAWN|RETURNED|REVIEWED|CLOSED_FISCAL_YEAR_ENDED)), query:year(integer minimum=2000 maximum=2200), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/budget-proposals/{id}` — `budgetProposalGet`

- Summary: Get a budget proposal
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/budget-proposals/{id}/lines` — `budgetProposalLineList`

- Summary: List the lines of a budget proposal
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-proposals/{id}/withdrawal` — `budgetProposalWithdraw`

- Summary: Take a budget proposal back
- Roles (403): Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).
- Params: path:id*(string:uuid)

### POST `/api/v1/budget-proposals/{id}/return` — `budgetProposalReturn`

- Summary: Give a budget proposal back to the head
- Roles (403): Only Finance gives a proposal back.
- Params: path:id*(string:uuid)
- Body: `BudgetProposalReturnBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/budget-proposals/{id}/resubmission` — `budgetProposalResubmit`

- Summary: Send a budget proposal again after it was given back
- Roles (403): Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).
- Params: path:id*(string:uuid)
- Body: `ResubmissionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `lines` | array<object> | yes | minItems=1 maxItems=200 |  |
| `lines[].description` | string | yes | minLength=1 maxLength=200 |  |
| `lines[].planId` | string:uuid |  |  |  |
| `lines[].seats` | integer |  | minimum=1 maximum=100000 |  |
| `lines[].amount` | object | yes |  |  |
| `lines[].amount.amount` | string | yes | maxLength=40 |  |
| `lines[].amount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `lines[].windowFrom` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].windowTo` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].servicePeriodMonths` | integer |  | minimum=1 maximum=120 |  |
| `lines[].repeatCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/ONE_TIME) |  |  |  |
| `lines[].quoteValidUntil` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].note` | string |  | minLength=1 maxLength=1000 |  |
| `attachmentIds` | array<string:uuid> |  | maxItems=20 |  |

## budget-versions

### POST `/api/v1/budget-versions` — `budgetVersionCreate`

- Summary: Build the first version of a budget from a proposal
- Roles (403): Only Finance builds the versions of a budget.
- Body: `VersionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `proposalId` | string:uuid | yes |  |  |
| `base` | object | yes |  |  |
| `base.amount` | string | yes | maxLength=40 |  |
| `base.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `reserve` | object | yes |  |  |
| `reserve.amount` | string | yes | maxLength=40 |  |
| `reserve.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `highValuePercent` | integer | yes | minimum=0 maximum=100 |  |
| `highValueAmount` | object |  | nullable |  |
| `highValueAmount.amount` | string | yes | maxLength=40 |  |
| `highValueAmount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters` | object |  | nullable |  |
| `quarters.q1` | object | yes |  |  |
| `quarters.q1.amount` | string | yes | maxLength=40 |  |
| `quarters.q1.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q2` | object | yes |  |  |
| `quarters.q2.amount` | string | yes | maxLength=40 |  |
| `quarters.q2.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q3` | object | yes |  |  |
| `quarters.q3.amount` | string | yes | maxLength=40 |  |
| `quarters.q3.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q4` | object | yes |  |  |
| `quarters.q4.amount` | string | yes | maxLength=40 |  |
| `quarters.q4.currency` | string | yes | pattern="^[A-Z]{3}$" |  |

### GET `/api/v1/budget-versions` — `budgetVersionList`

- Summary: List the versions of the budgets
- Roles (403): Only Finance and the spending approver read the versions of a budget.
- Params: query:state(enum(DRAFT|SENT|APPROVED|REJECTED|CHANGES_REQUESTED|SUPERSEDED|EXPIRED)), query:year(integer minimum=2000 maximum=2200), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-versions/revisions` — `budgetVersionRevise`

- Summary: Build a revision of the current budget
- Roles (403): Only Finance builds the versions of a budget.
- Body: `RevisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `costCenterId` | string:uuid | yes |  |  |
| `year` | integer | yes | minimum=2000 maximum=2200 |  |
| `base` | object |  |  |  |
| `base.amount` | string | yes | maxLength=40 |  |
| `base.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `reserve` | object |  |  |  |
| `reserve.amount` | string | yes | maxLength=40 |  |
| `reserve.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `highValuePercent` | integer |  | minimum=0 maximum=100 |  |
| `highValueAmount` | object |  | nullable |  |
| `highValueAmount.amount` | string | yes | maxLength=40 |  |
| `highValueAmount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters` | object |  | nullable |  |
| `quarters.q1` | object | yes |  |  |
| `quarters.q1.amount` | string | yes | maxLength=40 |  |
| `quarters.q1.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q2` | object | yes |  |  |
| `quarters.q2.amount` | string | yes | maxLength=40 |  |
| `quarters.q2.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q3` | object | yes |  |  |
| `quarters.q3.amount` | string | yes | maxLength=40 |  |
| `quarters.q3.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q4` | object | yes |  |  |
| `quarters.q4.amount` | string | yes | maxLength=40 |  |
| `quarters.q4.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### GET `/api/v1/budget-versions/{id}/history` — `budgetVersionHistoryList`

- Summary: List the edits of a version
- Roles (403): Only Finance and the person who decides the version read its history.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/budget-versions/{id}` — `budgetVersionGet`

- Summary: Get a version of a budget
- Roles (403): Only Finance and the spending approver read the versions of a budget.
- Params: path:id*(string:uuid)

### PUT `/api/v1/budget-versions/{id}` — `budgetVersionUpdate`

- Summary: Change the figures of a version being built
- Roles (403): Only Finance builds the versions of a budget.
- Params: path:id*(string:uuid)
- Body: `VersionPatchDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `base` | object |  |  |  |
| `base.amount` | string | yes | maxLength=40 |  |
| `base.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `reserve` | object |  |  |  |
| `reserve.amount` | string | yes | maxLength=40 |  |
| `reserve.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `highValuePercent` | integer |  | minimum=0 maximum=100 |  |
| `highValueAmount` | object |  | nullable |  |
| `highValueAmount.amount` | string | yes | maxLength=40 |  |
| `highValueAmount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters` | object |  | nullable |  |
| `quarters.q1` | object | yes |  |  |
| `quarters.q1.amount` | string | yes | maxLength=40 |  |
| `quarters.q1.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q2` | object | yes |  |  |
| `quarters.q2.amount` | string | yes | maxLength=40 |  |
| `quarters.q2.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q3` | object | yes |  |  |
| `quarters.q3.amount` | string | yes | maxLength=40 |  |
| `quarters.q3.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `quarters.q4` | object | yes |  |  |
| `quarters.q4.amount` | string | yes | maxLength=40 |  |
| `quarters.q4.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `reason` | string |  | minLength=1 maxLength=1000 nullable |  |

### POST `/api/v1/budget-versions/{id}/submission` — `budgetVersionSend`

- Summary: Send a version to the spending approver
- Roles (403): Only Finance builds the versions of a budget.
- Params: path:id*(string:uuid)

### POST `/api/v1/budget-versions/{id}/decision` — `budgetVersionDecide`

- Summary: Decide a version of a budget
- Roles (403): The caller is not the spending approver (BUDGET.NOT_SPENDING_APPROVER), is the spending approver who sent the proposal behind the version, which nobody then decides (BUDGET.CONFLICT_OF_INTEREST), or built or sent the version (BUDGET.OWN_VERSION).
- Params: path:id*(string:uuid)
- Body: `DecisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `decision` | enum(APPROVE/REJECT/REQUEST_CHANGES) | yes |  |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### GET `/api/v1/budget-versions/{id}/lines` — `budgetVersionLineList`

- Summary: List the lines of a version
- Roles (403): Only Finance and the spending approver read the versions of a budget.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-versions/{id}/lines` — `budgetVersionLineAdd`

- Summary: Add lines to a version being built
- Roles (403): Only Finance builds the versions of a budget.
- Params: path:id*(string:uuid)
- Body: `AddLinesBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `lines` | array<object> | yes | minItems=1 maxItems=200 |  |
| `lines[].description` | string | yes | minLength=1 maxLength=200 |  |
| `lines[].planId` | string:uuid |  |  |  |
| `lines[].seats` | integer |  | minimum=1 maximum=100000 |  |
| `lines[].amount` | object | yes |  |  |
| `lines[].amount.amount` | string | yes | maxLength=40 |  |
| `lines[].amount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `lines[].windowFrom` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].windowTo` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].servicePeriodMonths` | integer |  | minimum=1 maximum=120 |  |
| `lines[].repeatCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/ONE_TIME) |  |  |  |
| `lines[].quoteValidUntil` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `lines[].note` | string |  | minLength=1 maxLength=1000 |  |

### PUT `/api/v1/budget-versions/{id}/lines/{position}` — `budgetVersionLineUpdate`

- Summary: Comment on and adjust a line of a version
- Roles (403): Only Finance builds the versions of a budget.
- Params: path:id*(string:uuid), path:position*(integer minimum=0 maximum=9007199254740991)
- Body: `LinePatchDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `description` | string |  | minLength=1 maxLength=200 |  |
| `planId` | string:uuid |  | nullable |  |
| `seats` | integer |  | minimum=1 maximum=100000 nullable |  |
| `amount` | object |  |  |  |
| `amount.amount` | string | yes | maxLength=40 |  |
| `amount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `windowFrom` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `windowTo` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `servicePeriodMonths` | integer |  | minimum=1 maximum=120 |  |
| `repeatCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/ONE_TIME) |  |  |  |
| `quoteValidUntil` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `financeComment` | string |  | minLength=1 maxLength=1000 nullable |  |
| `adjustmentReason` | string |  | minLength=1 maxLength=1000 nullable |  |

### PUT `/api/v1/budget-versions/{id}/lines/{position}/window` — `budgetVersionLineWindow`

- Summary: Move the purchase window of a line of the current budget
- Roles (403): Only Finance builds the versions of a budget.
- Params: path:id*(string:uuid), path:position*(integer minimum=0 maximum=9007199254740991)
- Body: `WindowBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `windowFrom` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `windowTo` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `amount` | object |  |  |  |
| `amount.amount` | string | yes | maxLength=40 |  |
| `amount.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### GET `/api/v1/budget-versions/{id}/lines/{position}/changes` — `budgetVersionLineChangeList`

- Summary: List the moves of the window of a line
- Roles (403): Only Finance and the spending approver read the versions of a budget.
- Params: path:id*(string:uuid), path:position*(integer minimum=0 maximum=9007199254740991), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-versions/{id}/imports` — `budgetVersionImport`

- Summary: Load lines into a version from a file
- Roles (403): Only Finance builds the versions of a budget.
- Params: path:id*(string:uuid)
- Body: `inline` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `file` | string:binary | yes |  |  |

## budgets

### GET `/api/v1/budgets/mine` — `budgetMine`

- Summary: Get the budget of my department
- Roles (403): The caller heads no department (BUDGET.NOT_YOUR_COST_CENTER).
- Params: query:year*(integer minimum=2000 maximum=2200)

### GET `/api/v1/budgets/mine/lines` — `budgetMineLineList`

- Summary: List the lines of the budget of my department
- Roles (403): The caller heads no department (BUDGET.NOT_YOUR_COST_CENTER).
- Params: query:year*(integer minimum=2000 maximum=2200), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/budgets/mine/versions` — `budgetMineVersionList`

- Summary: List sent versions for the cost center
- Roles (403): The caller heads no department (BUDGET.NOT_YOUR_COST_CENTER).
- Params: query:year(integer minimum=2000 maximum=2200), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/budgets` — `budgetTable`

- Summary: List the current budgets of all Cost Centers
- Roles (403): Only Finance reads the budgets of the company.
- Params: query:year(integer minimum=2000 maximum=2200), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-versions/{id}/attachments` — `budgetVersionAttachmentDeclare`

- Summary: Declare a document to attach to a budget version
- Roles (403): Only Finance attaches documents to a version.
- Params: path:id*(string:uuid)
- Body: `CreateBudgetAttachmentDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `fileName` | string | yes | minLength=1 maxLength=400 |  |
| `contentType` | string | yes | minLength=1 maxLength=100 |  |
| `sizeBytes` | integer | yes | minimum=0 maximum=1000000000 |  |

### GET `/api/v1/budget-versions/{id}/attachments` — `budgetVersionAttachmentList`

- Summary: List the attachments of a budget version
- Roles (403): You cannot read the attachments of budget versions.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-proposals/attachments` — `budgetProposalAttachmentDeclare`

- Summary: Declare a document to attach to a budget proposal
- Roles (403): Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).
- Body: `CreateBudgetAttachmentDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `fileName` | string | yes | minLength=1 maxLength=400 |  |
| `contentType` | string | yes | minLength=1 maxLength=100 |  |
| `sizeBytes` | integer | yes | minimum=0 maximum=1000000000 |  |

### POST `/api/v1/budget-attachments/{id}/complete` — `budgetAttachmentComplete`

- Summary: Complete the upload of a budget document
- Roles (403): You do not hold the required role for this attachment.
- Params: path:id*(string:uuid)

### POST `/api/v1/budget-versions/{id}/attachments/{attachmentId}/removal` — `budgetVersionAttachmentRemove`

- Summary: Remove a document from a version
- Roles (403): Only Finance removes documents from a version.
- Params: path:id*(string:uuid), path:attachmentId*(string:uuid)

### POST `/api/v1/budget-attachments/{id}/discard` — `budgetAttachmentDiscard`

- Summary: Discard an unattached upload
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/budget-proposals/{id}/attachments` — `budgetProposalAttachmentList`

- Summary: List the attachments of a budget proposal
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/budget-attachments/{id}/links` — `budgetAttachmentLink`

- Summary: Issue a download link for an attachment
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/budget-attachments/mine` — `budgetAttachmentMineList`

- Summary: List unattached uploads declared by the caller
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## contracts

### POST `/api/v1/contracts` — `contractCreate`

- Summary: Make a contract
- Roles (403): Only an IT Admin makes a contract.
- Body: `CreateContractBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=200 default="" |  |

### GET `/api/v1/contracts/{id}` — `contractGet`

- Summary: Get a contract
- Roles (403): Only the IT Admin and Finance read a contract.
- Params: path:id*(string:uuid)

## controlled-waits

### GET `/api/v1/controlled-waits` — `controlledWaitList`

- Summary: List the steps that wait for somebody valid
- Roles (403): Only the Super Admin and an IT Admin read the queue (AUTHORIZATION.FORBIDDEN).
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## cost-centers

### GET `/api/v1/cost-centers` — `costCenterList`

- Summary: List cost centers
- Roles (403): Only Finance and the Super Admin read the Cost Center catalogue.
- Params: query:status(enum(ACTIVE|INACTIVE)), query:kind(enum(UNIT)), query:search(string maxLength=100), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/cost-centers` — `costCenterCreate`

- Summary: Add a cost center
- Roles (403): Only Finance maintains the Cost Center catalogue (the IT Admin and the Super Admin do not).
- Body: `CreateCostCenterBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `code` | string | yes | minLength=1 maxLength=50 pattern="^[A-Za-z0-9][A-Za-z0-9._-]*$" |  |
| `name` | string | yes | maxLength=1000 |  |
| `kind` | string | yes | maxLength=40 |  |
| `departmentId` | string:uuid | yes |  |  |

### PATCH `/api/v1/cost-centers/{id}` — `costCenterRename`

- Summary: Rename a cost center
- Roles (403): Only Finance maintains the Cost Center catalogue (the IT Admin and the Super Admin do not).
- Params: path:id*(string:uuid)
- Body: `RenameCostCenterBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | maxLength=1000 |  |

### POST `/api/v1/cost-centers/{id}/deactivate` — `costCenterDeactivate`

- Summary: Retire a cost center
- Roles (403): Only Finance maintains the Cost Center catalogue (the IT Admin and the Super Admin do not).
- Params: path:id*(string:uuid)

### GET `/api/v1/cost-centers/{id}/employees` — `costCenterEmployeeList`

- Summary: List the people in a cost center
- Roles (403): Only Finance reads the people in a cost center (the IT Admin and the Super Admin do not).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## currencies

### GET `/api/v1/currencies` — `currencyList`

- Summary: List supported currencies
- Roles (403): Only Finance and the IT Admin read the currency list.

## dashboards

### GET `/api/v1/dashboards/employee` — `employeeDashboardGet`

- Summary: Read my overview as an Employee
- Roles (403): (no 403 — any authenticated or public)

### GET `/api/v1/dashboards/manager` — `managerDashboardGet`

- Summary: Read my overview as a department head
- Roles (403): The caller is not a department head on the business day; other roles read their own overview.

### GET `/api/v1/dashboards/it-admin` — `itAdminDashboardGet`

- Summary: Read my overview as an IT Admin
- Roles (403): The caller does not hold the IT Admin role; other roles read their own overview.

### GET `/api/v1/dashboards/super-admin` — `superAdminDashboardGet`

- Summary: Read my overview as the Super Admin
- Roles (403): The caller does not hold the Super Admin role; other roles read their own overview.

## delegated-requests

### POST `/api/v1/delegated-requests` — `delegatedRequestSend`

- Summary: Send requests for people of the department
- Roles (403): The caller does not head the department (DELEGATED_REQUEST.NOT_HEAD), or is the Super Admin, who sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `DelegatedBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `beneficiaryEmployeeIds` | array<string:uuid> | yes | minItems=1 maxItems=50 |  |
| `items` | array<object> | yes | minItems=1 maxItems=50 | Each tool is named once: no two items carry the same planId. |
| `items[].planId` | string:uuid | yes |  |  |
| `items[].expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedEndDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `termConfirmation` | object |  |  |  |
| `termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |

### GET `/api/v1/grant-queue` — `grantQueueList`

- Summary: List the requests waiting to be carried out
- Roles (403): Only the IT Admin reads what waits to be carried out.
- Params: query:beneficiaryEmployeeId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## department-transfers

### POST `/api/v1/department-transfers` — `departmentTransferRecord`

- Summary: Record a transfer of a person
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a transfer about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Body: `RecordTransferBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `toDepartmentId` | string:uuid | yes |  |  |
| `effectiveOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |
| `successor` | object / object |  |  |  |
| `successor{variant1:}.kind` | enum(EMPLOYEE) | yes |  |  |
| `successor{variant1:}.employeeId` | string:uuid | yes |  |  |
| `successor{variant2:}.kind` | enum(NONE) | yes |  |  |

### GET `/api/v1/department-transfers` — `departmentTransferList`

- Summary: List transfers of people
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN).
- Params: query:employeeId(string:uuid), query:status(enum(PENDING|EFFECTIVE|CANCELLED)), query:effectiveFrom(string:date), query:effectiveTo(string:date), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/department-transfers/{id}` — `departmentTransferGet`

- Summary: Read a transfer
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)

### GET `/api/v1/department-transfers/{id}/changes` — `departmentTransferChangeList`

- Summary: List the moves of a transfer
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/department-transfers/{id}/rescheduling` — `departmentTransferReschedule`

- Summary: Move the day of a waiting transfer
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a transfer about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `RescheduleTransferBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `newEffectiveOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `reason` | string |  | maxLength=1000 |  |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |
| `successor` | object / object |  |  |  |
| `successor{variant1:}.kind` | enum(EMPLOYEE) | yes |  |  |
| `successor{variant1:}.employeeId` | string:uuid | yes |  |  |
| `successor{variant2:}.kind` | enum(NONE) | yes |  |  |

### POST `/api/v1/department-transfers/{id}/cancellation` — `departmentTransferCancel`

- Summary: Cancel a waiting transfer
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a transfer about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `CancelTransferBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string |  | maxLength=1000 |  |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |

### POST `/api/v1/department-transfers/{id}/closure` — `departmentTransferClose`

- Summary: Close a transfer that has taken effect
- Roles (403): Only the Super Admin records, moves or cancels a transfer, and reads it in full; the IT Admin reads a minimal projection and closes it (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)

## departments

### GET `/api/v1/departments` — `departmentList`

- Summary: List departments
- Roles (403): Only the Super Admin and the IT Admin list departments; the IT Admin sees only the departments they are in charge of or stand in for.
- Params: query:status(enum(ACTIVE|INACTIVE)), query:search(string maxLength=100), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/departments` — `departmentCreate`

- Summary: Create a department
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Body: `CreateDepartmentBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `code` | string | yes | minLength=2 maxLength=20 pattern="^[A-Z0-9]+(-[A-Z0-9]+)*$" | 2 to 20 ASCII letters or digits in hyphen-separated groups; lowercase is accepted and converted to uppercase, e.g. p-eng becomes P-ENG. |
| `name` | string | yes | maxLength=200 |  |
| `function` | string |  | maxLength=1000 nullable |  |
| `itAdminEmployeeId` | string:uuid |  | nullable |  |

### GET `/api/v1/departments/{id}` — `departmentGet`

- Summary: Get a department profile
- Roles (403): A department head asking about a department that is not theirs (DEPARTMENT.OUT_OF_SCOPE), or a role that reads none.
- Params: path:id*(string:uuid)

### PATCH `/api/v1/departments/{id}` — `departmentUpdate`

- Summary: Update a department profile
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Params: path:id*(string:uuid)
- Body: `UpdateDepartmentBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=200 |  |
| `function` | string |  | maxLength=1000 nullable |  |
| `itAdminEmployeeId` | string:uuid |  | nullable |  |

### POST `/api/v1/departments/{id}/deactivate` — `departmentDeactivate`

- Summary: Retire a department
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Params: path:id*(string:uuid)
- Body: `DeactivateDepartmentBodyDto` (required)


### GET `/api/v1/departments/{id}/employees` — `departmentMemberList`

- Summary: List the members of a department
- Roles (403): A department head asking about a department that is not theirs, or a role that reads none.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/departments/{id}/technical-members` — `departmentTechnicalMemberList`

- Summary: List the people of a department for a technical task
- Roles (403): Only an IT Admin reads this.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/department-warnings` — `departmentWarningList`

- Summary: List department warnings
- Roles (403): Only the Super Admin and the IT Admin see department warnings.
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/departments/{id}/head-assignments` — `departmentHeadAssign`

- Summary: Name the head of a department
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Params: path:id*(string:uuid)
- Body: `AssignHeadBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `effectiveFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/departments/{id}/head-vacancies` — `departmentHeadVacate`

- Summary: Leave a department without a head
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Params: path:id*(string:uuid)
- Body: `VacateHeadBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `effectiveFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/departments/{id}/successor-designations` — `departmentSuccessorDesignate`

- Summary: Name who is to follow the head of a department
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Params: path:id*(string:uuid)
- Body: `DesignateSuccessorBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `effectiveFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/departments/{id}/successor-clearances` — `departmentSuccessorClear`

- Summary: Take back the successor named for the head
- Roles (403): Only the Super Admin changes department data. The IT Admin does not.
- Params: path:id*(string:uuid)
- Body: `ClearSuccessorBodyDto` (required)


### GET `/api/v1/departments/{id}/tools-in-use` — `departmentToolsInUse`

- Summary: List the tools a department uses
- Roles (403): Not an IT Admin, or a department head asking about a department that is not theirs (DEPARTMENT.OUT_OF_SCOPE).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=50)

## documents

### POST `/api/v1/documents` — `documentCreate`

- Summary: Declare a file and get the link to upload it
- Roles (403): Not the IT Admin or Finance, or the role may not choose this purpose (DOCUMENT.PURPOSE_FORBIDDEN).
- Body: `CreateDocumentBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `fileName` | string | yes | minLength=1 maxLength=400 |  |
| `contentType` | string | yes | minLength=1 maxLength=100 |  |
| `sizeBytes` | integer | yes | minimum=0 maximum=1000000000 |  |
| `purpose` | enum(CONTRACT_ATTACHMENT/PURCHASE_DOCUMENT/TAX_PAYMENT_PROOF/SIGNATURE_RECORD/IMPORT_SOURCE/COST_STATEMENT) | yes |  |  |

### POST `/api/v1/documents/{id}/complete` — `documentComplete`

- Summary: Say the file is uploaded, for the system to look at it
- Roles (403): Only the IT Admin and Finance keep and open files: the department head, an employee, the spending approver and the Super Admin are refused.
- Params: path:id*(string:uuid)

### POST `/api/v1/documents/{id}/attach` — `documentAttach`

- Summary: Attach an uploaded file to a contract
- Roles (403): Only the IT Admin and Finance keep and open files: the department head, an employee, the spending approver and the Super Admin are refused.
- Params: path:id*(string:uuid)
- Body: `AttachDocumentBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `contractId` | string:uuid | yes |  |  |

### GET `/api/v1/documents/{id}` — `documentGet`

- Summary: Get what is known of a file
- Roles (403): Only the IT Admin and Finance keep and open files: the department head, an employee, the spending approver and the Super Admin are refused.
- Params: path:id*(string:uuid)

### POST `/api/v1/documents/{id}/links` — `documentLink`

- Summary: Get a link that opens a file for five minutes
- Roles (403): Only the IT Admin and Finance keep and open files: the department head, an employee, the spending approver and the Super Admin are refused.
- Params: path:id*(string:uuid)

## employee-imports

### POST `/api/v1/employee-imports` — `employeeImportUpload`

- Summary: Upload an employee file for preview
- Roles (403): Only the Super Admin imports people.
- Body: `inline` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `file` | string:binary | yes |  |  |

### GET `/api/v1/employee-imports/{id}` — `employeeImportGet`

- Summary: Get an employee import
- Roles (403): Only the Super Admin reads an employee import and its rows.
- Params: path:id*(string:uuid)

### GET `/api/v1/employee-imports/{id}/rows` — `employeeImportRowList`

- Summary: List the rows of an employee import
- Roles (403): Only the Super Admin reads an employee import and its rows.
- Params: path:id*(string:uuid), query:outcome(enum(VALID|ERROR|EXISTS_SAME|EXISTS_DIFFERENT)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=200 default=50)

### POST `/api/v1/employee-imports/{id}/preview-refreshes` — `employeeImportPreviewRefresh`

- Summary: Check an employee import again
- Roles (403): Only the Super Admin imports people.
- Params: path:id*(string:uuid)

### POST `/api/v1/employee-imports/{id}/confirmations` — `employeeImportConfirm`

- Summary: Confirm an employee import
- Roles (403): Only the Super Admin imports people.
- Params: path:id*(string:uuid)
- Body: `ConfirmImportBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `previewVersion` | integer | yes | minimum=0 maximum=9007199254740991 |  |
| `idempotencyKey` | string | yes | minLength=8 maxLength=100 |  |
| `acknowledgeDuplicateFile` | boolean |  | default=false |  |

### POST `/api/v1/employee-imports/{id}/cancellations` — `employeeImportCancel`

- Summary: Cancel an employee import
- Roles (403): Only the Super Admin imports people.
- Params: path:id*(string:uuid)

## employees

### POST `/api/v1/employees/{id}/first-placements` — `employeeFirstPlacement`

- Summary: Place an employee for the first time
- Roles (403): Only SUPER_ADMIN may place employees.
- Params: path:id*(string:uuid)
- Body: `FirstPlacementBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `departmentId` | string:uuid | yes |  |  |
| `effectiveFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/employees` — `employeeCreate`

- Summary: Enter one employee by hand
- Roles (403): Only the Super Admin may enter people.
- Body: `CreateEmployeeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeCode` | string | yes | minLength=3 maxLength=20 pattern="^[A-Z0-9]+(-[A-Z0-9]+)*$" | 3 to 20 ASCII letters or digits in hyphen-separated groups; lowercase is accepted and converted to uppercase, e.g. nv-0001 becomes NV-0001. |
| `fullName` | string | yes | minLength=1 maxLength=200 |  |
| `workEmail` | string:email |  | maxLength=254 nullable | An email address; surrounding whitespace is trimmed before it is checked. The part before any +tag must not be empty: an address that cannot be normalized for matching is refused. |
| `employmentType` | enum(STAFF/CONTRACTOR/FREELANCER/INTERN) | yes |  |  |
| `hireDate` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `departmentCode` | string |  | minLength=2 maxLength=20 pattern="^[A-Z0-9]+(-[A-Z0-9]+)*$" nullable | 2 to 20 ASCII letters or digits in hyphen-separated groups; lowercase is accepted and converted to uppercase, e.g. p-eng becomes P-ENG; null or omitted for unplaced. |
| `jobTitle` | string |  | maxLength=1000 nullable |  |

### GET `/api/v1/employees` — `employeeList`

- Summary: List company-wide employee directory
- Roles (403): Only the Super Admin reads the company-wide employee directory.
- Params: query:q(string maxLength=100), query:departmentId(string:uuid), query:unplaced(enum(true|false)), query:workState(enum(WORKING|ON_LONG_LEAVE|HANDING_OVER|LEFT)), query:employmentType(enum(STAFF|CONTRACTOR|FREELANCER|INTERN)), query:hasAccount(enum(true|false)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/employees/{id}` — `employeeGet`

- Summary: Get employee profile and placement history
- Roles (403): Only the Super Admin reads the company-wide employee directory.
- Params: path:id*(string:uuid)

### PATCH `/api/v1/employees/{id}` — `employeeUpdateOfficialFields`

- Summary: Correct the official fields of an employee
- Roles (403): Only the Super Admin corrects these fields, and not their own record (EMPLOYEE.SELF_CHANGE_FORBIDDEN: that goes through the controlled procedure outside the application).
- Params: path:id*(string:uuid)
- Body: `UpdateEmployeeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `fullName` | string |  | minLength=1 maxLength=200 |  |
| `workEmail` | string:email |  | maxLength=254 nullable | An email address; surrounding whitespace is trimmed before it is checked. The part before any +tag must not be empty: an address that cannot be normalized for matching is refused. |
| `employmentType` | enum(STAFF/CONTRACTOR/FREELANCER/INTERN) |  |  |  |
| `hireDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `jobTitle` | string |  | maxLength=1000 nullable |  |

## exchange-rates

### GET `/api/v1/exchange-rates` — `exchangeRateList`

- Summary: List exchange rates
- Roles (403): Only Finance and the IT Admin read exchange rates.
- Params: query:currency(string pattern="^[A-Z]{3}$"), query:from(string:date), query:to(string:date), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/exchange-rates` — `exchangeRateRecord`

- Summary: Record an exchange rate
- Roles (403): Only Finance records exchange rates.
- Body: `RecordExchangeRateBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `rateDate` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `rate` | string | yes | maxLength=40 |  |

## finance-reviews

### GET `/api/v1/finance-reviews` — `financeReviewList`

- Summary: List the reviews waiting for Finance
- Roles (403): Only Finance reviews (SPEND.NOT_FINANCE).
- Params: query:state(enum(PENDING|WAITING)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/access-requests/{id}/finance-review` — `financeReviewGet`

- Summary: Get the review of Finance of a request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### POST `/api/v1/access-requests/{id}/finance-review` — `financeReviewComplete`

- Summary: End the review of a request
- Roles (403): Only Finance ends a review (the guard), nobody else but the person who holds it (SPEND.NOT_FINANCE), and not the one who asked for the request or is given it (SPEND.OWN_REQUEST): nobody independent would review it.
- Params: path:id*(string:uuid)
- Body: `ReviewBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `outcome` | enum(ASSESSED/RETURN_TO_HEAD/NEEDS_BUDGET) | yes |  |  |
| `opinion` | string |  | minLength=1 maxLength=2000 |  |
| `direction` | enum(RECOMMEND_APPROVE/RECOMMEND_OVERRIDE/RECOMMEND_REJECT) |  |  |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### GET `/api/v1/access-requests/{id}/budget-check` — `budgetCheckGet`

- Summary: Get the check of the budget of a request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/access-requests/{id}/budget-check/years` — `budgetCheckYearList`

- Summary: List the years of the check of a request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## functional-groups

### GET `/api/v1/functional-groups` — `functionalGroupList`

- Summary: List functional groups
- Roles (403): Only the IT Admin and Finance read functional groups.
- Params: query:status(enum(ACTIVE|INACTIVE)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/functional-groups` — `functionalGroupCreate`

- Summary: Create a functional group
- Roles (403): Only an IT Admin changes functional groups.
- Body: `CreateFunctionalGroupBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | maxLength=1000 |  |

### PATCH `/api/v1/functional-groups/{id}` — `functionalGroupUpdate`

- Summary: Rename or switch a functional group
- Roles (403): Only an IT Admin changes functional groups.
- Params: path:id*(string:uuid)
- Body: `UpdateFunctionalGroupBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=1000 |  |
| `status` | enum(ACTIVE/INACTIVE) |  |  |  |

## group-requests

### POST `/api/v1/group-requests/check` — `groupRequestCheck`

- Summary: Check a request for a group before sending it
- Roles (403): (no 403 — any authenticated or public)
- Body: `GroupBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |
| `lines` | array<object> | yes | minItems=1 maxItems=1000 |  |
| `lines[].employeeId` | string:uuid | yes |  |  |
| `lines[].expectedEndDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `termConfirmation` | object |  |  |  |
| `termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/group-requests` — `groupRequestSubmit`

- Summary: Send a request for a group of people
- Roles (403): The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).
- Body: `GroupBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |
| `lines` | array<object> | yes | minItems=1 maxItems=1000 |  |
| `lines[].employeeId` | string:uuid | yes |  |  |
| `lines[].expectedEndDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `businessReason` | string | yes | minLength=1 maxLength=1000 |  |
| `termMonths` | integer | yes | minimum=1 maximum=120 |  |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `termConfirmation` | object |  |  |  |
| `termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |

### GET `/api/v1/group-request-candidates` — `groupRequestCandidateList`

- Summary: List the people who may be named in a group
- Roles (403): (no 403 — any authenticated or public)
- Params: query:q(string minLength=1 maxLength=100), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/access-requests/{id}/lines` — `accessRequestLineList`

- Summary: List the people of a request for a group
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/access-requests/{id}/line-need-decisions` — `accessRequestLineNeedDecide`

- Summary: Decide the need of the people of a step
- Roles (403): The caller asked for the request or is one of the people of the step (ACCESS_REQUEST.OWN_REQUEST), or does not hold the step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).
- Params: path:id*(string:uuid)
- Body: `LineNeedDecisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `lines` | array<object> | yes | minItems=1 maxItems=100 |  |
| `lines[].employeeId` | string:uuid | yes |  |  |
| `lines[].decision` | enum(APPROVE/REJECT) | yes |  |  |
| `lines[].reason` | string |  | minLength=1 maxLength=1000 |  |
| `termConfirmation` | object |  |  |  |
| `termConfirmation.reason` | string | yes | minLength=1 maxLength=1000 |  |
| `spend` | object |  |  | Choose exactly one: a line of the plan of the budget (planLine), or that the spend is outside it (offPlan: true). |
| `spend.planLine` | object |  |  |  |
| `spend.planLine.position` | integer | yes | minimum=1 maximum=9007199254740991 |  |
| `spend.planLine.stillNeeded` | boolean |  |  |  |
| `spend.offPlan` | enum(true) |  |  |  |
| `spend.expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/access-requests/{id}/line-spend-decisions` — `spendApprovalLineDecide`

- Summary: Decide the spend of the people of a request
- Roles (403): The caller does not hold the step (SPEND.NOT_THE_ASSIGNEE) or asked for the request or is one of its people (SPEND.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `LineSpendDecisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `lines` | array<object> | yes | minItems=1 maxItems=100 |  |
| `lines[].employeeId` | string:uuid | yes |  |  |
| `lines[].decision` | enum(APPROVE/REJECT) | yes |  |  |
| `lines[].reason` | string |  | minLength=1 maxLength=1000 |  |
| `override` | object |  |  |  |
| `override.reason` | string | yes | minLength=1 maxLength=1000 |  |
| `override.years` | array<integer> | yes | minItems=1 maxItems=20 |  |

### POST `/api/v1/access-requests/{id}/lines/{employeeId}/withdraw` — `accessRequestLineWithdraw`

- Summary: Withdraw one person of a request for a group
- Roles (403): The caller is not the sender, the person withdrawn included, and not the head in a stage the head acts on (ACCESS_REQUEST.NOT_REQUESTER).
- Params: path:id*(string:uuid), path:employeeId*(string:uuid)
- Body: `LineWithdrawBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

### POST `/api/v1/access-requests/{id}/lines/{employeeId}/departure-closure` — `accessRequestLineCloseForDeparture`

- Summary: Remove a person who left or was transferred from a group request
- Roles (403): Only an IT Admin removes a person who left from a request for a group.
- Params: path:id*(string:uuid), path:employeeId*(string:uuid)
- Body: `LineClosureBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `cause` | enum(BENEFICIARY_LEFT/BENEFICIARY_TRANSFERRED) | yes |  |  |
| `note` | string |  | minLength=1 maxLength=1000 |  |
| `evidence` | string |  | minLength=1 maxLength=1000 |  |

## handover-duties

### GET `/api/v1/handover-duties` — `handoverDutyList`

- Summary: List the handover duties of the caller
- Roles (403): Only an IT Admin asks for scope all (HANDOVER_DUTY.SCOPE_FORBIDDEN).
- Params: query:scope(enum(mine|all) default="mine"), query:status(enum(OPEN|CONFIRMED|CANCELLED)), query:employeeId(string:uuid), query:overdue(enum(true|false)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/handover-duties/{id}` — `handoverDutyGet`

- Summary: Read a handover duty in full
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### POST `/api/v1/handover-duties/{id}/confirmations` — `handoverDutyConfirm`

- Summary: Confirm that the data of a tool was handed over
- Roles (403): The caller is not the person the duty falls to: another head, the head before a transfer, an IT Admin for the duty of a head, a stand-in approver, Finance, a spending approver or the Super Admin (HANDOVER_DUTY.NOT_CONFIRMER). Nothing is written.
- Params: path:id*(string:uuid)
- Body: `ConfirmHandoverBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `value` | enum(HANDED_OVER/NOT_NEEDED/HANDLED) | yes |  |  |

## health

### GET `/api/v1/health/live` — `healthGetLiveness`

- Summary: Check that the process is running
- Roles (403): (no 403 — any authenticated or public)

### GET `/api/v1/health/ready` — `healthGetReadiness`

- Summary: Check that the database is reachable
- Roles (403): (no 403 — any authenticated or public)

## license-assignments

### GET `/api/v1/license-assignments` — `licenseAssignmentList`

- Summary: List license assignments
- Roles (403): Only an IT Admin reads or changes the assignments of seats.
- Params: query:subscriptionId(string:uuid), query:planId(string:uuid), query:employeeId(string:uuid), query:source(enum(BASELINE|HANDOVER|REQUEST|RENEWAL_CARRY)), query:kind(enum(PERSONAL|SERVICE)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/license-assignments/{id}/responsible-changes` — `licenseAssignmentChangeResponsible`

- Summary: Change the person responsible for a service account
- Roles (403): Only an IT Admin reads or changes the assignments of seats.
- Params: path:id*(string:uuid)
- Body: `ResponsibleChangeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `effectiveFrom` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `expectedEndDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

## license-keys

### POST `/api/v1/license-keys/imports` — `licenseKeyImport`

- Summary: Import a batch of license keys into the vault of a K4 purchase
- Roles (403): Only an IT Admin works the vault of license keys.
- Body: `ImportBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `subscriptionId` | string:uuid | yes |  |  |
| `keys` | array<string> | yes | minItems=1 maxItems=1000 |  |

### GET `/api/v1/license-keys` — `licenseKeyList`

- Summary: List the license keys of a K4 purchase, masked
- Roles (403): Only an IT Admin works the vault of license keys.
- Params: query:subscriptionId*(string:uuid), query:status(enum(IN_STORE|ASSIGNED|RETIRED)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/license-keys/{id}/reveal` — `licenseKeyReveal`

- Summary: Reveal a license key in full
- Roles (403): Only an IT Admin works the vault of license keys.
- Params: path:id*(string:uuid)

## long-leaves

### POST `/api/v1/long-leaves` — `longLeaveStart`

- Summary: Record the start of a long leave
- Roles (403): Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a long leave about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Body: `StartLeaveBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `startedOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `approvedReturnOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |

### GET `/api/v1/long-leaves` — `longLeaveList`

- Summary: List long leaves
- Roles (403): Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN).
- Params: query:status(enum(ACTIVE|ENDED)), query:employeeId(string:uuid), query:overdueReturn(enum(true|false)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/long-leaves/{id}` — `longLeaveGet`

- Summary: Read a long leave
- Roles (403): Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)

### GET `/api/v1/long-leaves/{id}/changes` — `longLeaveChangeList`

- Summary: List what happened to a long leave
- Roles (403): Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/long-leaves/{id}/return-date-changes` — `longLeaveChangeReturnDate`

- Summary: Extend or change the day a person is due back
- Roles (403): Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a long leave about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `ChangeReturnDateBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `newApprovedReturnOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |

### POST `/api/v1/long-leaves/{id}/returns` — `longLeaveConfirmReturn`

- Summary: Record that a person is back
- Roles (403): Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a long leave about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `ConfirmReturnBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `returnedOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |

## me

### GET `/api/v1/me/departure-notice` — `meDepartureNoticeGet`

- Summary: Read my own departure
- Roles (403): (no 403 — any authenticated or public)

### GET `/api/v1/me/software-rights` — `meSoftwareRightList`

- Summary: List the software rights I hold
- Roles (403): (no 403 — any authenticated or public)
- Params: query:view(enum(current|ended) default="current"), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/me/access-requests` — `meAccessRequestList`

- Summary: List the requests I sent
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20), query:view(enum(open|ended)), query:state(string maxLength=400), query:type(enum(GRANT|SERVICE_ACCOUNT|RENEWAL|GROUP_GRANT)), query:from(string:date-time), query:to(string:date-time)

### GET `/api/v1/me` — `meGet`

- Summary: Get the signed-in account
- Roles (403): (no 403 — any authenticated or public)

### POST `/api/v1/me/password` — `meChangePassword`

- Summary: Change my password
- Roles (403): (no 403 — any authenticated or public)
- Body: `ChangePasswordBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `currentPassword` | string | yes | minLength=1 maxLength=256 |  |
| `newPassword` | string | yes | minLength=1 maxLength=1024 |  |

## need-decisions

### GET `/api/v1/need-decisions` — `needDecisionList`

- Summary: List the requests waiting for my need decision
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20), query:type(enum(GRANT|SERVICE_ACCOUNT|RENEWAL|GROUP_GRANT))

## notifications

### GET `/api/v1/notifications` — `notificationList`

- Summary: List the notifications of the caller
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=50 default=20), query:unreadOnly(enum(true|false))

### GET `/api/v1/notifications/unread-count` — `notificationUnreadCount`

- Summary: Count the unread notifications of the caller
- Roles (403): (no 403 — any authenticated or public)

### POST `/api/v1/notifications/read-all` — `notificationMarkAllRead`

- Summary: Mark every notification of the caller as read
- Roles (403): (no 403 — any authenticated or public)

### POST `/api/v1/notifications/{id}/read` — `notificationMarkRead`

- Summary: Mark one notification as read
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

## offboarding-cases

### POST `/api/v1/offboarding-cases` — `offboardingCaseRecord`

- Summary: Record a person who leaves
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a departure about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Body: `RecordOffboardingBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `lastWorkingDay` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `abrupt` | boolean |  | default=false |  |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |
| `successor` | object / object |  |  |  |
| `successor{variant1:}.kind` | enum(EMPLOYEE) | yes |  |  |
| `successor{variant1:}.employeeId` | string:uuid | yes |  |  |
| `successor{variant2:}.kind` | enum(NONE) | yes |  |  |
| `pendingTransferCancellation` | object |  |  |  |
| `pendingTransferCancellation.reason` | string | yes | maxLength=1000 |  |

### GET `/api/v1/offboarding-cases` — `offboardingCaseList`

- Summary: List the departures
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN).
- Params: query:employeeId(string:uuid), query:state(enum(HANDING_OVER|LEFT|CANCELLED)), query:pastLastDay(enum(true|false)), query:accountLockMissing(enum(true|false)), query:roleFlag(enum(SUPER_ADMIN_HOLDER|FINANCE|SPENDING_APPROVER|SUBSTITUTE_APPROVER|FALLBACK_APPROVER|IT_ADMIN_IN_CHARGE|DEPARTMENT_HEAD|WORKSPACE_OWNER)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/offboarding-cases/{id}` — `offboardingCaseGet`

- Summary: Read a departure in full
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)

### GET `/api/v1/offboarding-cases/{id}/rights` — `offboardingCaseRightList`

- Summary: List the rights the person still holds
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/offboarding-cases/{id}/changes` — `offboardingCaseChangeList`

- Summary: List what was done to a departure
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/offboarding-cases/{id}/last-day-changes` — `offboardingCaseChangeLastDay`

- Summary: Move the last working day of a handover
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a departure about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `ChangeLastDayBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `lastWorkingDay` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `reason` | string |  | maxLength=1000 |  |
| `successor` | object / object |  |  |  |
| `successor{variant1:}.kind` | enum(EMPLOYEE) | yes |  |  |
| `successor{variant1:}.employeeId` | string:uuid | yes |  |  |
| `successor{variant2:}.kind` | enum(NONE) | yes |  |  |

### POST `/api/v1/offboarding-cases/{id}/cancellation` — `offboardingCaseCancel`

- Summary: Cancel a handover
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a departure about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `CancelOffboardingBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string |  | maxLength=1000 |  |

### POST `/api/v1/offboarding-cases/{id}/departure` — `offboardingCaseMarkLeft`

- Summary: Record that the person has left
- Roles (403): Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN). The Super Admin does not record or change a departure about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.
- Params: path:id*(string:uuid)
- Body: `MarkLeftBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `departedOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `accountLock` | object |  |  |  |
| `accountLock.note` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/offboarding-cases/{id}/account-lock` — `offboardingCaseRecordAccountLock`

- Summary: Record the lock of the company account
- Roles (403): Only an IT Admin records the lock of the account, takes the rights away or closes a departure (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)
- Body: `RecordAccountLockBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `note` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/offboarding-cases/{id}/revocations` — `offboardingCaseOpenRevocations`

- Summary: Take the rights of the person away
- Roles (403): Only an IT Admin records the lock of the account, takes the rights away or closes a departure (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)
- Body: `OpenRevocationsBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `assignmentIds` | array<string:uuid> |  | minItems=1 maxItems=200 |  |
| `count` | integer | yes | minimum=0 maximum=1000 |  |
| `reason` | string |  | maxLength=1000 |  |
| `accountLock` | object |  |  |  |
| `accountLock.note` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/offboarding-cases/{id}/closure` — `offboardingCaseClose`

- Summary: Close a departure
- Roles (403): Only an IT Admin records the lock of the account, takes the rights away or closes a departure (AUTHORIZATION.FORBIDDEN).
- Params: path:id*(string:uuid)

### GET `/api/v1/offboarding-cases/{id}/open-requests` — `offboardingCaseOpenRequestList`

- Summary: List the requests still open for the person who leaves
- Roles (403): Only an IT Admin reads what is still open for a person who leaves.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/offboarding-cases/{id}/open-grant-tasks` — `offboardingCaseOpenGrantTaskList`

- Summary: List the grants still open for the person who leaves
- Roles (403): Only an IT Admin reads what is still open for a person who leaves.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## onboarding

### GET `/api/v1/onboarding-checklist` — `onboardingChecklistGet`

- Summary: Get the onboarding checklist
- Roles (403): Only the Super Admin and the IT Admin see the onboarding checklist.

## operating-parameters

### GET `/api/v1/operating-parameters` — `operatingParameterList`

- Summary: List operating parameters
- Roles (403): Only the Super Admin reads the operating parameters, their history and the non-working dates.

### PUT `/api/v1/operating-parameters/{key}` — `operatingParameterSet`

- Summary: Set an operating parameter
- Roles (403): Only the Super Admin configures the operating parameters.
- Params: path:key*(string pattern="^[A-Z][A-Z0-9_]{0,99}$")
- Body: `SetParameterBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `value` | ? | yes |  |  |

### GET `/api/v1/operating-parameters/{key}/history` — `operatingParameterHistory`

- Summary: Show the history of an operating parameter
- Roles (403): Only the Super Admin reads the operating parameters, their history and the non-working dates.
- Params: path:key*(string pattern="^[A-Z][A-Z0-9_]{0,99}$")

### GET `/api/v1/non-working-dates` — `nonWorkingDateList`

- Summary: List non-working dates
- Roles (403): Only the Super Admin reads the operating parameters, their history and the non-working dates.
- Params: query:from(string:date), query:to(string:date), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/non-working-dates` — `nonWorkingDateAdd`

- Summary: Add a non-working date
- Roles (403): Only the Super Admin configures the operating parameters.
- Body: `AddNonWorkingDateBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `date` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `reason` | string | yes | maxLength=1000 |  |

### PATCH `/api/v1/non-working-dates/{date}` — `nonWorkingDateRename`

- Summary: Rename a non-working date
- Roles (403): Only the Super Admin configures the operating parameters.
- Params: path:date*(string:date)
- Body: `RenameNonWorkingDateBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | maxLength=1000 |  |

### DELETE `/api/v1/non-working-dates/{date}` — `nonWorkingDateRemove`

- Summary: Remove a non-working date
- Roles (403): Only the Super Admin configures the operating parameters.
- Params: path:date*(string:date)

### GET `/api/v1/reporting-currency` — `reportingCurrencyGet`

- Summary: Get the reporting currency
- Roles (403): Only the Super Admin reads or sets the reporting currency.

### PUT `/api/v1/reporting-currency` — `reportingCurrencySet`

- Summary: Set the reporting currency
- Roles (403): Only the Super Admin reads or sets the reporting currency.
- Body: `SetReportingCurrencyBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `currency` | string | yes | pattern="^[A-Z]{3}$" |  |

## personnel-notices

### POST `/api/v1/personnel-notices` — `personnelNoticeSend`

- Summary: Send a notice of a change coming for a person
- Roles (403): The caller does not head a department, or does not head the department of the person (a notice of a transfer to their own department: the one it names) (PERSONNEL_NOTICE.NOT_DEPARTMENT_HEAD, KIND_NOT_ALLOWED). Nothing is saved.
- Body: `SendNoticeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `employeeId` | string:uuid | yes |  |  |
| `kind` | enum(DEPARTMENT_TRANSFER_OUT/DEPARTMENT_TRANSFER_IN/DEPARTURE/ABRUPT_DEPARTURE/LONG_LEAVE) | yes |  |  |
| `proposedOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `targetDepartmentId` | string:uuid |  |  |  |
| `note` | string |  | maxLength=500 |  |

### GET `/api/v1/personnel-notices` — `personnelNoticeList`

- Summary: List notices of changes coming for people
- Roles (403): The caller is neither the Super Admin, an IT Admin nor the head of a department.
- Params: query:status(enum(PENDING_VERIFICATION|RECORDED|REJECTED|WITHDRAWN)), query:kind(enum(DEPARTMENT_TRANSFER_OUT|DEPARTMENT_TRANSFER_IN|JOB_TITLE_CHANGE|DEPARTURE|ABRUPT_DEPARTURE|LONG_LEAVE)), query:employeeId(string:uuid), query:overdue(enum(true|false)), query:priority(enum(true|false)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/personnel-notices/{id}` — `personnelNoticeGet`

- Summary: Read a notice in full
- Roles (403): The caller is neither the Super Admin, an IT Admin nor the head of a department.
- Params: path:id*(string:uuid)

### POST `/api/v1/personnel-notices/{id}/withdrawal` — `personnelNoticeWithdraw`

- Summary: Withdraw a notice that waits
- Roles (403): The caller does not head a department.
- Params: path:id*(string:uuid)

### POST `/api/v1/personnel-notices/{id}/rejection` — `personnelNoticeReject`

- Summary: Reject a notice with a reason
- Roles (403): Only the Super Admin handles a notice (AUTHORIZATION.FORBIDDEN): a department head, Finance, an approver and the IT Admin are refused. The Super Admin does not handle a notice about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure records its event.
- Params: path:id*(string:uuid)
- Body: `RejectNoticeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |

### POST `/api/v1/personnel-notices/{id}/recording` — `personnelNoticeRecord`

- Summary: Verify a notice and record the event it announces
- Roles (403): Only the Super Admin handles a notice (AUTHORIZATION.FORBIDDEN): a department head, Finance, an approver and the IT Admin are refused. The Super Admin does not handle a notice about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure records its event.
- Params: path:id*(string:uuid)
- Body: `RecordNoticeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `verification` | object | yes |  |  |
| `verification.method` | enum(ATTACHED_DOCUMENT/EMAIL_FROM_ISSUER/DIRECT_CONTACT) | yes |  |  |
| `verification.reference` | string | yes | maxLength=300 |  |
| `grounds` | object |  |  |  |
| `grounds.type` | string |  | maxLength=100 nullable |  |
| `grounds.reference` | string |  | maxLength=200 nullable |  |
| `grounds.issuer` | string |  | maxLength=200 nullable |  |
| `grounds.issuedOn` | string |  | maxLength=10 nullable |  |
| `event` | object | yes |  |  |
| `event.toDepartmentId` | string:uuid |  |  |  |
| `event.effectiveOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `event.lastWorkingDay` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `event.successor` | object / object |  |  |  |
| `event.successor{variant1:}.kind` | enum(EMPLOYEE) | yes |  |  |
| `event.successor{variant1:}.employeeId` | string:uuid | yes |  |  |
| `event.successor{variant2:}.kind` | enum(NONE) | yes |  |  |
| `event.pendingTransferCancellation` | object |  |  |  |
| `event.pendingTransferCancellation.reason` | string | yes | minLength=1 maxLength=500 |  |
| `event.startedOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `event.approvedReturnOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

### POST `/api/v1/personnel-notices/{id}/linking` — `personnelNoticeLinkEvent`

- Summary: Tie a notice to an event that already exists
- Roles (403): Only the Super Admin handles a notice (AUTHORIZATION.FORBIDDEN): a department head, Finance, an approver and the IT Admin are refused. The Super Admin does not handle a notice about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure records its event.
- Params: path:id*(string:uuid)
- Body: `LinkNoticeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `eventId` | string:uuid | yes |  |  |
| `verification` | object | yes |  |  |
| `verification.method` | enum(ATTACHED_DOCUMENT/EMAIL_FROM_ISSUER/DIRECT_CONTACT) | yes |  |  |
| `verification.reference` | string | yes | maxLength=300 |  |

## plan-terms

### GET `/api/v1/plans/{id}/terms` — `planTermsGet`

- Summary: Get the terms of a plan
- Roles (403): Only the IT Admin and Finance read the terms of a plan.
- Params: path:id*(string:uuid)

### PUT `/api/v1/plans/{id}/terms` — `planTermsSet`

- Summary: Record the terms of a plan
- Roles (403): Only an IT Admin records the terms of a plan.
- Params: path:id*(string:uuid)
- Body: `PlanTermsBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `termsUrl` | string |  | maxLength=10000 nullable |  |
| `lastReviewedOn` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `aiTraining` | string |  | maxLength=10000 nullable |  |
| `dataLocation` | string |  | maxLength=10000 nullable |  |
| `installLimit` | object |  | nullable |  |
| `installLimit.maxDevicesPerKey` | integer |  | minimum=1 maximum=1000000 nullable |  |
| `installLimit.note` | string |  | maxLength=10000 nullable |  |
| `commercialUse` | string |  | maxLength=10000 nullable |  |
| `cancellationRefund` | string |  | maxLength=10000 nullable |  |

### GET `/api/v1/plans/{id}/term-opinions` — `planTermOpinionList`

- Summary: List the opinions on the terms of a plan
- Roles (403): Only the IT Admin and Finance read the opinions.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/plans/{id}/term-opinions` — `planTermOpinionRecord`

- Summary: Record an opinion of the Business Owner on the terms
- Roles (403): Only an IT Admin records the terms of a plan.
- Params: path:id*(string:uuid)
- Body: `OpinionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `opinion` | string | yes | maxLength=10000 |  |

### GET `/api/v1/plan-warnings` — `planWarningList`

- Summary: List the terms that need a new review
- Roles (403): Only an IT Admin reads the review alerts.
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## plans

### GET `/api/v1/plans` — `planList`

- Summary: List plans
- Roles (403): Only the IT Admin and Finance read plans.
- Params: query:applicationId(string:uuid), query:provisioningType(enum(K1|K2|K3|K4|K5)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/plans` — `planCreate`

- Summary: Declare a plan
- Roles (403): Only an IT Admin declares or changes plans.
- Body: `DeclarePlanBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `applicationId` | string:uuid | yes |  |  |
| `name` | string | yes | maxLength=1000 |  |
| `provisioningType` | enum(K1/K2/K3/K4/K5) | yes |  |  |
| `pricingModel` | enum(PER_SEAT/FLAT_RATE/CONCURRENT/CONSUMPTION/PER_HOST) |  |  |  |
| `controlLevel` | enum(FULL/PARTIAL/UNCONTROLLABLE) |  |  |  |
| `revocationNote` | string |  | maxLength=5000 nullable |  |
| `dataLossOnRemoval` | boolean |  |  |  |
| `sharingPolicy` | enum(ALLOWED/NOT_ALLOWED) |  |  |  |

### GET `/api/v1/plans/{id}` — `planGet`

- Summary: Get a plan
- Roles (403): Only the IT Admin and Finance read plans.
- Params: path:id*(string:uuid)

### PATCH `/api/v1/plans/{id}` — `planUpdate`

- Summary: Update a plan
- Roles (403): Only an IT Admin declares or changes plans.
- Params: path:id*(string:uuid)
- Body: `UpdatePlanBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=1000 |  |
| `provisioningType` | enum(K1/K2/K3/K4/K5) |  |  |  |
| `pricingModel` | enum(PER_SEAT/FLAT_RATE/CONCURRENT/CONSUMPTION/PER_HOST/) |  | nullable |  |
| `controlLevel` | enum(FULL/PARTIAL/UNCONTROLLABLE/) |  | nullable |  |
| `revocationNote` | string |  | maxLength=5000 nullable |  |
| `dataLossOnRemoval` | boolean |  |  |  |
| `sharingPolicy` | enum(ALLOWED/NOT_ALLOWED/) |  | nullable |  |

### PUT `/api/v1/plans/{id}/workspace-profile` — `planWorkspaceProfileSet`

- Summary: Record the workspace profile of a K2 plan
- Roles (403): Only an IT Admin declares or changes plans.
- Params: path:id*(string:uuid)
- Body: `WorkspaceProfileBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `primaryOwnerEmployeeId` | string:uuid | yes |  |  |
| `members` | array<object> | yes | minItems=1 maxItems=100 |  |
| `members[].employeeId` | string:uuid | yes |  |  |
| `members[].role` | enum(OWNER/ADMIN) | yes |  |  |
| `ownerLimit` | integer |  | minimum=1 maximum=1000 nullable |  |
| `adminLimit` | integer |  | minimum=1 maximum=1000 nullable |  |
| `ownerTransferProcedure` | string |  | maxLength=5000 nullable |  |
| `emergencyAccount` | object |  | nullable |  |
| `emergencyAccount.identity` | string | yes | maxLength=1000 |  |
| `emergencyAccount.occupiesSeat` | boolean | yes |  |  |
| `emergencyAccount.holderEmployeeId` | string:uuid | yes |  |  |
| `emergencyAccount.lastReviewedOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |

## provisioning-tasks

### POST `/api/v1/provisioning-tasks` — `provisioningTaskGrant`

- Summary: Grant a seat to the beneficiary of a request
- Roles (403): Only an IT Admin works the queue of provisioning tasks, and an IT Admin who answers for the service account themselves waits for another usable IT Admin to grant it (PROVISIONING.ANOTHER_IT_ADMIN_NEEDED); with none left they may.
- Body: `GrantBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `requestId` | string:uuid | yes |  |  |
| `subscriptionId` | string:uuid |  |  |  |
| `accountIdentifier` | string |  | maxLength=254 |  |
| `expectedEndDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `responsibleEmployeeId` | string:uuid |  |  |  |
| `beneficiaryEmployeeId` | string:uuid |  |  |  |

### GET `/api/v1/provisioning-tasks` — `provisioningTaskList`

- Summary: List the provisioning queue
- Roles (403): Only an IT Admin works the queue of provisioning tasks.
- Params: query:channel(enum(MANUAL|CONNECTOR)), query:status(enum(QUEUED|RETRY_SCHEDULED|IN_PROGRESS|COMPLETED|FAILED|CLOSED_FAILED|CANCELLED)), query:scope(enum(ALL|MINE|GENERAL) default="ALL"), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/provisioning-tasks/{id}` — `provisioningTaskGet`

- Summary: Get the card of a provisioning task
- Roles (403): Only an IT Admin works the queue of provisioning tasks.
- Params: path:id*(string:uuid)

### POST `/api/v1/provisioning-tasks/{id}/claim` — `provisioningTaskClaim`

- Summary: Take a provisioning task to work on it
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)

### POST `/api/v1/provisioning-tasks/{id}/complete` — `provisioningTaskComplete`

- Summary: Complete a provisioning task with evidence
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)
- Body: `CompleteBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `evidence` | string |  | maxLength=2000 default="" |  |

### POST `/api/v1/provisioning-tasks/{id}/report-failure` — `provisioningTaskReportFailure`

- Summary: Record that a task could not be done
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)
- Body: `FailureBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string |  | maxLength=1000 default="" |  |

### POST `/api/v1/provisioning-tasks/{id}/retry` — `provisioningTaskRetry`

- Summary: Try a failed task again on its channel
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)

### POST `/api/v1/provisioning-tasks/{id}/hand-off` — `provisioningTaskHandOff`

- Summary: Hand a failed connector task to a person
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)
- Body: `HandOffBodyDto` (required)


### POST `/api/v1/provisioning-tasks/{id}/close-failed` — `provisioningTaskCloseFailed`

- Summary: Close a failed task as failed, with a reason
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)
- Body: `CloseFailedBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string |  | maxLength=1000 default="" |  |

### POST `/api/v1/provisioning-tasks/{id}/cancel` — `provisioningTaskCancel`

- Summary: Close the failed task of a withdrawn request as cancelled
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)

### POST `/api/v1/provisioning-tasks/{id}/revocation-completion` — `provisioningTaskCompleteRevocation`

- Summary: Complete a revocation the way its kind of grant says
- Roles (403): Only an IT Admin works the queue of provisioning tasks, and an IT Admin who is the person revoked waits for another usable IT Admin (PROVISIONING.ANOTHER_IT_ADMIN_NEEDED); with none left they may.
- Params: path:id*(string:uuid)
- Body: `RevocationCompletionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `completion` | enum(ACCOUNT_REMOVED/ALREADY_GONE/RENEWAL_CANCELLED/OFF_SYSTEM_REVOKED) | yes |  |  |
| `evidence` | string |  | maxLength=2000 default="" |  |
| `note` | string |  | maxLength=1000 |  |
| `paidThroughOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `accessState` | enum(CUT/UNTIL_PAID_END) |  |  |  |
| `accessCutOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `accessEvidence` | string |  | maxLength=2000 |  |

### POST `/api/v1/provisioning-tasks/{id}/access-cut` — `provisioningTaskRecordAccessCut`

- Summary: Cut the access of a terminating K1 seat before the paid period ends
- Roles (403): Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.
- Params: path:id*(string:uuid)
- Body: `AccessCutBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `accessCutOn` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `evidence` | string |  | maxLength=2000 default="" |  |

## requestable-software

### GET `/api/v1/requestable-applications` — `requestableApplicationList`

- Summary: List the software a person may request
- Roles (403): (no 403 — any authenticated or public)
- Params: query:search(string maxLength=100), query:kind(enum(SAAS|LICENSED|INTERNAL)), query:functionalGroupId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/requestable-applications/{id}` — `requestableApplicationGet`

- Summary: Get a piece of software a person may request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/requestable-plans` — `requestablePlanList`

- Summary: List the plans a person may request
- Roles (403): (no 403 — any authenticated or public)
- Params: query:search(string maxLength=100), query:kind(enum(SAAS|LICENSED|INTERNAL)), query:applicationId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/requestable-plans/{id}` — `requestablePlanGet`

- Summary: Get a plan a person may request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

## return-requests

### POST `/api/v1/return-requests` — `returnRequestSubmit`

- Summary: Return a seat, or confirm it is no longer needed
- Roles (403): The Super Admin cannot send a return (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST). The caller is neither the holder nor the head of the department of the holder (RETURN_REQUEST.NOT_HOLDER), or heads another department (RETURN_REQUEST.OUTSIDE_DEPARTMENT).
- Body: `ReturnBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `assignmentId` | string:uuid | yes |  |  |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |
| `fromRequestId` | string:uuid |  |  |  |

### GET `/api/v1/return-requests` — `returnRequestList`

- Summary: List the returns of seats the caller has a part in
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20), query:state(enum(AWAITING_REVOCATION|COMPLETED|FAILED)), query:assignmentId(string:uuid)

### GET `/api/v1/return-requests/{id}` — `returnRequestGet`

- Summary: Read one return of a seat
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### POST `/api/v1/return-requests/{id}/handover-confirmation` — `returnRequestHandoverConfirm`

- Summary: Confirm that the handover of the data is done
- Roles (403): The caller did not send the return (RETURN_REQUEST.NOT_REQUESTER).
- Params: path:id*(string:uuid)

## saas-issues

### GET `/api/v1/saas-issues/options` — `saasIssueFormOptions`

- Summary: Read the form to report an error in a SaaS right
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/saas-issues` — `saasIssueSubmit`

- Summary: Report an error in a SaaS right granted to the caller
- Roles (403): The assignment is not a personal right granted to the caller, or does not exist (SAAS_ISSUE.ASSIGNMENT_NOT_YOURS): the two are not told apart. Nothing is written.
- Body: `SubmitSaasIssueBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `assignmentId` | string:uuid | yes |  |  |
| `category` | enum(NO_ACCESS/INVITATION_OR_ACTIVATION/MISSING_PLAN_FEATURE/PROVIDER_OUTAGE/OTHER) | yes |  |  |
| `impact` | enum(UNUSABLE/PARTIAL/QUESTION_OR_OTHER) | yes |  |  |
| `description` | string | yes | maxLength=2000 | Required: a value that is only whitespace is refused. |
| `occurredAt` | string:date-time | yes |  |  |

### GET `/api/v1/saas-issues` — `saasIssueList`

- Summary: List the reports of errors in SaaS rights
- Roles (403): A person who is not an IT Admin asked for the reports of others (SAAS_ISSUE.SCOPE_FORBIDDEN).
- Params: query:scope(enum(mine|assigned|all)), query:state(enum(NEW|IN_PROGRESS|WAITING_REPORTER|WAITING_PROVIDER|RESOLVED|CLOSED|DUPLICATE)), query:overdue(enum(true|false)), query:reporterEmployeeId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/saas-issues/{id}` — `saasIssueGet`

- Summary: Read a report of an error in a SaaS right
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/saas-issues/{id}/entries` — `saasIssueEntryList`

- Summary: List the exchange on a report
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/saas-issues/{id}/messages` — `saasIssueAddMessage`

- Summary: Add to the exchange on a report
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)
- Body: `SaasIssueMessageBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `body` | string | yes | maxLength=2000 |  |

### POST `/api/v1/saas-issues/{id}/reopening` — `saasIssueReopen`

- Summary: Reopen a resolved report
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)
- Body: `SaasIssueReopenBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `reason` | string | yes | maxLength=1000 |  |

### POST `/api/v1/saas-issues/{id}/transitions` — `saasIssueTransition`

- Summary: Move a report to its next state
- Roles (403): Only an IT Admin handles a report.
- Params: path:id*(string:uuid)
- Body: `SaasIssueTransitionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `to` | enum(NEW/IN_PROGRESS/WAITING_REPORTER/WAITING_PROVIDER/RESOLVED/CLOSED/DUPLICATE) | yes |  |  |
| `message` | string |  | maxLength=2000 |  |
| `resolution` | string |  | maxLength=2000 |  |
| `vendorTicketRef` | string |  | maxLength=100 |  |
| `linkedWork` | object |  |  |  |
| `linkedWork.grantTaskId` | string:uuid |  |  |  |
| `linkedWork.discrepancyId` | string:uuid |  |  |  |
| `linkedWork.returnId` | string:uuid |  |  |  |
| `linkedWork.requestId` | string:uuid |  |  |  |

### POST `/api/v1/saas-issues/{id}/duplicate` — `saasIssueMarkDuplicate`

- Summary: Mark a report as a duplicate of another
- Roles (403): Only an IT Admin marks a duplicate.
- Params: path:id*(string:uuid)
- Body: `SaasIssueDuplicateBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ofIssueId` | string:uuid | yes |  |  |
| `reason` | string | yes | maxLength=1000 |  |

## seat-baseline

### GET `/api/v1/seat-baseline` — `seatBaselineGet`

- Summary: Get whether the seat baseline is closed
- Roles (403): Only an IT Admin reads or closes the seat baseline.

### POST `/api/v1/seat-baseline/close` — `seatBaselineClose`

- Summary: Close the seat baseline
- Roles (403): Only an IT Admin reads or closes the seat baseline.

## seat-baseline-imports

### POST `/api/v1/seat-baseline-imports` — `seatBaselineImportUpload`

- Summary: Upload a seat baseline file for preview
- Roles (403): Only an IT Admin imports the seat baseline.
- Body: `inline` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `file` | string:binary | yes |  |  |
| `subscriptionId` | string:uuid |  |  |  |
| `planId` | string:uuid |  |  |  |

### GET `/api/v1/seat-baseline-imports/{id}` — `seatBaselineImportGet`

- Summary: Get a seat baseline import
- Roles (403): Only an IT Admin reads a seat baseline import and its rows.
- Params: path:id*(string:uuid)

### GET `/api/v1/seat-baseline-imports/{id}/rows` — `seatBaselineImportRows`

- Summary: List the rows of a seat baseline import
- Roles (403): Only an IT Admin reads a seat baseline import and its rows.
- Params: path:id*(string:uuid), query:outcome(enum(VALID|ERROR)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=50)

### POST `/api/v1/seat-baseline-imports/{id}/confirm` — `seatBaselineImportConfirm`

- Summary: Confirm a seat baseline preview
- Roles (403): Only an IT Admin imports the seat baseline.
- Params: path:id*(string:uuid)
- Body: `ConfirmSeatImportBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `previewVersion` | integer | yes | minimum=0 maximum=9007199254740991 |  |
| `idempotencyKey` | string | yes | minLength=8 maxLength=128 |  |

### POST `/api/v1/seat-baseline-imports/{id}/cancel` — `seatBaselineImportCancel`

- Summary: Throw a seat baseline preview away
- Roles (403): Only an IT Admin imports the seat baseline.
- Params: path:id*(string:uuid)

## service-account-duties

### GET `/api/v1/service-account-duties` — `serviceAccountDutyList`

- Summary: List the service accounts that need a new person
- Roles (403): Only an IT Admin reads the service accounts that need a new person.
- Params: query:employeeId(string:uuid), query:overdue(enum(true|false)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## spend-approvals

### GET `/api/v1/spend-approvals` — `spendApprovalList`

- Summary: List the requests waiting for my decision as spend
- Roles (403): (no 403 — any authenticated or public)
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/access-requests/{id}/spend-approval` — `spendApprovalGet`

- Summary: Get the spend step of a request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### POST `/api/v1/access-requests/{id}/spend-approval` — `spendApprovalDecide`

- Summary: Approve or refuse a request as spend
- Roles (403): The caller does not hold the step (SPEND.NOT_THE_ASSIGNEE) or asked for or is given the access (SPEND.OWN_REQUEST).
- Params: path:id*(string:uuid)
- Body: `SpendDecisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `decision` | enum(APPROVE/REJECT) | yes |  |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |
| `override` | object |  |  |  |
| `override.reason` | string | yes | minLength=1 maxLength=1000 |  |
| `override.years` | array<integer> | yes | minItems=1 maxItems=20 |  |

### POST `/api/v1/spend-batches/{id}/decisions` — `spendBatchDecide`

- Summary: Approve or refuse the requests of a batch together
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)
- Body: `BatchDecisionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `decision` | enum(APPROVE/REJECT) | yes |  |  |
| `requestIds` | array<string:uuid> | yes | minItems=1 maxItems=50 |  |
| `reason` | string |  | minLength=1 maxLength=1000 |  |

## spend-submission

### GET `/api/v1/spend-queue` — `spendQueueList`

- Summary: List the requests waiting to be sent on as spend
- Roles (403): The caller does not head a department (SPEND.NOT_HEAD).
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/spend-batches` — `spendBatchSubmit`

- Summary: Send requests on to be decided as spend
- Roles (403): The caller does not head a department (SPEND.NOT_HEAD).
- Body: `SubmitBatchBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `requestIds` | array<string:uuid> | yes | minItems=1 maxItems=50 |  |

### GET `/api/v1/spend-batches/{id}` — `spendBatchGet`

- Summary: Get a batch of requests sent on as spend
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/spend-batches/{id}/items` — `spendBatchItemList`

- Summary: List the requests of a batch
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### PUT `/api/v1/access-requests/{id}/plan-line` — `accessRequestPlanLineSet`

- Summary: Attach a request to a line of the plan
- Roles (403): The caller does not head a department (SPEND.NOT_HEAD).
- Params: path:id*(string:uuid)
- Body: `PlanLineBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planLine` | object |  |  |  |
| `planLine.position` | integer | yes | minimum=1 maximum=9007199254740991 |  |
| `planLine.stillNeeded` | boolean |  |  |  |
| `offPlan` | enum(true) |  |  |  |

### GET `/api/v1/access-requests/{id}/plan-line-suggestions` — `accessRequestPlanLineSuggestionList`

- Summary: List the lines a request may be attached to
- Roles (403): The caller does not head a department (SPEND.NOT_HEAD).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/access-requests/{id}/supplements` — `accessRequestSupplementAdd`

- Summary: Change the day or leave people out in a supplementary file
- Roles (403): The caller does not head a department (SPEND.NOT_HEAD).
- Params: path:id*(string:uuid)
- Body: `SupplementBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `expectedSpendOn` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `dropEmployeeIds` | array<string:uuid> |  | minItems=1 maxItems=100 |  |
| `reason` | string | yes | minLength=1 maxLength=1000 |  |

### GET `/api/v1/access-requests/{id}/supplements` — `accessRequestSupplementList`

- Summary: List the supplementary files of a request
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## step-congestion

### GET `/api/v1/step-congestion` — `stepCongestionList`

- Summary: List who holds how many steps and how late they are
- Roles (403): Only the Super Admin reads the board and records incidents (AUTHORIZATION.FORBIDDEN).
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/step-congestion/steps` — `stepCongestionStepList`

- Summary: List the steps waiting on one person
- Roles (403): Only the Super Admin reads the board and records incidents (AUTHORIZATION.FORBIDDEN).
- Params: query:holderEmployeeId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/step-congestion/incidents` — `stepCongestionIncidentRecord`

- Summary: Record an incident about steps that wait too long
- Roles (403): Only the Super Admin reads the board and records incidents (AUTHORIZATION.FORBIDDEN).
- Body: `CongestionIncidentBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `holderEmployeeId` | string:uuid | yes | nullable |  |
| `description` | string | yes | minLength=1 maxLength=1000 |  |

### GET `/api/v1/step-congestion/incidents` — `stepCongestionIncidentList`

- Summary: List the incidents recorded about steps
- Roles (403): Only the Super Admin reads the board and records incidents (AUTHORIZATION.FORBIDDEN).
- Params: query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## subscription-renewals

### GET `/api/v1/subscription-renewals` — `subscriptionRenewalList`

- Summary: List the renewals of subscription periods
- Roles (403): Only the IT Admin, Finance and the person who decides spending read the renewals (SUBSCRIPTION_RENEWAL.READ_FORBIDDEN).
- Params: query:state(enum(PROPOSED|DECIDED|OUTCOME_RECORDED)), query:subscriptionId(string:uuid), query:late(enum(true|false)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/subscription-renewals` — `subscriptionRenewalPropose`

- Summary: Propose the renewal of a subscription period
- Roles (403): Only an IT Admin proposes.
- Body: `SubscriptionRenewalProposeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `subscriptionId` | string:uuid | yes |  |  |
| `choice` | enum(RENEW/REDUCE/CANCEL) | yes |  |  |
| `proposedQuantity` | integer |  | minimum=0 maximum=1000000000 |  |
| `note` | string |  | minLength=1 maxLength=2000 |  |
| `businessOwnerOpinion` | string |  | minLength=1 maxLength=2000 |  |

### GET `/api/v1/subscription-renewals/{id}` — `subscriptionRenewalGet`

- Summary: Read a renewal of a subscription period
- Roles (403): Only the IT Admin, Finance and the person who decides spending read the renewals (SUBSCRIPTION_RENEWAL.READ_FORBIDDEN).
- Params: path:id*(string:uuid)

### GET `/api/v1/subscription-renewals/{id}/seat-ranking` — `subscriptionRenewalSeatRanking`

- Summary: List the seats in use ranked for a reduction
- Roles (403): Only the IT Admin, Finance and the person who decides spending read the renewals (SUBSCRIPTION_RENEWAL.READ_FORBIDDEN).
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/subscription-renewals/{id}/decision` — `subscriptionRenewalDecide`

- Summary: Decide a renewal of a subscription period
- Roles (403): The caller is not the person who decides this renewal now, or proposed it (SUBSCRIPTION_RENEWAL.NOT_DECIDER).
- Params: path:id*(string:uuid)
- Body: `SubscriptionRenewalDecideBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `choice` | enum(RENEW/REDUCE/CANCEL) | yes |  |  |
| `quantity` | integer |  | minimum=0 maximum=1000000000 |  |
| `reason` | string |  | minLength=1 maxLength=2000 |  |
| `withinCurrentTerm` | boolean |  |  |  |
| `acknowledgeActiveUsers` | boolean |  |  |  |
| `releasedAssignmentIds` | array<string:uuid> |  | maxItems=10000 |  |

### POST `/api/v1/subscription-renewals/{id}/outcome` — `subscriptionRenewalRecordOutcome`

- Summary: Record the outcome of a renewal
- Roles (403): Only an IT Admin records the outcome.
- Params: path:id*(string:uuid)
- Body: `SubscriptionRenewalOutcomeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `outcome` | enum(AS_DECIDED/VENDOR_REFUSED/DIFFERENT/UNCONFIRMED) | yes |  |  |
| `note` | string |  | minLength=1 maxLength=2000 |  |
| `nextPeriod` | object |  |  |  |
| `nextPeriod.purchasedQuantity` | integer | yes | minimum=0 maximum=1000000000 |  |
| `nextPeriod.unitPrice` | object | yes |  |  |
| `nextPeriod.unitPrice.amount` | string | yes | maxLength=40 |  |
| `nextPeriod.unitPrice.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `nextPeriod.billingCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/OTHER) | yes |  |  |
| `nextPeriod.startDate` | string:date | yes |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `nextPeriod.endDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `nextPeriod.renewalDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `nextPeriod.noticeDeadline` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `nextPeriod.noticePeriodDays` | integer |  | minimum=0 maximum=3650 |  |
| `nextPeriod.autoRenew` | boolean | yes |  |  |
| `nextPeriod.allowsMidTermReduction` | boolean | yes |  |  |

### GET `/api/v1/subscription-deadline-events` — `subscriptionDeadlineEventList`

- Summary: List the milestones that passed with no renewal decision
- Roles (403): Only the IT Admin, the person who decides spending and the Super Admin read them.
- Params: query:kind(enum(AUTO_RENEWAL_INCIDENT|EXPIRY_MARKED)), query:from(string:date), query:to(string:date), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

## subscriptions

### GET `/api/v1/subscriptions` — `subscriptionList`

- Summary: List subscriptions
- Roles (403): Only the IT Admin and Finance read subscriptions: prices and contracts are hidden from the rest.
- Params: query:applicationId(string:uuid), query:planId(string:uuid), query:status(enum(DRAFT|ACTIVE)), query:kind(enum(TERM|PERPETUAL)), query:warning(enum(NO_ALERT_ANCHOR)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/subscriptions` — `subscriptionCreate`

- Summary: Declare a subscription or a perpetual purchase
- Roles (403): Only an IT Admin declares or changes subscriptions.
- Body: `DeclareSubscriptionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `planId` | string:uuid | yes |  |  |
| `ownerDepartmentId` | string:uuid | yes |  |  |
| `kind` | enum(TERM/PERPETUAL) | yes |  |  |
| `purchasedQuantity` | integer |  | minimum=0 maximum=1000000000 |  |
| `unitPrice` | object |  |  |  |
| `unitPrice.amount` | string | yes | maxLength=40 |  |
| `unitPrice.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `billingCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/OTHER) |  |  |  |
| `startDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `endDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `renewalDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `noticeDeadline` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `noticePeriodDays` | integer |  | minimum=0 maximum=3650 |  |
| `autoRenew` | boolean |  |  |  |
| `allowsMidTermReduction` | boolean |  |  |  |

### GET `/api/v1/subscriptions/{id}` — `subscriptionGet`

- Summary: Get a subscription
- Roles (403): Only the IT Admin and Finance read subscriptions: prices and contracts are hidden from the rest.
- Params: path:id*(string:uuid)

### PATCH `/api/v1/subscriptions/{id}` — `subscriptionUpdate`

- Summary: Update a subscription
- Roles (403): Only an IT Admin declares or changes subscriptions.
- Params: path:id*(string:uuid)
- Body: `UpdateSubscriptionBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `purchasedQuantity` | integer |  | minimum=0 maximum=1000000000 |  |
| `unitPrice` | object |  |  |  |
| `unitPrice.amount` | string | yes | maxLength=40 |  |
| `unitPrice.currency` | string | yes | pattern="^[A-Z]{3}$" |  |
| `billingCycle` | enum(MONTHLY/QUARTERLY/ANNUAL/OTHER) |  |  |  |
| `startDate` | string:date |  |  | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `endDate` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `renewalDate` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `noticeDeadline` | string:date |  | nullable | A calendar date as YYYY-MM-DD; it must exist (2026-02-30 is refused). |
| `noticePeriodDays` | integer |  | minimum=0 maximum=3650 nullable |  |
| `autoRenew` | boolean |  |  |  |
| `allowsMidTermReduction` | boolean |  |  |  |

### POST `/api/v1/subscriptions/{id}/completions` — `subscriptionComplete`

- Summary: Complete a draft subscription
- Roles (403): Only an IT Admin declares or changes subscriptions.
- Params: path:id*(string:uuid)

### GET `/api/v1/subscriptions/{id}/seat-usage` — `subscriptionSeatUsage`

- Summary: Get the seats taken and free of a subscription
- Roles (403): Only an IT Admin reads the seats of a subscription.
- Params: path:id*(string:uuid)

## super-admin-watch

### GET `/api/v1/super-admin-watch` — `superAdminWatchGet`

- Summary: Read the state of the Super Admin role
- Roles (403): Only the Super Admin and an IT Admin read the state of the Super Admin role.

## transfer-reviews

### GET `/api/v1/transfer-reviews` — `transferReviewList`

- Summary: List the reviews of tools after a transfer
- Roles (403): (no 403 — any authenticated or public)
- Params: query:status(enum(OPEN|COMPLETED|SUPERSEDED)), query:overdue(enum(true|false)), query:departmentId(string:uuid), query:employeeId(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/transfer-reviews/{id}` — `transferReviewGet`

- Summary: Read a review of tools after a transfer
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid)

### GET `/api/v1/transfer-reviews/{id}/items` — `transferReviewItemList`

- Summary: List the tools of a review
- Roles (403): (no 403 — any authenticated or public)
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/transfer-reviews/{id}/decisions` — `transferReviewDecide`

- Summary: Decide about one tool of a review
- Roles (403): The caller is not the head of the department the person came to today: the head before, an IT Admin, a stand-in approver or anyone else (TRANSFER_REVIEW.NOT_REVIEWER). Nothing is written.
- Params: path:id*(string:uuid)
- Body: `DecideTransferReviewBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `assignmentId` | string:uuid | yes |  |  |
| `decision` | enum(STILL_NEEDED/NOT_NEEDED/NEEDS_NEW_TOOL) | yes |  |  |
| `newToolNote` | string |  | maxLength=500 |  |

## vendor-dictionary

### GET `/api/v1/vendor-dictionary/groups` — `vendorGroupList`

- Summary: List vendor groups
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: query:search(string maxLength=100), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/vendor-dictionary/groups` — `vendorGroupCreate`

- Summary: Create a vendor group
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Body: `CreateGroupBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | maxLength=1000 |  |
| `brandDomains` | array<string> |  | maxItems=100 |  |

### PATCH `/api/v1/vendor-dictionary/groups/{id}` — `vendorGroupUpdate`

- Summary: Update a vendor group
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: path:id*(string:uuid)
- Body: `UpdateGroupBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=1000 |  |
| `brandDomains` | array<string> |  | maxItems=100 |  |

### POST `/api/v1/vendor-dictionary/groups/{id}/service-lines` — `vendorServiceLineCreate`

- Summary: Add a service line to a vendor group
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: path:id*(string:uuid)
- Body: `CreateServiceLineBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | yes | maxLength=1000 |  |
| `domains` | array<string> |  | maxItems=100 |  |
| `patterns` | array<string> |  | maxItems=100 |  |

### PATCH `/api/v1/vendor-dictionary/service-lines/{id}` — `vendorServiceLineUpdate`

- Summary: Update a service line
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: path:id*(string:uuid)
- Body: `UpdateServiceLineBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string |  | maxLength=1000 |  |
| `domains` | array<string> |  | maxItems=100 |  |
| `patterns` | array<string> |  | maxItems=100 |  |

### GET `/api/v1/vendor-dictionary/suggestions` — `vendorSuggestionList`

- Summary: Suggest service lines for a typed name
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: query:name*(string minLength=1 maxLength=200)

### POST `/api/v1/vendor-dictionary/normalizations` — `vendorNormalize`

- Summary: Recognise a vendor from a domain or a bank description
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Body: `NormalizeBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `kind` | enum(DOMAIN/DESCRIPTION) | yes |  |  |
| `value` | string | yes | maxLength=500 |  |

### GET `/api/v1/vendor-dictionary/proposals` — `vendorProposalList`

- Summary: List proposals to add a vendor
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: query:status(enum(PENDING|ACCEPTED|DISMISSED)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### POST `/api/v1/vendor-dictionary/proposals/{id}/resolutions` — `vendorProposalResolve`

- Summary: Accept or dismiss a proposal
- Roles (403): Only an IT Admin uses the vendor dictionary.
- Params: path:id*(string:uuid)
- Body: `ResolveProposalBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `outcome` | enum(ACCEPTED/DISMISSED) | yes |  |  |
| `serviceLineId` | string:uuid |  |  |  |

## vendors

### GET `/api/v1/vendors` — `vendorList`

- Summary: List vendors
- Roles (403): Only the IT Admin and Finance read vendors and their tax profiles.
- Params: query:search(string maxLength=100), query:taxProfile(enum(DECLARED|MISSING)), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/vendors/{id}/tax-profile` — `vendorTaxProfileGet`

- Summary: Get the tax profile of a vendor
- Roles (403): Only the IT Admin and Finance read vendors and their tax profiles.
- Params: path:id*(string:uuid)

### PUT `/api/v1/vendors/{id}/tax-profile` — `vendorTaxProfileSet`

- Summary: Declare the tax profile of a vendor
- Roles (403): Only Finance declares a tax profile.
- Params: path:id*(string:uuid)
- Body: `DeclareTaxProfileBodyDto` (required)

| Field | Type | Req | Constraints | Description |
| --- | --- | --- | --- | --- |
| `group` | enum(T1/T2/T3) |  |  |  |
| `lines` | array<object> | yes | maxItems=100 |  |
| `lines[].taxType` | string | yes | maxLength=1000 |  |
| `lines[].ratePercent` | string | yes | maxLength=20 |  |
| `lines[].deductible` | boolean | yes |  |  |

### GET `/api/v1/vendors/{id}/tax-profile/history` — `vendorTaxProfileHistory`

- Summary: List the declarations of a tax profile
- Roles (403): Only the IT Admin and Finance read vendors and their tax profiles.
- Params: path:id*(string:uuid), query:page(integer minimum=0 maximum=9007199254740991 default=1), query:pageSize(integer minimum=0 maximum=100 default=20)

### GET `/api/v1/vendors/{id}/tax-estimate` — `vendorTaxEstimate`

- Summary: Estimate the tax on a price before tax
- Roles (403): Only the IT Admin and Finance read vendors and their tax profiles.
- Params: path:id*(string:uuid), query:netAmount*(string maxLength=40), query:currency*(string pattern="^[A-Z]{3}$")

