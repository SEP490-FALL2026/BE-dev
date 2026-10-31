/**
 * An extension point with exactly one implementation, opened by a lower module and bound by a higher one.
 *
 * The lower module declares a provider class in its `public/<module>.extension-points.ts`, e.g.
 * `@Injectable() export class GrantRequestGateHook extends Hook<GrantRequestGate> { constructor() { super('…'); } }`,
 * and exports it. The higher module injects it and binds once from `onModuleInit` in its `<name>.listener.ts`.
 * One instance per Nest application, so tests that build several applications in one process never share a binding.
 *
 * Unbound, `get()` fails with the hook's name. There is no stand-in answer: the gate `extension-wiring` proves, for every
 * process graph, that a binder is present wherever something uses the hook, and a graph that may lack one is listed there
 * with the reason its code never reaches the hook.
 */
export class Hook<T> {
  private impl?: T;

  constructor(readonly name: string) {}

  bind(impl: T): void {
    if (this.impl) throw new Error(`Hook ${this.name} is already bound`);
    this.impl = impl;
  }

  get(): T {
    if (this.impl === undefined) throw new Error(`Hook ${this.name} is not bound`);
    return this.impl;
  }

  isBound(): boolean {
    return this.impl !== undefined;
  }
}
