/**
 * What a request is priced by and what a seat sits on is the subscription of the department the request is of, never another's
 * (F38 and spec L.8; F20, `QĐ-89a`). The subscriptions a suite buys through the harness belong to the seeded department, while the
 * departments the suite makes are many: this gives each department a subscription of every plan the seeded one holds (same price
 * and seats), and says which of them a grant of a request of that department is made on. It writes nothing itself: the harness hands
 * it the function that creates a subscription. No assertion lives here.
 */
export class OwnedSubscriptions {
  /** The plans the seeded department's subscriptions are of, with the seats each bought (null: flat rate). */
  private readonly shared = new Map<string, number | null>();
  /** The subscription of the seeded department -> its plan. */
  private readonly planOfSeed = new Map<string, string>();
  /** `${subscription of the seeded department}:${department}` -> the subscription that department owns of the same plan. */
  private readonly own = new Map<string, string>();
  /** The department each request made through the harness is of. */
  private readonly departmentOf = new Map<string, string>();
  private readonly departments: string[] = [];

  /** `create` posts the body of a subscription and returns its id. */
  constructor(private readonly create: (body: object) => Promise<string>) {}

  /** The seeded department bought this subscription of the plan; departments made from now on, and before, own one of the same. */
  async recordSeed(subscriptionId: string, planId: string, seats: number | null): Promise<void> {
    this.shared.set(planId, seats);
    this.planOfSeed.set(subscriptionId, planId);
    for (const departmentId of this.departments) await this.giveOne(subscriptionId, planId, departmentId, seats);
  }

  /** A department the suite made owns a subscription of every plan the seeded department holds. */
  async give(departmentId: string): Promise<void> {
    this.departments.push(departmentId);
    for (const [subscriptionId, planId] of this.planOfSeed) {
      await this.giveOne(subscriptionId, planId, departmentId, this.shared.get(planId) ?? null);
    }
  }

  noteRequest(requestId: string, departmentId: string): void {
    this.departmentOf.set(requestId, departmentId);
  }

  /** The subscription the department owns in place of the one of the seeded department, or the one given when it owns none. */
  subscriptionFor(subscriptionId: string, departmentId: string): string {
    return this.own.get(`${subscriptionId}:${departmentId}`) ?? subscriptionId;
  }

  /** The body of a grant, on the subscription of the department of the request when the request was made through the harness. */
  grantBody<T extends object>(body: T): T {
    const given = body as { requestId?: string; subscriptionId?: string };
    const department = given.requestId === undefined ? undefined : this.departmentOf.get(given.requestId);
    if (given.subscriptionId === undefined || department === undefined) return body;

    return { ...body, subscriptionId: this.subscriptionFor(given.subscriptionId, department) };
  }

  private async giveOne(
    subscriptionId: string,
    planId: string,
    departmentId: string,
    seats: number | null,
  ): Promise<void> {
    const key = `${subscriptionId}:${departmentId}`;
    if (this.own.has(key)) return;
    this.own.set(
      key,
      await this.create({
        ownerDepartmentId: departmentId,
        planId,
        kind: 'TERM',
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-01-05',
        ...(seats === null ? {} : { purchasedQuantity: seats }),
      }),
    );
  }
}
