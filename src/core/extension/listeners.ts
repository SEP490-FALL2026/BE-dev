/**
 * An extension point with zero or more listeners that run, in order, inside the transaction of the module that emits.
 *
 * A listener may refuse by throwing: the emitter's transaction then rolls back, exactly as if the emitter had failed.
 * That is why this is not an asynchronous event bus. `Tx` is the emitter's transaction client (`DbTx` in modules).
 * Declared like `Hook`: a provider class in the emitter's `public/<module>.extension-points.ts`, one per application.
 */
export class Listeners<E, Tx> {
  private readonly items: Array<{ name: string; handle: (tx: Tx, event: E) => Promise<void> }> = [];

  constructor(readonly name: string) {}

  add(name: string, handle: (tx: Tx, event: E) => Promise<void>): void {
    if (this.items.some((item) => item.name === name)) {
      throw new Error(`Listener ${name} is already added to ${this.name}`);
    }
    this.items.push({ name, handle });
  }

  async emit(tx: Tx, event: E): Promise<void> {
    for (const item of this.items) await item.handle(tx, event);
  }

  names(): string[] {
    return this.items.map((item) => item.name);
  }
}
