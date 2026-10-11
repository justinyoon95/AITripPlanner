export function requirePaidOptIn(value: string | undefined) {
  if (value !== "yes")
    throw new Error(
      "Paid calls disabled. Explicitly set AI_EVAL_ALLOW_PAID=yes to run this command.",
    );
}
