export class ApplicationError extends Error {
  name = "Application Error";
  code;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code || 500;
  }
}

export class ValidationError extends ApplicationError {
  name = "ValidationError";

  constructor(message: string, code?: number) {
    super(message, code || 400);
  }
}

export class TransformationError extends ApplicationError {
  name = "TransformationError";

  constructor(message: string, code?: number) {
    super(message, code);
  }
}

export class TransformationIncompleteError extends ApplicationError {
  name = "TransformationIncompleteError";

  constructor(message: string, code?: number) {
    super(message, code || 202);
  }
}
