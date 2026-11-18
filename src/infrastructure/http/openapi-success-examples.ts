/**
 * The internal response extension that carries the success `message` from `@ApiSuccessResponse` to the document. It
 * never reaches the published document: `withSuccessMessageExamples` consumes it.
 */
export const SUCCESS_MESSAGE_EXTENSION = 'x-success-message';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

type Media = { schema?: unknown } & Record<string, unknown>;
type Response = { content?: Record<string, Media> } & Record<string, unknown>;

/**
 * Shows the declared success `message` of every response that carries it: the JSON schema becomes
 * `allOf: [<the DTO reference>, { properties: { message: { example } } }]` — the DTO stays the one source of `success` and
 * `data`, and only the example of `message` is added. Returns a new document; the input is unchanged.
 */
export function withSuccessMessageExamples<T extends { paths: object }>(document: T): T {
  const result = structuredClone(document);
  for (const item of Object.values(result.paths as Record<string, Record<string, unknown>>)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method] as { responses?: Record<string, Response> } | undefined;
      for (const response of Object.values(operation?.responses ?? {})) {
        if (!Object.hasOwn(response, SUCCESS_MESSAGE_EXTENSION)) continue;
        const message = response[SUCCESS_MESSAGE_EXTENSION];
        delete response[SUCCESS_MESSAGE_EXTENSION];
        const media = response.content?.['application/json'];
        if (!media?.schema) continue;
        media.schema = { allOf: [media.schema, { properties: { message: { example: message } } }] };
      }
    }
  }

  return result;
}
