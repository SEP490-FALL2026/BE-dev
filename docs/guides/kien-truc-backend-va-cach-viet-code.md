# Kiến trúc backend và cách viết code chuẩn

Tài liệu này dành cho người mới vào codebase, hoặc cho AI agent cần hiểu **tại sao** code được sắp xếp như hiện tại trước khi thêm tính năng.

- `ARCHITECTURE.md` trả lời **hệ thống được thiết kế thế nào**.
- `AGENTS.md` là danh sách luật ngắn gọn, dạng mệnh lệnh.
- Tài liệu này giải thích **lý do đằng sau các luật đó** và **quy trình viết một tính năng từ đầu đến cuối**.

Khi tài liệu này mâu thuẫn với `ARCHITECTURE.md` hoặc một ADR trong `docs/decisions/`, ADR thắng — và bạn nên sửa tài liệu này.

> **Lưu ý về trạng thái hiện tại.** Mọi thứ tài liệu này mô tả đều đã tồn tại trong code — gồm `ERROR_CODE_PATTERN`, bảng `PRISMA_MODEL_OWNER` cùng hai architecture test đi kèm, và endpoint `/health/ready`. Ngoại lệ duy nhất là mục 6: module `catalog` trong ví dụ vertical slice **chưa được viết**, nó là bản mẫu để bạn làm theo chứ không phải code đang có trong repo.

---

## 1. Kiến trúc tổng thể: modular monolith

Hệ thống là **một ứng dụng NestJS duy nhất, deploy một lần, dùng một PostgreSQL**, nhưng bên trong được chia thành các module theo **năng lực nghiệp vụ** (business capability), không phải theo loại kỹ thuật.

Điều này khác hai thái cực thường gặp:

| Kiểu | Chia theo | Vấn đề |
| --- | --- | --- |
| Layered monolith | `controllers/`, `services/`, `repositories/` | Sửa một tính năng phải nhảy qua 5 thư mục. Không ai biết ranh giới nghiệp vụ ở đâu. |
| Microservices | mỗi capability một service riêng | Trả giá vận hành (network, deploy, distributed transaction) cho một đội nhỏ chưa cần. |
| **Modular monolith (đang dùng)** | mỗi capability một thư mục, ranh giới enforce bằng test | Đơn giản như monolith, nhưng ranh giới đủ rõ để sau này tách được nếu thật sự cần. |

Lý do chọn: ADR `docs/decisions/0001-modular-monolith.md`.

**Điều kiện để codebase còn được gọi là modular monolith** (nếu mất một trong số này thì nó đã thoái hoá thành big ball of mud):

1. Module chia theo nghiệp vụ, không phải theo tầng kỹ thuật.
2. Mỗi module sở hữu use case, rule và persistence adapter của chính nó.
3. Module chỉ export một contract hẹp; module khác không đụng được repository hay bảng DB của nó.
4. `AppModule` chỉ là composition root — nơi ghép module lại, không chứa quyết định nghiệp vụ.
5. Ranh giới được kiểm tra bằng **test tự động**, không phải bằng quy ước miệng.

Điểm 5 là điểm quan trọng nhất và cũng hay bị bỏ qua nhất. Xem mục 4.

---

## 2. Bản đồ source: ba vùng và luật phụ thuộc

```text
src/
├─ core/              ← TypeScript thuần, không framework
├─ infrastructure/    ← năng lực kỹ thuật dùng chung toàn app
├─ modules/           ← các capability nghiệp vụ
├─ app.module.ts      ← composition root của API
├─ main.ts            ← bootstrap process API
├─ worker.module.ts   ← composition root của worker
└─ worker.ts          ← bootstrap process worker
```

### Luật phụ thuộc (chiều mũi tên = được phép import)

```text
modules/  ──────►  infrastructure/  ──────►  core/
    │                                          ▲
    └──────────────────────────────────────────┘

core/  ──X──►  infrastructure/        (cấm)
core/  ──X──►  modules/               (cấm)
infrastructure/  ──X──►  modules/     (cấm)
modules/A  ──X──►  modules/B (private) (cấm — chỉ được gọi facade công khai của B)
```

### `src/core/` — primitive kỹ thuật thuần

TypeScript thuần, **không được import** `@nestjs/*`, `@prisma/*`, `@aws-sdk/*`, `bullmq`, hay bất cứ thứ gì trong `infrastructure/`.

Hiện chỉ có `core/application/pagination.ts`. Đây là chỗ cho những thứ *nhỏ, ổn định, test được mà không cần dựng app*.

> **Cảnh báo:** `core/` rất dễ biến thành bãi rác `utils/`. Trước khi bỏ file vào đây, hỏi: "cái này có thật sự dùng chung cho nhiều module, và có thật sự không phụ thuộc framework không?" Nếu chỉ một module dùng, để trong module đó.

Luật này được enforce bởi test `keeps core framework-free` trong `src/architecture-boundaries.spec.ts`.

### `src/infrastructure/` — năng lực kỹ thuật dùng chung

Mỗi thư mục con là **một trách nhiệm kỹ thuật**, không phải một tầng:

| Thư mục | Trách nhiệm | File chính |
| --- | --- | --- |
| `config/` | validate biến môi trường bằng Joi, expose typed config | `env-schema.ts`, `cors.ts` |
| `http/` | vòng đời HTTP: pipe, interceptor, filter, DTO envelope, decorator OpenAPI | `http-infrastructure.module.ts` |
| `security/` | xác thực OIDC/JWT, guard toàn cục, rate limit | `authentication.guard.ts`, `oidc-jwt.verifier.ts` |
| `database/` | kết nối Prisma | `prisma.service.ts` |
| `queue/` | cấu hình BullMQ, chuẩn job envelope | `queue-infrastructure.module.ts` |
| `object-storage/` | port lưu file + adapter S3-compatible | `object-storage.port.ts` |
| `observability/` | request ID, AsyncLocalStorage context, structured log | `request-id.middleware.ts` |
| `health/` | liveness/readiness probe | `health.controller.ts` |

**Nguyên tắc:** `infrastructure/` biết về kỹ thuật, **không biết gì về nghiệp vụ**. Nó không được import `modules/`. Nếu bạn định thêm "license" hay "approval" vào một file trong `infrastructure/`, bạn đang đặt sai chỗ.

### `src/modules/<domain>/` — capability nghiệp vụ

Một module = một năng lực nghiệp vụ end-to-end. Bảng chủ sở hữu đầy đủ nằm ở `ARCHITECTURE.md` mục 3. Ví dụ: `licenses` sở hữu license pool và seat assignment; `access-requests` sở hữu request và approval step; `organization` sở hữu employee và department.

---

## 3. Vòng đời một HTTP request

Đây là phần cần nắm kỹ nhất, vì mọi bug về validation, auth, error format đều nằm ở đây.

```text
     HTTP request
          │
          ▼
┌─────────────────────────┐
│ 1. Middleware           │  RequestIdMiddleware
│                         │  - lấy/sinh x-request-id
│                         │  - mở AsyncLocalStorage context
└─────────────────────────┘
          ▼
┌─────────────────────────┐
│ 2. Guards (toàn cục)    │  a) ThrottlerGuard   → 429 nếu quá limit
│                         │  b) AuthenticationGuard → 401 nếu thiếu/sai token
│    ⚠ CHẠY TRƯỚC PIPE    │     (bỏ qua nếu handler có @Public())
└─────────────────────────┘
          ▼
┌─────────────────────────┐
│ 3. Pipes                │  ApplicationZodValidationPipe
│                         │  - validate body/query/param theo Zod DTO
│                         │  - sai → 422 VALIDATION_ERROR
└─────────────────────────┘
          ▼
┌─────────────────────────┐
│ 4. Controller           │  chỉ nhận dữ liệu đã sạch, gọi service
└─────────────────────────┘
          ▼
┌─────────────────────────┐
│ 5. Service / Repo       │  workflow nghiệp vụ + truy vấn DB
└─────────────────────────┘
          ▼
┌─────────────────────────┐
│ 6. SuccessEnvelope      │  bọc data → { success, message, data }
│    Interceptor          │
└─────────────────────────┘
          ▼
┌─────────────────────────┐
│ 7. ZodSerializer        │  validate response theo DTO
│    Interceptor          │  - sai schema → ném lỗi → 500 (fail closed)
└─────────────────────────┘
          ▼
     HTTP response

   Bất kỳ exception nào ở bước 2-7
          │
          ▼
┌─────────────────────────┐
│ HttpExceptionFilter     │  → { success:false, error:{ code, message, requestId } }
└─────────────────────────┘
```

### Ba điều dễ sai nhất

**a) Guard chạy TRƯỚC pipe.**
Nghĩa là trong guard, `request.body` / `request.query` **chưa được Zod validate**. Đừng bao giờ viết guard phân quyền dựa trên `body.departmentId` như thể nó đã sạch. Nếu cần phân quyền theo dữ liệu, làm trong service sau khi đã validate.

**b) Thứ tự interceptor bị đảo ở chiều response.**
Trong `http-infrastructure.module.ts`, thứ tự đăng ký là `ZodSerializerInterceptor` rồi `SuccessEnvelopeInterceptor`. Nhưng ở chiều **response**, NestJS chạy **ngược lại**: `SuccessEnvelope` bọc trước, rồi `ZodSerializer` validate cái envelope đã bọc. Đó là lý do DTO response luôn được khai bằng `successEnvelopeSchema(...)` chứ không phải schema trần.

**c) Response sai schema thì fail closed.**
Nếu controller trả về dữ liệu không khớp DTO, `ZodSerializerInterceptor` ném lỗi và client nhận 500 — **không** phải dữ liệu sai. Điều này là cố ý: thà lỗi rõ ràng còn hơn rò rỉ dữ liệu ngoài hợp đồng. Có E2E test bảo vệ hành vi này (`fails closed when a response violates its Zod wire schema`).

---

## 4. Ranh giới được enforce bằng test, không bằng niềm tin

`src/architecture-boundaries.spec.ts` đọc source dưới dạng text và fail build nếu ai đó phá luật. Đây là thứ giữ cho kiến trúc không mục theo thời gian.

| Test | Chặn điều gì |
| --- | --- |
| `keeps core framework-free` | `core/` import NestJS/Prisma/AWS/BullMQ hoặc `infrastructure/` |
| `prevents imports of another business module private layers` | Module A import `modules/B/services/...`, `modules/B/policies/...`, `modules/B/*.repo.ts` |
| `keeps business modules flat` | Tạo lại `api/`, `application/`, `domain/`, `infrastructure/` bên trong module |
| `assigns every Prisma model to an owning module` | Thêm model mới mà quên khai chủ sở hữu |
| `lets only the owning module touch its Prisma tables` | `licenses` gọi `prisma.employee` thay vì gọi facade của `organization` |
| `confines PrismaService to repository files` | Controller/policy/service tự query DB thay vì đi qua `*.repo.ts` |

**Tại sao ranh giới DB quan trọng nhất:** trong monolith, `PrismaService` cho phép mọi module đọc mọi bảng. Ranh giới import còn dễ thấy khi review, nhưng một dòng `prisma.employee.findMany()` lọt vào module `licenses` thì gần như không ai nhận ra — và sau 6 tháng, tách module trở thành bất khả thi. Test ownership là thứ chặn việc đó ngay từ commit đầu tiên.

---

## 5. Giải phẫu một feature module

Layout **phẳng**: file chính nằm ngay ở gốc module. Chỉ tạo thư mục con khi **thật sự có file cần bỏ vào**.

```text
src/modules/catalog/
├─ catalog.module.ts        ← khai báo DI, quyết định export gì
├─ catalog.controller.ts    ← chỉ HTTP: nhận DTO, gọi service, trả về
├─ catalog.service.ts       ← facade công khai: điều phối workflow
├─ catalog.repo.ts          ← NƠI DUY NHẤT được đụng PrismaService
├─ catalog.types.ts         ← type nội bộ của module
├─ catalog.constants.ts     ← error code, hằng số
├─ dto/                     ← DTO request/response HTTP (Zod)
├─ mappers/                 ← Prisma record → wire shape
├─ policies/                ← quyết định nghiệp vụ, test được, không cần HTTP/DB
├─ errors/                  ← lỗi nghiệp vụ của module (không phải HttpException)
└─ services/                ← use case riêng lẻ khi facade bắt đầu quá to
```

### Vai trò từng file

**`*.module.ts`** — quyết định cái gì công khai. `providers` là private mặc định; chỉ thứ nằm trong `exports` mới ra ngoài được. Chỉ export facade (`CatalogService`), **không bao giờ** export `CatalogRepo`.

**`*.controller.ts`** — chỉ làm 3 việc: khai báo route + OpenAPI, nhận DTO đã validate, gọi service. **Không** if/else nghiệp vụ, **không** đụng Prisma. Nếu controller dài hơn ~15 dòng cho một endpoint, logic đang nằm sai chỗ.

**`*.service.ts`** — facade công khai của module, là thứ module khác gọi. Nó *điều phối*: gọi repo, gọi policy, map kết quả, dịch lỗi nghiệp vụ sang lỗi HTTP.

> **Cấm:** facade chỉ gọi lại một hàm khác mà không thêm gì (`return this.policy.canDecide(ctx)`). Đó là pass-through wrapper — thêm một tầng để đọc, không thêm giá trị. Nếu chưa có gì để điều phối thì chưa cần facade.

**`*.repo.ts`** — nơi **duy nhất** trong module được inject `PrismaService`, và chỉ được đụng bảng mà module này sở hữu. Repo trả về record hoặc type nội bộ; nó **không** biết HTTP tồn tại.

**`policies/`** — quyết định nghiệp vụ thuần: "được duyệt request này không?". Nhận input thuần, trả kết quả thuần, không async, không DB, không HTTP. Đây là chỗ dễ test nhất và là chỗ nên chứa rule quan trọng nhất. Xem `access-requests/policies/approval.policy.ts` làm mẫu.

**`mappers/`** — chuyển Prisma record sang wire shape. `Date` → ISO string, `Decimal` → string, `BigInt` → string. **Không bao giờ** trả Prisma model thẳng ra HTTP.

---

## 6. Viết một vertical slice từ đầu — ví dụ đầy đủ

Làm theo thứ tự này. Mỗi bước nhỏ, có test, commit được.

Ví dụ: module `catalog`, hai endpoint — liệt kê và tạo application.

### Bước 1 — Xác nhận quyền sở hữu dữ liệu

Model `CatalogApplication` nằm ở `prisma/models/catalog.prisma`, và trong `PRISMA_MODEL_OWNER` (file `src/architecture-boundaries.spec.ts`) nó thuộc `catalog`. Nếu bạn thêm model mới, phải khai chủ sở hữu ở đó — nếu không test sẽ fail.

### Bước 2 — Type nội bộ

```ts
// src/modules/catalog/catalog.types.ts
export type CatalogApplicationStatus = 'ACTIVE' | 'INACTIVE' | 'UNDER_REVIEW';

/** Hình dạng record mà repository trả về. Chưa phải wire shape. */
export interface CatalogApplicationRecord {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  status: CatalogApplicationStatus;
  createdAt: Date;
}

/** Hình dạng gửi ra HTTP: chỉ dùng kiểu biểu diễn được trong JSON/OpenAPI. */
export interface CatalogApplicationWire {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  status: CatalogApplicationStatus;
  createdAt: string;
}
```

### Bước 3 — Error code và lỗi nghiệp vụ

```ts
// src/modules/catalog/catalog.constants.ts
export const CATALOG_ERROR_CODES = {
  applicationSlugTaken: 'CATALOG.APPLICATION_SLUG_TAKEN',
} as const;
```

```ts
// src/modules/catalog/errors/catalog.errors.ts
/** Lỗi nghiệp vụ thuần. Repository không được biết HTTP là gì. */
export class ApplicationSlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`Catalog application slug already exists: ${slug}`);
    this.name = 'ApplicationSlugTakenError';
  }
}
```

Error code phải **ổn định và máy đọc được**: `UPPER_SNAKE` có namespace, khớp regex `ERROR_CODE_PATTERN`. FE branch theo `code`, **không bao giờ** theo `message` — vì `message` có thể đổi bất cứ lúc nào.

### Bước 4 — Repository

```ts
// src/modules/catalog/catalog.repo.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CatalogApplicationRecord, CatalogApplicationStatus } from './catalog.types';
import { ApplicationSlugTakenError } from './errors/catalog.errors';

interface FindPageInput {
  page: number;
  pageSize: number;
  status?: CatalogApplicationStatus;
}

interface CreateInput {
  slug: string;
  name: string;
  vendor: string;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

@Injectable()
export class CatalogRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(input: FindPageInput): Promise<{ rows: CatalogApplicationRecord[]; totalItems: number }> {
    const where = input.status === undefined ? {} : { status: input.status };

    // $transaction để count và findMany đọc cùng một snapshot.
    const [rows, totalItems] = await this.prisma.$transaction([
      this.prisma.catalogApplication.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.catalogApplication.count({ where }),
    ]);

    return { rows, totalItems };
  }

  async create(input: CreateInput): Promise<CatalogApplicationRecord> {
    try {
      return await this.prisma.catalogApplication.create({ data: input });
    } catch (error) {
      // Dựa vào unique constraint của database, KHÔNG kiểm tra trước rồi insert sau.
      // Check-then-insert có race condition; unique index thì không.
      if (isUniqueConstraintViolation(error)) {
        throw new ApplicationSlugTakenError(input.slug);
      }
      throw error;
    }
  }
}
```

Ba điểm đáng học ở đây:

1. **Không check-then-insert.** Hai request đồng thời sẽ cùng vượt qua bước "kiểm tra chưa tồn tại" rồi cùng insert. Để database unique index quyết định, rồi dịch lỗi `P2002`.
2. **Repo ném lỗi nghiệp vụ**, không ném `HttpException`. Repo không biết gì về HTTP.
3. **Repo chỉ đụng bảng của module mình.** Cần tên phòng ban? Gọi facade của `organization`, đừng join sang bảng `employees`.

### Bước 5 — DTO HTTP

```ts
// src/modules/catalog/dto/catalog-application.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { successEnvelopeSchema } from '../../../infrastructure/http/dto/success-envelope.dto';

const catalogApplicationStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'UNDER_REVIEW']);

export const catalogApplicationSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  vendor: z.string(),
  status: catalogApplicationStatusSchema,
  createdAt: z.iso.datetime(),
});

export const catalogApplicationPageSchema = z.strictObject({
  items: z.array(catalogApplicationSchema),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});

export class CatalogApplicationResponseDto extends createZodDto(successEnvelopeSchema(catalogApplicationSchema)) {}
export class CatalogApplicationPageResponseDto extends createZodDto(
  successEnvelopeSchema(catalogApplicationPageSchema),
) {}
```

```ts
// src/modules/catalog/dto/list-applications.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Query string luôn là string, nên dùng z.coerce.
 * z.strictObject: gửi thừa field → 422, không im lặng bỏ qua.
 */
export const listApplicationsQuerySchema = z.strictObject({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['ACTIVE', 'INACTIVE', 'UNDER_REVIEW']).optional(),
});

export class ListApplicationsQueryDto extends createZodDto(listApplicationsQuerySchema) {}
```

```ts
// src/modules/catalog/dto/create-application.dto.ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createApplicationBodySchema = z.strictObject({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(80),
  name: z.string().trim().min(1).max(200),
  vendor: z.string().trim().min(1).max(200),
});

export class CreateApplicationBodyDto extends createZodDto(createApplicationBodySchema) {}
```

**Vì sao request và response là schema riêng:** request cần `coerce` và `default` (dữ liệu từ dây); response thì không, và response có field mà request không có (`id`, `createdAt`). Gộp chung sẽ tạo ra một schema sai ở cả hai đầu.

### Bước 6 — Mapper

```ts
// src/modules/catalog/mappers/catalog-application.mapper.ts
import { CatalogApplicationRecord, CatalogApplicationWire } from '../catalog.types';

export function toCatalogApplicationWire(record: CatalogApplicationRecord): CatalogApplicationWire {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    vendor: record.vendor,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  };
}
```

Mapper tồn tại để **một chỗ duy nhất** quyết định cái gì lộ ra ngoài. Trả Prisma model thẳng ra HTTP là cách rò rỉ field nội bộ nhanh nhất, và nó khiến đổi schema DB là breaking change cho FE.

### Bước 7 — Service (facade)

```ts
// src/modules/catalog/catalog.service.ts
import { HttpStatus, Injectable } from '@nestjs/common';
import { normalizePageSize } from '../../core/application/pagination';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { CATALOG_ERROR_CODES } from './catalog.constants';
import { CatalogRepo } from './catalog.repo';
import { CatalogApplicationStatus, CatalogApplicationWire } from './catalog.types';
import { ApplicationSlugTakenError } from './errors/catalog.errors';
import { toCatalogApplicationWire } from './mappers/catalog-application.mapper';

interface ListApplicationsInput {
  page: number;
  pageSize: number;
  status?: CatalogApplicationStatus;
}

interface CreateApplicationInput {
  slug: string;
  name: string;
  vendor: string;
}

interface CatalogApplicationPage {
  items: CatalogApplicationWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** Facade công khai của module catalog. Module khác chỉ được gọi class này. */
@Injectable()
export class CatalogService {
  constructor(private readonly repo: CatalogRepo) {}

  async listApplications(input: ListApplicationsInput): Promise<CatalogApplicationPage> {
    const pageSize = normalizePageSize(input.pageSize);
    const { rows, totalItems } = await this.repo.findPage({ ...input, pageSize });

    return {
      items: rows.map(toCatalogApplicationWire),
      pagination: {
        page: input.page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async createApplication(input: CreateApplicationInput): Promise<CatalogApplicationWire> {
    try {
      return toCatalogApplicationWire(await this.repo.create(input));
    } catch (error) {
      // Dịch lỗi nghiệp vụ sang lỗi HTTP tại đúng một chỗ: biên của module.
      if (error instanceof ApplicationSlugTakenError) {
        throw new ApiException(HttpStatus.CONFLICT, {
          code: CATALOG_ERROR_CODES.applicationSlugTaken,
          message: 'A catalog application with this slug already exists.',
          details: { slug: error.slug },
        });
      }
      throw error;
    }
  }
}
```

### Bước 8 — Controller

```ts
// src/modules/catalog/catalog.controller.ts
import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { CatalogService } from './catalog.service';
import { CatalogApplicationPageResponseDto, CatalogApplicationResponseDto } from './dto/catalog-application.dto';
import { CreateApplicationBodyDto } from './dto/create-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications.dto';

@ApiTags('catalog')
@Controller({ path: 'catalog-applications', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ operationId: 'catalogListApplications' })
  @ApiSuccessResponse(CatalogApplicationPageResponseDto, {
    description: 'A page of catalog applications.',
  })
  @ApiErrorResponses(
    { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The query parameters are invalid.' },
  )
  listApplications(@Query() query: ListApplicationsQueryDto) {
    return this.catalog.listApplications(query);
  }

  @Post()
  @ApiOperation({ operationId: 'catalogCreateApplication' })
  @ApiSuccessResponse(CatalogApplicationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'CATALOG.APPLICATION_CREATED',
    description: 'The catalog application was created.',
  })
  @ApiErrorResponses(
    { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required.' },
    { status: HttpStatus.CONFLICT, description: 'The slug is already used.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The request body is invalid.' },
  )
  createApplication(@Body() body: CreateApplicationBodyDto) {
    return this.catalog.createApplication(body);
  }
}
```

Controller không có một dòng logic nào. Đó là mục tiêu.

Chú ý `message: 'CATALOG.APPLICATION_CREATED'` — đây là **khoá localization**, không phải câu chữ hiển thị. FE dịch. Backend không trả tiếng Việt/tiếng Anh cho người dùng đọc, trừ template email/export do backend render.

### Bước 9 — Module

```ts
// src/modules/catalog/catalog.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { CatalogController } from './catalog.controller';
import { CatalogRepo } from './catalog.repo';
import { CatalogService } from './catalog.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogRepo],
  exports: [CatalogService], // CatalogRepo KHÔNG được export.
})
export class CatalogModule {}
```

### Bước 10 — Ghép vào composition root

```ts
// src/app.module.ts — chỉ thêm một dòng vào mảng imports
    CatalogModule,
```

`AppModule` chỉ được làm đúng việc này: liệt kê module. Không config, không guard, không quyết định nghiệp vụ.

---

## 7. Hợp đồng HTTP

### Envelope thành công

```json
{ "success": true, "message": "COMMON.SUCCESS", "data": { } }
```

Tự động do `SuccessEnvelopeInterceptor` bọc. Controller chỉ cần `return data`.

### Envelope lỗi

```json
{
  "success": false,
  "error": {
    "code": "CATALOG.APPLICATION_SLUG_TAKEN",
    "message": "A catalog application with this slug already exists.",
    "details": { "slug": "figma" },
    "requestId": "0f9c..."
  }
}
```

`requestId` luôn có, đối chiếu được với log. Khi user báo lỗi, xin `requestId` là tìm ra ngay log tương ứng.

### Quy tắc bắt buộc

| Chủ đề | Luật |
| --- | --- |
| Base path | `/api/v1`, resource số nhiều kebab-case (`catalog-applications`) |
| Validation | Zod 4 qua `nestjs-zod`. Không dùng `class-validator`. Request dùng `z.strictObject` |
| Thời gian | Lưu UTC; trên dây là ISO-8601 string, không phải `Date` |
| Số tiền | `Decimal` trong DB, string trên dây. **Không dùng JS `number` cho tiền** |
| Error code | `UPPER_SNAKE` có namespace, ổn định. FE branch theo code, không theo message |
| `message` | Khoá localization (`COMMON.SUCCESS`), không phải câu hiển thị |
| Ngoại lệ | Stream/redirect/file/204 được phép bỏ envelope, nhưng phải document và test rõ |

---

## 8. Xác thực và phân quyền

- **OIDC là giao thức đăng nhập.** API chỉ verify **access token** (JWT). Không dùng ID token để gọi API.
- **Deny-by-default.** `AuthenticationGuard` là guard toàn cục. Mọi endpoint đều cần token, trừ khi có `@Public()`.
- Thêm `@Public()` là một **quyết định bảo mật** — phải được review, không phải cách nhanh để test cho qua.
- Guard verify chữ ký, `issuer`, `audience`, thuật toán `RS256`, rồi gắn `ExternalIdentity` (`issuer`, `subject`, `email`) vào request.
- **Danh tính ngoài ≠ quyền trong hệ thống.** `ExternalIdentity` chỉ nói "đây là ai theo IdP". Role, scope, trạng thái active, quy tắc phân quyền nội bộ nằm ở PostgreSQL, thuộc module `identity-access`. **Không bao giờ tin claim role do client gửi.**
- Không thêm password auth làm phương án dự phòng, không tạo engine AND/OR auth-mode cho nhu cầu giả định.

Lấy danh tính trong controller:

```ts
import { CurrentExternalIdentity } from '../../infrastructure/security/models/current-principal';
import type { ExternalIdentity } from '../../infrastructure/security/tokens/access-token-verifier.port';

@Post()
createApplication(@Body() body: CreateApplicationBodyDto, @CurrentExternalIdentity() identity: ExternalIdentity) {
  return this.catalog.createApplication(body, identity.subject);
}
```

---

## 9. Dữ liệu, transaction và nhất quán

- **PostgreSQL là nguồn sự thật duy nhất.** Redis chỉ dùng cho job/lock/rate-limit — **không** lưu bản ghi nghiệp vụ ở Redis.
- Prisma schema chia nhiều file theo domain trong `prisma/models/`. Nhóm model theo module sở hữu.
- **Constraint ở database vẫn bắt buộc.** Validation ở application không thay thế được foreign key, unique index, check constraint.
- **Một use case = một transaction boundary.** Cần ghi nhiều bảng nguyên tử thì bọc trong `$transaction`, đừng dựa vào may mắn.
- Ghi cross-module cần nguyên tử: facade phải nhận transaction context tường minh. Đừng giả vờ hai lệnh ghi rời rạc là nguyên tử.
- Side effect không quyết định kết quả chính (audit, notification) là **eventually consistent** — đừng nhét vào transaction chính.
- **Không hard-delete** audit event, approval decision, financial fact.
- Migration được commit. Production chỉ chạy `migrate deploy` trong release step, **không** chạy `migrate dev` lúc app khởi động.

---

## 10. File và background job

- Business code phụ thuộc `ObjectStoragePort`, **không** phụ thuộc AWS SDK. MinIO cho local/test, Cloudflare R2 cho production — cùng một adapter S3-compatible.
- **Bucket là private.** Phân quyền xong mới cấp presigned URL, và URL phải ngắn hạn.
- Object key do `ObjectKeyFactory` sinh, **không** lấy từ tên file người dùng gửi. Tên file người dùng là dữ liệu không tin cậy (path traversal).
- Coi mọi thứ sau đây là **không tin cậy**: tên file, MIME type, nội dung file, từng ô CSV/XLSX, payload trong queue.
- **Mọi job có retry phải idempotent** và lưu trạng thái quan trọng ở PostgreSQL. Job chạy lại lần hai không được tạo ra hiệu ứng lần hai.
- BullMQ dành cho việc chậm/cần retry. **Không dùng queue để né một ranh giới thiết kế sai.**

> Hiện tại BullMQ chưa được nối producer/consumer — có ý đồ, không phải thiếu sót. Xem `ARCHITECTURE.md` mục 16.

---

## 11. Chiến lược test

| Loại | Test cái gì | Ví dụ trong repo |
| --- | --- | --- |
| Unit | Policy, hàm thuần, mapper — không HTTP, không DB | `approval.policy.spec.ts`, `pagination.spec.ts` |
| Architecture | Ranh giới module và quyền sở hữu bảng | `architecture-boundaries.spec.ts` |
| Integration | Adapter chạm hạ tầng thật | (thêm khi có adapter thật) |
| E2E | Luồng quan trọng qua HTTP thật | `test/app.e2e-spec.ts` |

Nguyên tắc:

- **Viết/cập nhật test trước khi đổi hành vi.** Xem test fail trước, để biết nó thật sự kiểm tra được cái gì.
- Test phải fail vì lý do đúng. Một test luôn xanh kể cả khi code sai là **tệ hơn không có test** — nó tạo cảm giác an toàn giả.
- **Không được nới lỏng** validation, CORS, phân quyền, giới hạn file hay rate limit chỉ để test đi qua. Nếu test đòi bạn làm vậy, test hoặc thiết kế đang sai.
- Auth trong test dùng principal giả đã ký; chỉ E2E auth chuyên biệt mới cần Keycloak thật.

Lệnh:

```bash
pnpm test                       # unit + architecture
pnpm test -- approval.policy    # chạy một file
pnpm test:e2e                   # E2E
pnpm check                      # format + lint + prisma validate + typecheck + test + build
```

---

## 12. Checklist trước khi mở PR

- [ ] Code đặt đúng vùng: `core/` thuần, `infrastructure/` không biết nghiệp vụ, `modules/` phẳng.
- [ ] Chỉ `*.repo.ts` đụng `PrismaService`, và chỉ đụng bảng module mình sở hữu.
- [ ] Module chỉ export facade; repo/policy/dto vẫn private.
- [ ] Request DTO và response DTO tách riêng; không trả Prisma model ra HTTP.
- [ ] `Date`/`Decimal`/`BigInt` đã map sang ISO/string trong mapper.
- [ ] Endpoint mới có `@ApiSuccessResponse` với DTO envelope đầy đủ, và `@ApiErrorResponses` cho các mã lỗi thực tế.
- [ ] Endpoint ẩn danh có `@Public()` và đã được review bảo mật.
- [ ] Error code ổn định, có namespace; `message` là khoá localization.
- [ ] Test viết trước, đã thấy nó fail, giờ đã pass.
- [ ] `pnpm check` xanh.
- [ ] Nếu ranh giới hoặc quyết định kiến trúc thay đổi: đã cập nhật `ARCHITECTURE.md` và ADR tương ứng.

---

## 13. Anti-pattern — dấu hiệu code đang sai chỗ

| Dấu hiệu | Vì sao sai | Làm đúng |
| --- | --- | --- |
| `prisma.employee` trong module `licenses` | Phá quyền sở hữu dữ liệu; sau này không tách được | Gọi facade của `organization` |
| Facade chỉ `return this.policy.x(input)` | Pass-through wrapper, thêm tầng không thêm giá trị | Bỏ facade cho đến khi có gì để điều phối |
| `if` nghiệp vụ trong controller | Logic tản mát, không test được nếu không dựng HTTP | Đưa vào service hoặc policy |
| Tạo `api/`, `application/`, `domain/` trong module | Kiến trúc trang trí; đọc một tính năng phải mở 5 thư mục | Giữ layout phẳng |
| `forwardRef()` để chữa circular dependency | Che giấu lỗi phân chia trách nhiệm | Xem lại ownership hoặc nâng orchestration lên module cao hơn |
| Trả Prisma model thẳng ra HTTP | Rò field nội bộ; đổi DB thành breaking change cho FE | Dùng mapper + response DTO |
| Tạo `utils/` hoặc `common/` chứa logic nghiệp vụ | Bãi rác, không ai sở hữu | Đặt vào module sở hữu nghiệp vụ đó |
| Base controller/service/repository generic | Trừu tượng sai, chặn từng module tiến hoá riêng | Viết cụ thể cho từng module |
| Check-then-insert để chống trùng | Race condition | Dùng unique constraint + dịch lỗi `P2002` |
| Scaffold hàng loạt folder rỗng cho 11 module | Cấu trúc rỗng không chứng minh được gì | Làm từng vertical slice hoàn chỉnh |
| Nới validation/CORS/authz cho test pass | Biến lỗ hổng bảo mật thành vĩnh viễn | Sửa test hoặc sửa thiết kế |

---

## 14. Đọc tiếp

| Cần gì | Đọc file nào |
| --- | --- |
| Thiết kế hệ thống đầy đủ, bảng sở hữu module | `ARCHITECTURE.md` |
| Luật ngắn gọn cho người/AI đóng góp code | `AGENTS.md` |
| Lý do chọn modular monolith | `docs/decisions/0001-modular-monolith.md` |
| Lý do chọn Zod + auth mặc định | `docs/decisions/0002-zod-http-contract-and-auth-defaults.md` |
| Lý do layout module phẳng | `docs/decisions/0003-flat-feature-module-layout.md` |
| Quy ước thư mục `docs/` | `docs/README.md` |
| Mẫu policy đã có test | `src/modules/access-requests/policies/approval.policy.ts` |
| Ranh giới được enforce thế nào | `src/architecture-boundaries.spec.ts` |
