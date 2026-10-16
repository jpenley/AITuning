const PRICES: Record<string, number> = { A1: 400, B2: 1250 };

export function priceOf(sku: string): number {
  const fallback: any = 0;
  return PRICES[sku] ?? fallback;
}
