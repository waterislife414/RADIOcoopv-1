/** Pure invoice math. Used by the admin builder (preview) and the server (authoritative). Integer cents only. */

export type LineType = 'part' | 'labor' | 'fee' | 'supply' | 'discount';

export type LineInput = {
  type: LineType;
  description: string;
  /** Hours for labor, count for everything else. Up to 2 decimals. */
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

export type TaxRules = {
  ratePpm: number; // 9.75% = 97500
  partsTaxable: boolean;
  laborTaxable: boolean;
  feesTaxable: boolean;
};

export type Totals = {
  partsCents: number;
  laborCents: number;
  feesCents: number;
  suppliesCents: number;
  discountCents: number; // positive number representing the discount amount
  subtotalCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
};

export const LINE_TYPE_LABEL: Record<LineType, string> = {
  part: 'Part',
  labor: 'Labor',
  fee: 'Fee',
  supply: 'Shop supplies',
  discount: 'Discount',
};

export function lineTotalCents(line: Pick<LineInput, 'type' | 'quantity' | 'unitPriceCents'>): number {
  const raw = Math.round(line.quantity * line.unitPriceCents);
  return line.type === 'discount' ? -Math.abs(raw) : raw;
}

export function defaultTaxable(type: LineType, rules: Omit<TaxRules, 'ratePpm'>): boolean {
  switch (type) {
    case 'part':
    case 'supply':
      return rules.partsTaxable;
    case 'labor':
      return rules.laborTaxable;
    case 'fee':
      return rules.feesTaxable;
    case 'discount':
      return false;
  }
}

export function computeTotals(lines: readonly LineInput[], ratePpm: number): Totals {
  let parts = 0, labor = 0, fees = 0, supplies = 0, discount = 0, taxable = 0;
  for (const l of lines) {
    const t = lineTotalCents(l);
    switch (l.type) {
      case 'part': parts += t; break;
      case 'labor': labor += t; break;
      case 'fee': fees += t; break;
      case 'supply': supplies += t; break;
      case 'discount': discount += -t; break;
    }
    if (l.taxable) taxable += t;
  }
  const subtotal = Math.max(0, parts + labor + fees + supplies - discount);
  const taxableCents = Math.max(0, Math.min(taxable, subtotal));
  const taxCents = Math.round((taxableCents * ratePpm) / 1_000_000);
  return {
    partsCents: parts,
    laborCents: labor,
    feesCents: fees,
    suppliesCents: supplies,
    discountCents: discount,
    subtotalCents: subtotal,
    taxableCents,
    taxCents,
    totalCents: subtotal + taxCents,
  };
}

export function balanceDueCents(inv: { total_cents: number; deposit_applied_cents: number; amount_paid_cents: number }): number {
  return Math.max(0, inv.total_cents - inv.deposit_applied_cents - inv.amount_paid_cents);
}
