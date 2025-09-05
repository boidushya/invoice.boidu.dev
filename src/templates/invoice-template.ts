import type { CreateInvoiceRequest, InvoiceItem } from '@/types';

export function calculateItemTotal(item: InvoiceItem): number {
  const subtotal = item.qty * item.unit;
  const taxAmount = subtotal * (item.tax / 100);
  return subtotal + taxAmount;
}

export function calculateTotal(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + calculateItemTotal(item), 0);
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
