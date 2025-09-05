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

export function validateInvoiceData(request: CreateInvoiceRequest): string[] {
  const errors: string[] = [];

  if (!request.seller.name.trim()) {
    errors.push('Seller name is required');
  }

  if (!request.buyer.name.trim()) {
    errors.push('Buyer name is required');
  }

  if (request.items.length === 0) {
    errors.push('At least one item is required');
  }

  for (let i = 0; i < request.items.length; i++) {
    const item = request.items[i];
    if (!item.description.trim()) {
      errors.push(`Item ${i + 1}: Description is required`);
    }
    if (item.qty <= 0) {
      errors.push(`Item ${i + 1}: Quantity must be greater than 0`);
    }
    if (item.unit < 0) {
      errors.push(`Item ${i + 1}: Unit price cannot be negative`);
    }
    if (item.tax < 0 || item.tax > 100) {
      errors.push(`Item ${i + 1}: Tax must be between 0 and 100`);
    }
  }

  if (request.currency.length !== 3) {
    errors.push('Currency must be a 3-letter code (e.g., USD, EUR)');
  }

  const issueDate = new Date(request.issueDate);
  const dueDate = new Date(request.dueDate);

  if (Number.isNaN(issueDate.getTime())) {
    errors.push('Invalid issue date');
  }

  if (Number.isNaN(dueDate.getTime())) {
    errors.push('Invalid due date');
  }

  if (dueDate < issueDate) {
    errors.push('Due date cannot be before issue date');
  }

  return errors;
}
