# ADR-0003: Use flat feature modules with explicit infrastructure responsibilities

## Status

Accepted. Refined 2026-08-21: a root facade is created when a caller needs it, not in advance. Amended 2026-10-19:
the `catalog` reference-module consequence is superseded (see Consequences); the layout decision itself is unchanged.
Superseded in part 2026-10-29 by [ADR-0019](0019-module-tiers-and-public-api.md): the module layout (`public/` door,
capability and use-case folders, depth and size limits) follows ADR-0019; infrastructure responsibilities stay as here.

## Date

2026-08-12

## Context

The initial modular-monolith design used nested `api/application/domain/infrastructure` folders inside every business module. The team is small, works heavily with AI coding tools and already has a successful previous backend organized as pragmatic feature folders. Deep layers make simple modules harder to navigate and encourage empty scaffolding, while a completely unstructured flat module can grow into large service and repository files.

Cross-cutting source also needs discoverable ownership: environment schema, CORS policy, HTTP filters/interceptors/pipes/decorators and authentication should not be mixed at one folder level.

## Decision

- Organize each business capability as a flat Nest feature module.
- Keep root files such as `<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `<module>.repo.ts`, constants, messages and scheduled processors.
- Add responsibility folders such as `adapters/`, `dto/`, `errors/`, `helpers/`, `mappers/`, `policies/`, `schemas/` and `services/` only when they contain real code.
- Keep `services/` as the conventional name. Reject `solution/` because it does not communicate whether a file is a use case, policy, adapter or helper.
- Permit a root `<module>.service.ts` as the controller-facing and exported facade. It coordinates focused services and policies but must not expose repositories or accumulate every workflow.
- Do not create that facade before something calls it. A facade whose methods forward their arguments and return values unchanged is a layer to read through, not a layer that does work; `access-requests` had one and it was deleted. The module keeps its policy private until a controller needs orchestration.
- Split application-wide infrastructure into explicit `config`, `http`, `security`, `database`, `queue`, `object-storage`, `observability` and `health` boundaries.
- Keep `core/` framework-free and limited to stable primitives shared by multiple business modules.

## Alternatives considered

### Deep clean-architecture folders in every module

They make dependency direction explicit but add navigation and scaffolding cost disproportionate to this internal system and small team. Boundary tests and narrow Nest exports provide the required isolation with fewer layers.

### Rename `services/` to `solution/`

This creates a project-specific term with no precise responsibility. It makes file placement less predictable for developers and AI agents and is likely to become a dumping ground.

### Put every workflow in one root service

This starts simply but creates god services, high merge-conflict rates and difficult tests as modules grow. The root facade remains small and delegates real workflows to focused services.

## Consequences

- Paths are shorter and match familiar Nest feature-module conventions.
- Module boundaries depend on explicit exports and automated import checks rather than nested layer names.
- A module may begin with only a module file and a policy, exporting nothing; no empty folders and no unused facade are committed.
- ~~`catalog` is the reference module for this layout. Copy its shape rather than re-deriving one.~~ _Superseded
  2026-10-19:_ `catalog` is not mounted and does not follow the current rules, so it is no template. Place files by
  [module structure](../rules/module-structure.md) and the architecture gates; G3 decides the module's future (Owner
  decision E1 = A, [H4.0 audit](../reviews/be-full-src-architecture-audit-2026-10-19/README.md#quyết-định-owner-09b)).
- When a root service becomes mostly unrelated methods, workflows must be extracted into `services/` while preserving the facade contract.
- Existing documentation and AI rules must use this layout and must not regenerate the superseded deep structure.
