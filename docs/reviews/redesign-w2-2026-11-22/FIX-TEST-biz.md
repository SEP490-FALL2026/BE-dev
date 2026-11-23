# FIX-TEST — Đợt 2 thiết kế lại, làn `biz`

| Gói | File test | Ca | Lý do |
| --- | --------- | -- | ----- |
| B10a | `test/integration/organization/department-contract-http.integration-spec.ts` | `LIST_KEYS`, `PROFILE_KEYS`, exact `profile` object check | W2-27 (a) thêm `itCoverage` và `itSubstitute` vào `departmentGet` và `departmentList` (cộng thêm) |
| B10b | `test/integration/licensing/licensing-provisioning-task-read-contracts.integration-spec.ts` | `SUMMARY_KEYS` (`inGeneralQueue`) | W2-27 (c) thay `inGeneralQueue` bằng `awaitingItAdmin` và `actingItAdmins` |
| B10b | `test/integration/licensing/provisioning-grant-http.integration-spec.ts` | `inGeneralQueue`, `ANOTHER_IT_ADMIN_NEEDED`, cấp cho người phòng không có IT phụ trách | W2-27 H2–H4: bỏ hàng `GENERAL`, tự cấp không chặn (Q9), ngoài người làm ⟹ 403 `PROVISIONING.NOT_IN_CHARGE` |
| B10b | `test/integration/licensing/provisioning-queue-http.integration-spec.ts` | `scope: 'GENERAL'`, `inGeneralQueue`, `ANOTHER_IT_ADMIN_NEEDED`, IT khác phòng giành/làm việc | W2-27 H2–H4: bỏ `scope=GENERAL` (422), bỏ `inGeneralQueue`, tự cấp không chặn, chỉ người làm của phòng |
| B10b | `test/integration/licensing/provisioning-decision-http.integration-spec.ts` | `ANOTHER_IT_ADMIN_NEEDED`, IT khác phòng quyết định thất bại | W2-27 H3, H4: tự cấp không chặn (Q9), chỉ người làm của phòng (403 `PROVISIONING.NOT_IN_CHARGE`) |
| B10b | `test/integration/licensing/provisioning-department-and-role.integration-spec.ts` | `ANOTHER_IT_ADMIN_NEEDED`, `countUsableItAdminsExcept` spy, cấp/nhận ngoài phòng | W2-27 H3, H4: tự cấp không chặn (Q9), không còn đếm IT khác, chỉ người làm của phòng |
| B10b | `test/integration/licensing/provisioning-revocation-complete.integration-spec.ts` | `ANOTHER_IT_ADMIN_NEEDED`, hoàn tất thu hồi ngoài phòng | W2-27 H3, H4: tự cấp không chặn (Q9), chỉ người làm của phòng |
| B10b | `test/integration/licensing/provisioning-revocation-open.integration-spec.ts` | `inGeneralQueue`, `ANOTHER_IT_ADMIN_NEEDED` | W2-27 (c), H4: đổi `inGeneralQueue` → `awaitingItAdmin`, tự thực thi không chặn |
| B10b | `test/integration/requests/grant-self-claim.integration-spec.ts` | `ANOTHER_IT_ADMIN_NEEDED`, cấp trong phòng không IT phụ trách | W2-27 H3, H4: tự cấp không chặn (Q9), chỉ người làm của phòng |
| B10b | `test/integration/dashboards/dashboards-http.integration-spec.ts` | `it2` giành tác vụ của `P-DES` (`it1` phụ trách) | W2-27 H3: chỉ người làm của phòng (403 `PROVISIONING.NOT_IN_CHARGE`) |
| B10b | `test/flows/mf1-request-contract.flow-spec.ts` | `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` | W2-27 H4 (Owner Q9): tự cấp không còn trả `ANOTHER_IT_ADMIN_NEEDED` |
