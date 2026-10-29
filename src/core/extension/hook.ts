/**
 * An extension point with exactly one implementation, opened by a lower module and bound by a higher one.
 *
 * The lower module declares a provider class in its `public/<module>.extension-points.ts`, e.g.
 * `@Injectable() export class GrantRequestGateHook extends Hook<GrantRequestGate> { constructor() { super('…'); } }`,
 * and exports it. The higher module injects it and binds once from `onModuleInit` in its `<name>.listener.ts`.
 * One instance per Nest application, so tests that build several applications in one process never share a binding.
 *
 * Unbound, `get()` fails with the hook's name. A hook that must answer in a graph without the higher module (a CLI that
 * loads only part of the application) declares that answer as its `whenUnbound` value, next to its name, so the
 * behaviour is visible where the hook is declared instead of hidden in a "refusing" stand-in class.
 */
export class Hook<T> {
  private impl?: T;

  constructor(
    readonly name: string,
    private readonly whenUnbound?: T,
  ) {}

  bind(impl: T): void {
    if (this.impl) throw new Error(`Hook ${this.name} is already bound`);
    this.impl = impl;
  }

  get(): T {
    const impl = this.impl ?? this.whenUnbound;
    if (impl === undefined) throw new Error(`Hook ${this.name} is not bound`);
    return impl;
  }

  isBound(): boolean {
    return this.impl !== undefined;
  }

  /** Bound, or declared with a `whenUnbound` answer. */
  canAnswer(): boolean {
    return this.impl !== undefined || this.whenUnbound !== undefined;
  }
}

/** Throws once, naming every hook that is still unbound and has no `whenUnbound` answer. */
export function assertHooksBound(hooks: readonly Hook<unknown>[]): void {
  const missing = hooks.filter((hook) => !hook.canAnswer()).map((hook) => hook.name);
  if (missing.length) throw new Error(`Hooks not bound: ${missing.join(', ')}`);
}
