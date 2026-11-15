import request from 'supertest';
import type { ApiAccount } from './api-accounts';
import { declareApplication, declarePlan, declareSubscription } from './builders/catalog.builder';
import { DocumentHarness } from './document-harness';

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

export interface ContractWire {
  id: string;
  name: string;
  number: string | null;
  vendor: { id: string; name: string } | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  subscriptionCount: number;
  createdAt: string;
  updatedAt: string;
  note?: string | null;
  createdBy?: string;
  subscriptions?: Array<{
    subscriptionId: string;
    provisioningType: string;
    applicationId: string;
    logoUrl: string | null;
  }>;
  documents?: Array<{ id: string; purpose: string; fileName: string }>;
  applicationIds?: string[];
  truncated?: { subscriptions: boolean; documents: boolean; applicationIds: boolean };
}

export interface ContractPage {
  items: ContractWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** The contract routes on top of the document harness, and the subscriptions of one vendor a link needs. */
export class ContractHarness extends DocumentHarness {
  listContracts = (query: Record<string, string | number> = { pageSize: 100 }, account: ApiAccount = this.it1) =>
    request(this.server()).get('/api/v1/contracts').query(query).set(this.as(account));
  updateContract = (id: string, body: object, account: ApiAccount = this.it1) =>
    request(this.server()).patch(`/api/v1/contracts/${id}`).set(this.as(account)).send(body);
  linkSubscription = (id: string, subscriptionId: string, account: ApiAccount = this.it1) =>
    request(this.server()).post(`/api/v1/contracts/${id}/subscriptions`).set(this.as(account)).send({ subscriptionId });
  unlinkSubscription = (id: string, subscriptionId: string, account: ApiAccount = this.it1) =>
    request(this.server()).delete(`/api/v1/contracts/${id}/subscriptions/${subscriptionId}`).set(this.as(account));

  /** The contract as the detail shows it, for the IT Admin unless another asks. */
  async contractOf(id: string, account: ApiAccount = this.it1): Promise<ContractWire> {
    return this.dataOf<{ contract: ContractWire }>(await this.getContract(id, account).expect(200)).contract;
  }

  /** A contract with the fields given on top of a vendor and a day, the id answered. */
  async contractWith(body: Record<string, unknown>): Promise<string> {
    const vendorId = await this.vendorNamed('Contract Vendor');

    return this.dataOf<{ contract: { id: string } }>(
      await this.createContract({ name: 'Hợp đồng', vendorId, effectiveFrom: this.today(), ...body }).expect(201),
    ).contract.id;
  }

  /**
   * A subscription of a new application of the vendor named (the vendor is made once for the name), of a plan of the kind of provisioning
   * given: its id and the id of the vendor. A K4 plan is of licensed software and a purchase for good.
   */
  async subscriptionOfVendor(
    vendorName: string,
    type: 'K1' | 'K2' | 'K4',
  ): Promise<{ subscriptionId: string; vendorId: string; applicationId: string; planId: string }> {
    const token = this.it1.accessToken;
    const applicationId = await declareApplication(this.ctx, token, {
      name: this.unique('App'),
      kind: type === 'K4' ? 'LICENSED' : 'SAAS',
      vendorName,
      dataSensitivity: 'LOW',
      communication: NO,
    });
    const planId = await declarePlan(this.ctx, token, {
      applicationId,
      name: this.unique('Plan'),
      provisioningType: type,
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });
    const subscriptionId = await declareSubscription(this.ctx, token, {
      ownerDepartmentId: this.seed.departmentId,
      planId,
      kind: type === 'K4' ? 'PERPETUAL' : 'TERM',
      unitPrice: { amount: '1000000', currency: 'VND' },
      ...(type === 'K4' ? {} : { billingCycle: 'MONTHLY' }),
      startDate: '2026-01-05',
      purchasedQuantity: 10,
    });
    const { rows } = await this.ctx.sql.query<{ vendor_id: string }>(
      `SELECT vendor_id FROM applications WHERE id = $1`,
      [applicationId],
    );

    return { subscriptionId, vendorId: rows[0].vendor_id, applicationId, planId };
  }
}
