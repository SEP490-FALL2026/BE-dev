import { SetMetadata } from '@nestjs/common';

/** A Symbol, like every other metadata key here, so it cannot collide with a library's. */
export const RAW_RESPONSE_METADATA = Symbol('RAW_RESPONSE_METADATA');

/**
 * Opt a handler out of the `{ success, message, data }` envelope.
 *
 * For responses that are not JSON documents: file downloads, streams, redirects and 204s.
 * Do NOT use it to avoid declaring a response DTO — an endpoint that returns JSON must stay
 * enveloped, so the published contract keeps describing what clients actually receive.
 */
export const RawResponse = (): MethodDecorator => SetMetadata(RAW_RESPONSE_METADATA, true);
