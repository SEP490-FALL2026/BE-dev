-- The IT Admin removes one person who left from the line of a request for a group (g5-group-requests and g6-leaver-request-closure, US-03-04
-- AC-25, US-05-17). A value added to an enum cannot be used in the transaction that adds it, so the column, the constraints and the move of
-- the state machine that use it come in the next migration.

-- The line of a person who left was closed by the IT Admin: not refused, not failed, not withdrawn, not left out of a file.
ALTER TYPE "AccessRequestLineState" ADD VALUE 'CANCELLED';
