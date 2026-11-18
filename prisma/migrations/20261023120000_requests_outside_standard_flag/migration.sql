-- Whether the plan was outside the standard toolset of the department and job title of the sender on the day the request
-- was sent (US-05-04 AC-7). It is fixed then: a toolset changed later reaches only what is sent after it (US-04-10 AC-5).
ALTER TABLE "access_requests" ADD COLUMN "outside_standard" BOOLEAN NOT NULL DEFAULT false;
