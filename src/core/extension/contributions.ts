/**
 * An extension point where higher modules contribute 0..n implementations that answer with a value, and the module that
 * opens the point calls them and combines the answers (e.g. "what keeps this department in use?", "what blocks this
 * departure?"). `Listeners` is the variant for events that answer nothing.
 * Declared like `Hook`: a provider class in the opener's `public/<module>.extension-points.ts`, one per application.
 */
export class Contributions<T> {
  private readonly items: Array<{ name: string; impl: T }> = [];

  constructor(readonly name: string) {}

  add(name: string, impl: T): void {
    if (this.items.some((item) => item.name === name)) {
      throw new Error(`Contribution ${name} is already added to ${this.name}`);
    }
    this.items.push({ name, impl });
  }

  /** The implementations in the order they were added. */
  all(): readonly T[] {
    return this.items.map((item) => item.impl);
  }

  names(): string[] {
    return this.items.map((item) => item.name);
  }
}
