import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { ImportTemplateForbiddenError, ImportTemplateNotAvailableError } from './import-template.errors';

/** Maps the errors of the template route to their HTTP answers; a template that is not well formed is a 500 for the code to fix, not a refusal. */
export function toImportTemplateApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof ImportTemplateNotAvailableError) {
    return new ApiException(HttpStatus.NOT_FOUND, { code: 'IMPORT_TEMPLATE.NOT_FOUND', message: error.message });
  }
  if (error instanceof ImportTemplateForbiddenError) {
    return new ApiException(HttpStatus.FORBIDDEN, { code: 'AUTHORIZATION.FORBIDDEN', message: error.message });
  }

  return toUnavailableApiException(error) ?? error;
}

export const IMPORT_TEMPLATE_ERROR_EXAMPLES = {
  NOT_FOUND: errorExampleOf(toImportTemplateApiException(new ImportTemplateNotAvailableError())),
  FORBIDDEN: errorExampleOf(toImportTemplateApiException(new ImportTemplateForbiddenError())),
} as const;
