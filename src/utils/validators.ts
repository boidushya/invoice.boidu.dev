import type { CreateInvoiceRequest, Contact, InvoiceItem } from '@/types';

export function validateContact(contact: unknown): contact is Contact {
  if (!contact || typeof contact !== 'object') return false;
  const c = contact as Record<string, unknown>;

  return (
    typeof c.name === 'string' &&
    c.name.length > 0 &&
    typeof c.address === 'string' &&
    c.address.length > 0 &&
    typeof c.email === 'string' &&
    c.email.includes('@') &&
    (c.phone === undefined || typeof c.phone === 'string')
  );
}

export function validateInvoiceItem(item: unknown): item is InvoiceItem {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;

  return (
    typeof i.description === 'string' &&
    i.description.length > 0 &&
    typeof i.qty === 'number' &&
    i.qty > 0 &&
    typeof i.unit === 'number' &&
    i.unit >= 0 &&
    typeof i.tax === 'number' &&
    i.tax >= 0
  );
}

export function validateCreateInvoiceRequest(data: unknown): data is CreateInvoiceRequest {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  return (
    validateContact(d.seller) &&
    validateContact(d.buyer) &&
    Array.isArray(d.items) &&
    d.items.length > 0 &&
    d.items.every(validateInvoiceItem) &&
    typeof d.currency === 'string' &&
    d.currency.length === 3 &&
    typeof d.issueDate === 'string' &&
    !Number.isNaN(Date.parse(d.issueDate)) &&
    typeof d.dueDate === 'string' &&
    !Number.isNaN(Date.parse(d.dueDate)) &&
    (d.notes === undefined || typeof d.notes === 'string')
  );
}

export function validateInvoiceId(id: string): boolean {
  const numId = Number.parseInt(id, 10);
  return !Number.isNaN(numId) && numId > 0;
}
