-- The structural sample of the first baseline (never mounted on HTTP, never holding business data) is replaced by
-- the real catalog of g3-catalog-foundation. Drop it so the new tables start from a clean schema.

-- DropTable
DROP TABLE "catalog_applications";

-- DropEnum
DROP TYPE "CatalogApplicationStatus";
