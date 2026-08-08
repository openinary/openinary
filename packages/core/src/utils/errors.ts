class ApplicationError extends Error {
  name = "Application Error";
  code;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code || 500;
  }
}

class ValidationError extends ApplicationError {
  name = "ValidationError";

  constructor(message: string, code?: number) {
    super(message, code || 400);
  }
}

class TransformationError extends ApplicationError {
  name = "TransformationError";

  constructor(message: string, code?: number) {
    super(message, code);
  }
}

class TransformationIncompleteError extends ApplicationError {
  name = "TransformationIncompleteError";

  constructor(message: string, code?: number) {
    super(message, code || 202);
  }
}
