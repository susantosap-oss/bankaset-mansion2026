export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class MappingNotFoundError extends DomainError {
  constructor(bankName: string) {
    super(`No mapping found for bank: ${bankName}`, 'MAPPING_NOT_FOUND');
  }
}

export class ImportValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'IMPORT_VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super('Unauthorized', 'UNAUTHORIZED');
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND');
  }
}
