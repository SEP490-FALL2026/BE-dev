import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { WithdrawnRevocation, WithdrawRevocationInput } from '../../public/licensing.types';
import { RevocationWithdrawalService } from './revocation-withdrawal.service';

/**
 * Entry point for sibling provisioning groups to withdraw a standing revocation reason within the caller transaction.
 */
@Injectable()
export class ForRevocationWithdrawalService {
  constructor(private readonly withdrawals: RevocationWithdrawalService) {}

  withdraw(tx: DbTx, actor: AuthenticatedPrincipal, input: WithdrawRevocationInput): Promise<WithdrawnRevocation> {
    return this.withdrawals.withdraw(tx, actor, input);
  }
}
