-- The kind of request that asks for a seat for a group of people of one department (g5-group-requests, US-05-17). A value added
-- to an enum cannot be used in the transaction that adds it, so the tables, the constraints and the rules that use this value
-- come in the next migration. Like every added value it cannot be taken away again (DB-05).

ALTER TYPE "AccessRequestType" ADD VALUE 'GROUP_GRANT';
