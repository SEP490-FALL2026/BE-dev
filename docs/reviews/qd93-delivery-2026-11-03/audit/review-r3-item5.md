# Review r3-item5 — qd93-remove-department-projects, phase 1 (`99b7234e..3f93c788`)

Skills read/used: `C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md` (five-axis review, severity labels).
Mode: read-only. No pnpm/jest/prisma. Evidence comes from `git diff`/`git show`, grep, and two plain `node` scripts in the scratchpad
(counting OpenAPI request date leaves and eslint suppressions at both commits).

## Verdict
No Blocker, High or Medium findings. Phase 1 matches the spec. Only Low findings and nits (doc accuracy, stale comments, gate hygiene).

## Verified (by reading code or computing)
- Routes: `projects.controller`, its 2 providers, and the whole `organization/project/` folder (12 files) are gone. `routes.md` goes 305→301,
  and `openapi-presentation` expects 301. `openapi.json` has no `project` text left, apart from the word "projection". The api-coverage,
  example-message and route-code manifests are pruned. `project-retirement.http-spec.ts` checks for 404 on the 4 calls as Super Admin.
- No dangling references in `src` (outside `src/generated`): no `ProjectService/Repo`, `project/`, `PROJECT.*`, `hrBasis` (apart from
  personnel, which keeps it on purpose), `PROFILE_PROJECT_LIMIT`, or raw SQL on projects or `project_label`. `hr-basis.dto.ts` and
  `public/hr-basis.types.ts` are removed. `module-graph` organization→audit goes 10→9, which is the import project.service made.
- `projectLabel` is out of 9 bodies, `requestSchema` and the preview response. Prisma has `@ignore` on the field and on the two relation
  fields, and `@@ignore` on `Project` and `ProjectDepartment`. Every draft read (submit, save response, delete/departure audit snapshot)
  goes through `contentOf`, which strips `RETIRED_DRAFT_BODY_KEYS` from a rest copy, so the stored policy is never changed.
- Audit: `resourceType` is a free string, so old `PROJECT.*` events can still be read (OQ-2).
- Lint debt: counts at 99b7234e were complexity 59, max-lines 53, sum 112, requests 37. At 3f93c788 they are 58, 53, 111, 36. The whole
  drop is one `complexity` suppression in `requests/assessment/proposal.service.ts`, which became stale once `body.projectLabel ?? null`
  was removed. The gate's equality assertions hold exactly.
- OpenAPI date-leaf floor: the request date leaves count 93 → 91. The two removed leaves are `projectCreate Body hrBasis.issuedOn` and
  `projectUpdate Body hrBasis.issuedOn`. `projectLabel` is not a date. The new floor of 91 equals the actual count, so the check is tight
  (see L1).
- Registry: `NESTED_ARRAYS` drops 4 keys. The events are consistent with `INITIAL_NESTED_ARRAYS`: the `projectGet#departments` added
  event is removed, and 3 `closed` events are added from unbounded/bounded/bounded. The date `2026-11-02` is the commit date.
- Harnesses: `department-harness.api()` behaves the same for every path that is not `/projects`. `request-harness` changes only by
  dropping one type field. No kept-behaviour assertion was dropped. The `cost_centers +1` check in the deleted AC-14 test was a side
  effect of the harness (Finance creates the Cost Center), and AC-1 in `department-profile-http` covers it.
- The 16 mapping rows: each has a real replacement. The 9 HTTP 422 bodies are otherwise valid, checked against the Zod schemas. The
  integration test for an old draft is genuinely red-before and green-after.
- Seed/demo (`src/cli`, `installation`), scripts and e2e have no project or `projectLabel` references.

## Findings
**L1** `docs/workspace/items/qd93-remove-department-projects/plan.md:231`: the plan says the floor dropped by "one date leaf of the
retired project bodies". In fact two leaves disappeared (93→91), and the old floor of 92 was loose by one. Fix: correct the row.
Confidence: verified by computing the count from `openapi.json` at both commits.

**L2** `test/integration/organization/department-profile-http.integration-spec.ts:50`: the plan row says this test checks "the exact
profile object", but it uses `toMatchObject`. After `projects`/`projectTotal` were removed from it, this file no longer checks that they
are absent. The real coverage comes from the exact `PROFILE_KEYS` in `department-contract-http` (create), `organization-identity-read`
(get) and `request-project-label-retired` (patch). Fix: add `not.toHaveProperty`, or correct the row. Verified.

**L3** `test/gates/api-collection-contract.gate-spec.ts:108-112`: the docstring still says the finding serves only the F-findings of the
baseline remediation, for operations that were removed. Now `departmentGet` stays and only its field is gone. There is also no negative
fixture showing that a `QĐ-…` finding on a non-`closed` event is refused. Fix: update the docstring and add a single fixture. Verified.

**L4** Stale wording:
- `src/modules/organization/README.md:4-5` ("dự án") and `:71` (`project` still listed in the capability order). The English note at
  `:124` sits in a Vietnamese card.
- `access-request.dto.ts:6` ("label") and `:13` ("project is context only").
- `group-request.dto.ts:25` ("the project they share").
- `test/http/organization/departments.http-spec.ts:12-14` ("still sent to `/projects`").
- `access-request-preview.integration-spec.ts:225`: the test name still mentions a project, and the second preview is now a duplicate.

Verified.

**L5** Matrix row "20 response schemas have no `projectLabel`" is backed only by a manual diff of `openapi.json`, with no regression
assertion. DoD: the FE docs in the BE repo (`a07-mobile-employee-flow/spec.md:88,90`, `a09…/mobile-contract.md:155`) are not recorded in
the verification table. Verified.

**Nit**
- `removedByDecision` has a different signature from the spec: the date and reason are fixed inside it.
- The `RETIRED_DRAFT_BODY_KEYS` comment has no removal date and spells the decision "QD-93h" instead of "QĐ-93h".
- `request-draft-policy.json.spec.ts` imports the `draft/` mapper, which crosses capabilities inside a spec.
