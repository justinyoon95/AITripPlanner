export function dollarsToCents(amount: number) {
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number.");
  }

  return Math.round(amount * 100);
}

export function centsToDollars(cents: number) {
  if (!Number.isInteger(cents)) {
    throw new Error("Cents must be an integer.");
  }

  return cents / 100;
}
