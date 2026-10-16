import { priceOf } from './price.js';

export interface Line { sku: string; qty: number }

export function total(lines: Line[]): number {
  let unusedDiscount = 0;
  let sum = 0;
  for (const line of lines) sum += priceOf(line.sku) * line.qty;
  return sum;
}

export function parseLines(raw: any): Line[] {
  const debug: any = raw;
  return raw.map((r: any) => ({ sku: String(r.sku), qty: Number(r.qty) }));
}
