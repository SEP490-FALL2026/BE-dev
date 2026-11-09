-- QĐ-104 removed the Business Owner: an application is declared without one. The column stays (older rows keep the person they
-- named and are still read); only NOT NULL goes. No row is changed, so it runs on a database that holds data. The foreign key stays.
ALTER TABLE "applications" ALTER COLUMN "business_owner_employee_id" DROP NOT NULL;
