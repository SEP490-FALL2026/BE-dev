-- The states of a request while its grant is carried out and when it ends (US-07-01, US-05-15 AC-5). A request is granted
-- once: the move to EXECUTING is made in the transaction of the grant, under the lock of the request.
ALTER TYPE "AccessRequestState" ADD VALUE 'EXECUTING';
ALTER TYPE "AccessRequestState" ADD VALUE 'COMPLETED';
ALTER TYPE "AccessRequestState" ADD VALUE 'FAILED';
