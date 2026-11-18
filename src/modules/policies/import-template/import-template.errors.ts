/** No module has told the library what the columns of this kind of file are, so there is no template to give. */
export class ImportTemplateNotAvailableError extends Error {
  constructor() {
    super('There is no template of this kind of file.');
    this.name = 'ImportTemplateNotAvailableError';
  }
}

/** The caller does not do this import, so the template of its file is not for them. */
export class ImportTemplateForbiddenError extends Error {
  constructor() {
    super('This template is for the people who do that import.');
    this.name = 'ImportTemplateForbiddenError';
  }
}

/** The kind has a template, but not in the format asked: the parser of that file does not read it. */
export class ImportTemplateFormatNotSupportedError extends Error {
  constructor(readonly formats: readonly string[]) {
    super(`This file is read in ${formats.join(' or ')} only.`);
    this.name = 'ImportTemplateFormatNotSupportedError';
  }
}

/** A module gave a definition whose example rows do not fit its columns: a mistake in the code of that module, never an answer to a caller. */
export class ImportTemplateDefinitionError extends Error {
  constructor(kind: string, problems: readonly string[]) {
    super(`The template of ${kind} is not well formed: ${problems.join('; ')}`);
    this.name = 'ImportTemplateDefinitionError';
  }
}
