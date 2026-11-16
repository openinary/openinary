/** The request is malformed: answered 400. */
export class ValidationError extends Error {
  name = "ValidationError";
}

/** The requested original does not exist: answered 404. */
export class NotFoundError extends Error {
  name = "NotFoundError";
}
