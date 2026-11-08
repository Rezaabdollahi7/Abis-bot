/**
 * Money in this project is always an integer amount of Toman (see RULES.md).
 * The brand stops a plain number (e.g. a quantity) from being passed where money is expected.
 */
export type Toman = number & { readonly __brand: 'Toman' };

export function toman(amount: number): Toman {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Toman amount must be a safe integer, got ${amount}`);
  }
  return amount as Toman;
}

const formatter = new Intl.NumberFormat('fa-IR');

/** Formats for Persian UI, e.g. 800000 → "۸۰۰٬۰۰۰ تومان". */
export function formatToman(amount: Toman): string {
  return `${formatter.format(amount)} تومان`;
}
