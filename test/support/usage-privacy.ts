/** The properties that would tell who a person is or look like them: no response of the usage has one (`QĐ-111aw`, `OQ-03`). */
const FORBIDDEN_KEY = /^(fullName|avatar|avatarUrl|photo|photoUrl|picture|workPhone)$/i;

/** Every property name below `value`, at any depth. */
export function keysOf(value: unknown): string[] {
  const keys = new Set<string>();
  const walk = (current: unknown): void => {
    if (Array.isArray(current)) current.forEach(walk);
    else if (current !== null && typeof current === 'object') {
      for (const [key, inner] of Object.entries(current)) {
        keys.add(key);
        walk(inner);
      }
    }
  };
  walk(value);

  return [...keys];
}

/**
 * What a response of the usage carries that it must not: a property named like a full name or a photo, and the full names the suite knows
 * (as text, wherever they might hide). The code of a person and their work email are allowed. Empty when the response is clean.
 */
export function personalLeaksIn(body: unknown, fullNames: readonly string[]): string[] {
  const text = JSON.stringify(body);

  return [
    ...keysOf(body)
      .filter((key) => FORBIDDEN_KEY.test(key))
      .map((key) => `property ${key}`),
    ...fullNames.filter((name) => text.includes(name)).map((name) => `name ${name}`),
  ];
}
