import { describe, it, expect } from 'vitest';
import { validateCreateInvoiceRequest } from '@/utils/validators';
import {
  calculateItemTotal,
  calculateTotal,
  formatCurrency,
  validateInvoiceData,
} from '@/templates/invoice-template';
import type { CreateInvoiceRequest } from '@/types';

describe('Invoice Validation', () => {
  const validInvoice: CreateInvoiceRequest = {
    seller: {
      name: 'Acme Inc',
      address: '123 Office Rd, City, Country',
      email: 'invoices@acme.test',
      phone: '+1 123 456 7890',
    },
    buyer: {
      name: 'Jane Doe',
      address: '456 Home St, City, Country',
      email: 'jane@example.com',
    },
    items: [
      { description: 'Design work', qty: 10, unit: 50.0, tax: 0.0 },
      { description: 'Consulting', qty: 2, unit: 200.0, tax: 0.0 },
    ],
    currency: 'USD',
    issueDate: '2025-01-01',
    dueDate: '2025-01-15',
    notes: 'Thanks for your business',
  };

  it('should validate correct invoice data', () => {
    expect(validateCreateInvoiceRequest(validInvoice)).toBe(true);
  });

  it('should reject invalid seller data', () => {
    const invalidInvoice = { ...validInvoice, seller: { ...validInvoice.seller, name: '' } };
    expect(validateCreateInvoiceRequest(invalidInvoice)).toBe(false);
  });

  it('should reject empty items array', () => {
    const invalidInvoice = { ...validInvoice, items: [] };
    expect(validateCreateInvoiceRequest(invalidInvoice)).toBe(false);
  });

  it('should reject invalid currency', () => {
    const invalidInvoice = { ...validInvoice, currency: 'US' };
    expect(validateCreateInvoiceRequest(invalidInvoice)).toBe(false);
  });
});

describe('Invoice Template', () => {
  it('should calculate item total correctly', () => {
    const item = { description: 'Test', qty: 2, unit: 100.0, tax: 10.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(220.0); // (2 * 100) + (200 * 0.1)
  });

  it('should calculate total correctly', () => {
    const items = [
      { description: 'Item 1', qty: 1, unit: 100.0, tax: 0.0 },
      { description: 'Item 2', qty: 2, unit: 50.0, tax: 10.0 },
    ];
    const total = calculateTotal(items);
    expect(total).toBe(210.0); // 100 + (100 + 10)
  });

  it('should format currency correctly', () => {
    const formatted = formatCurrency(123.45, 'USD');
    expect(formatted).toBe('$123.45');
  });

  it('should validate invoice data and return errors', () => {
    const invalidInvoice: CreateInvoiceRequest = {
      seller: { name: '', address: '', email: 'invalid', phone: '' },
      buyer: { name: '', address: '', email: 'invalid' },
      items: [],
      currency: 'US',
      issueDate: 'invalid',
      dueDate: 'invalid',
    };

    const errors = validateInvoiceData(invalidInvoice);
    expect(errors.length).toBeGreaterThan(0);
  });
});
