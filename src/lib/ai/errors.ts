export class GenerationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
