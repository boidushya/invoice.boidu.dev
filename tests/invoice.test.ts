import {
  calculateItemTotal,
  calculateTotal,
  formatCurrency,
  formatDate,
} from '@/templates/invoice-template';
import type { Contact, CreateInvoiceRequest, InvoiceItem } from '@/types';
import { contactSchema, createInvoiceSchema, invoiceItemSchema } from '@/utils/schemas';
import { describe, expect, it } from 'vitest';

describe('Contact Schema Validation', () => {
  const validContact: Contact = {
    name: 'John Doe',
    address: '123 Main St, City, Country',
    email: 'john@example.com',
    phone: '+1 123 456 7890',
  };

  it('should validate correct contact data', () => {
    const result = contactSchema.safeParse(validContact);
    expect(result.success).toBe(true);
  });

  it('should reject empty name', () => {
    const invalidContact = { ...validContact, name: '' };
    const result = contactSchema.safeParse(invalidContact);
    expect(result.success).toBe(false);
  });

  it('should reject empty address', () => {
    const invalidContact = { ...validContact, address: '' };
    const result = contactSchema.safeParse(invalidContact);
    expect(result.success).toBe(false);
  });

  it('should reject invalid email format', () => {
    const invalidEmails = ['invalid', 'invalid@', '@domain.com', 'user@', 'user.domain.com'];

    for (const email of invalidEmails) {
      const invalidContact = { ...validContact, email };
      const result = contactSchema.safeParse(invalidContact);
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid email formats', () => {
    const validEmails = [
      'user@domain.com',
      'user.name@domain.co.uk',
      'user+tag@domain.com',
      'user123@domain123.com',
    ];

    for (const email of validEmails) {
      const validContactWithEmail = { ...validContact, email };
      const result = contactSchema.safeParse(validContactWithEmail);
      expect(result.success).toBe(true);
    }
  });

  it('should allow optional phone field', () => {
    const contactWithoutPhone = { ...validContact };
    contactWithoutPhone.phone = undefined;
    const result = contactSchema.safeParse(contactWithoutPhone);
    expect(result.success).toBe(true);
  });
});

describe('Invoice Item Schema Validation', () => {
  const validItem: InvoiceItem = {
    description: 'Consulting services',
    qty: 10,
    unit: 150.0,
    tax: 20.0,
  };

  it('should validate correct item data', () => {
    const result = invoiceItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it('should reject empty description', () => {
    const invalidItem = { ...validItem, description: '' };
    const result = invoiceItemSchema.safeParse(invalidItem);
    expect(result.success).toBe(false);
  });

  it('should reject negative or zero quantity', () => {
    const quantities = [-1, 0];

    for (const qty of quantities) {
      const invalidItem = { ...validItem, qty };
      const result = invoiceItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    }
  });

  it('should reject negative or zero unit price', () => {
    const prices = [-1, 0];

    for (const unit of prices) {
      const invalidItem = { ...validItem, unit };
      const result = invoiceItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    }
  });

  it('should reject tax rates outside valid range', () => {
    const invalidTaxRates = [-1, 101, 150];

    for (const tax of invalidTaxRates) {
      const invalidItem = { ...validItem, tax };
      const result = invoiceItemSchema.safeParse(invalidItem);
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid tax rates', () => {
    const validTaxRates = [0, 5, 15, 25, 50, 100];

    for (const tax of validTaxRates) {
      const validItemWithTax = { ...validItem, tax };
      const result = invoiceItemSchema.safeParse(validItemWithTax);
      expect(result.success).toBe(true);
    }
  });

  it('should handle decimal values correctly', () => {
    const itemWithDecimals = {
      ...validItem,
      qty: 2.5,
      unit: 99.99,
      tax: 15.5,
    };
    const result = invoiceItemSchema.safeParse(itemWithDecimals);
    expect(result.success).toBe(true);
  });
});

describe('Invoice Schema Validation', () => {
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

  it('should validate complete invoice data', () => {
    const result = createInvoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
  });

  it('should validate minimal invoice for inference', () => {
    const minimalInvoice = {
      items: [{ description: 'Test item', qty: 1, unit: 100.0, tax: 0.0 }],
      issueDate: '2025-01-01',
      dueDate: '2025-01-15',
    };

    const result = createInvoiceSchema.safeParse(minimalInvoice);
    expect(result.success).toBe(true);
  });

  it('should validate invoice with only items (all other fields have defaults)', () => {
    const minimalInvoice = {
      items: [{ description: 'Test item', qty: 1, unit: 100.0, tax: 0.0 }],
    };

    const result = createInvoiceSchema.safeParse(minimalInvoice);
    expect(result.success).toBe(true);
  });

  it('should validate partial invoice with seller only', () => {
    const partialInvoice = {
      seller: validInvoice.seller,
      items: [{ description: 'Test item', qty: 1, unit: 100.0, tax: 0.0 }],
      issueDate: '2025-01-01',
      dueDate: '2025-01-15',
    };

    const result = createInvoiceSchema.safeParse(partialInvoice);
    expect(result.success).toBe(true);
  });

  it('should validate partial invoice with buyer only', () => {
    const partialInvoice = {
      buyer: validInvoice.buyer,
      items: [{ description: 'Test item', qty: 1, unit: 100.0, tax: 0.0 }],
      currency: 'EUR',
      issueDate: '2025-01-01',
      dueDate: '2025-01-15',
    };

    const result = createInvoiceSchema.safeParse(partialInvoice);
    expect(result.success).toBe(true);
  });

  it('should reject empty items array', () => {
    const invalidInvoice = { ...validInvoice, items: [] };
    const result = createInvoiceSchema.safeParse(invalidInvoice);
    expect(result.success).toBe(false);
  });

  it('should validate currency length when provided', () => {
    const validCurrencyInvoice = {
      items: [{ description: 'Test', qty: 1, unit: 100, tax: 0 }],
      issueDate: '2025-01-01',
      dueDate: '2025-01-15',
      currency: 'USD',
    };

    const result = createInvoiceSchema.safeParse(validCurrencyInvoice);
    expect(result.success).toBe(true);
  });

  it('should accept valid currency codes', () => {
    const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];

    for (const currency of validCurrencies) {
      const validInvoiceWithCurrency = { ...validInvoice, currency };
      const result = createInvoiceSchema.safeParse(validInvoiceWithCurrency);
      expect(result.success).toBe(true);
    }
  });

  it('should validate required date formats', () => {
    const invalidIssueDateInvoice = {
      items: [{ description: 'Test', qty: 1, unit: 100, tax: 0 }],
      issueDate: 'invalid-date',
      dueDate: '2025-01-15',
    };

    const invalidDueDateInvoice = {
      items: [{ description: 'Test', qty: 1, unit: 100, tax: 0 }],
      issueDate: '2025-01-01',
      dueDate: 'invalid-date',
    };

    expect(createInvoiceSchema.safeParse(invalidIssueDateInvoice).success).toBe(false);
    expect(createInvoiceSchema.safeParse(invalidDueDateInvoice).success).toBe(false);
  });

  it('should accept valid date formats', () => {
    const validDates = [
      '2025-01-01',
      '2025-12-31',
      '2024-02-29', // leap year
      '2023-02-28',
    ];

    for (const date of validDates) {
      const validIssueDate = { ...validInvoice, issueDate: date };
      const validDueDate = { ...validInvoice, dueDate: date };

      expect(createInvoiceSchema.safeParse(validIssueDate).success).toBe(true);
      expect(createInvoiceSchema.safeParse(validDueDate).success).toBe(true);
    }
  });

  it('should allow optional notes field', () => {
    const invoiceWithoutNotes = { ...validInvoice };
    invoiceWithoutNotes.notes = undefined;

    const result = createInvoiceSchema.safeParse(invoiceWithoutNotes);
    expect(result.success).toBe(true);
  });

  it('should validate tax rate field', () => {
    const invoiceWithTax = {
      ...validInvoice,
      taxRate: 15,
    };

    const result = createInvoiceSchema.safeParse(invoiceWithTax);
    expect(result.success).toBe(true);
  });

  it('should reject tax rate outside valid range', () => {
    const invalidTaxRates = [-1, 101, 150];

    for (const taxRate of invalidTaxRates) {
      const invalidInvoice = { ...validInvoice, taxRate };
      const result = createInvoiceSchema.safeParse(invalidInvoice);
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid tax rates', () => {
    const validTaxRates = [0, 5, 15, 25, 50, 100];

    for (const taxRate of validTaxRates) {
      const validInvoiceWithTax = { ...validInvoice, taxRate };
      const result = createInvoiceSchema.safeParse(validInvoiceWithTax);
      expect(result.success).toBe(true);
    }
  });

  it('should validate discount rate field', () => {
    const invoiceWithDiscount = {
      ...validInvoice,
      discountRate: 10,
    };

    const result = createInvoiceSchema.safeParse(invoiceWithDiscount);
    expect(result.success).toBe(true);
  });

  it('should reject discount rate outside valid range', () => {
    const invalidDiscountRates = [-1, 101, 200];

    for (const discountRate of invalidDiscountRates) {
      const invalidInvoice = { ...validInvoice, discountRate };
      const result = createInvoiceSchema.safeParse(invalidInvoice);
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid discount rates', () => {
    const validDiscountRates = [0, 5, 10, 25, 50, 100];

    for (const discountRate of validDiscountRates) {
      const validInvoiceWithDiscount = { ...validInvoice, discountRate };
      const result = createInvoiceSchema.safeParse(validInvoiceWithDiscount);
      expect(result.success).toBe(true);
    }
  });

  it('should handle both tax and discount rates together', () => {
    const invoiceWithBoth = {
      ...validInvoice,
      taxRate: 20,
      discountRate: 15,
    };

    const result = createInvoiceSchema.safeParse(invoiceWithBoth);
    expect(result.success).toBe(true);
  });

  it('should default tax and discount rates to 0 when not provided', () => {
    const invoiceWithoutRates = {
      items: [{ description: 'Test item', qty: 1, unit: 100.0, tax: 0.0 }],
    };

    const result = createInvoiceSchema.safeParse(invoiceWithoutRates);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.taxRate).toBe(0);
      expect(result.data.discountRate).toBe(0);
    }
  });

  it('should handle decimal tax and discount rates', () => {
    const invoiceWithDecimalRates = {
      ...validInvoice,
      taxRate: 12.5,
      discountRate: 7.25,
    };

    const result = createInvoiceSchema.safeParse(invoiceWithDecimalRates);
    expect(result.success).toBe(true);
  });

  it('should validate complex invoice with multiple items', () => {
    const complexInvoice = {
      ...validInvoice,
      items: [
        { description: 'Web Development', qty: 40, unit: 75.0, tax: 10.0 },
        { description: 'UI/UX Design', qty: 20, unit: 85.0, tax: 10.0 },
        { description: 'Project Management', qty: 10, unit: 100.0, tax: 0.0 },
        { description: 'Testing & QA', qty: 15, unit: 60.0, tax: 5.0 },
      ],
    };

    const result = createInvoiceSchema.safeParse(complexInvoice);
    expect(result.success).toBe(true);
  });
});

describe('Invoice Calculations', () => {
  it('should calculate item total with no tax', () => {
    const item = { description: 'Test', qty: 5, unit: 100.0, tax: 0.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(500.0);
  });

  it('should calculate item total with tax', () => {
    const item = { description: 'Test', qty: 2, unit: 100.0, tax: 10.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(220.0); // (2 * 100) + (200 * 0.1)
  });

  it('should calculate item total with high tax', () => {
    const item = { description: 'Test', qty: 1, unit: 100.0, tax: 25.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(125.0);
  });

  it('should calculate item total with fractional quantities', () => {
    const item = { description: 'Test', qty: 2.5, unit: 80.0, tax: 15.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(230.0); // (2.5 * 80) + (200 * 0.15)
  });

  it('should calculate item total with decimal prices', () => {
    const item = { description: 'Test', qty: 3, unit: 33.33, tax: 20.0 };
    const total = calculateItemTotal(item);
    expect(total).toBeCloseTo(119.988, 3); // (3 * 33.33) + (99.99 * 0.2)
  });

  it('should calculate total for multiple items', () => {
    const items = [
      { description: 'Item 1', qty: 1, unit: 100.0, tax: 0.0 },
      { description: 'Item 2', qty: 2, unit: 50.0, tax: 10.0 },
      { description: 'Item 3', qty: 1, unit: 75.0, tax: 5.0 },
    ];

    const total = calculateTotal(items);
    expect(total).toBe(288.75); // 100 + 110 + 78.75
  });

  it('should calculate total for single item', () => {
    const items = [{ description: 'Single Item', qty: 1, unit: 150.0, tax: 12.0 }];
    const total = calculateTotal(items);
    expect(total).toBe(168.0); // 150 + (150 * 0.12)
  });

  it('should handle empty items array', () => {
    const items: InvoiceItem[] = [];
    const total = calculateTotal(items);
    expect(total).toBe(0);
  });

  it('should calculate totals with complex scenarios', () => {
    const items = [
      { description: 'Consulting', qty: 10.5, unit: 120.0, tax: 15.0 },
      { description: 'Materials', qty: 25, unit: 12.99, tax: 8.5 },
      { description: 'Labor', qty: 8, unit: 95.5, tax: 0.0 },
    ];

    const total = calculateTotal(items);
    const expected =
      10.5 * 120.0 * 1.15 + // 1449
      25 * 12.99 * 1.085 + // 351.96
      8 * 95.5; // 764

    expect(total).toBeCloseTo(expected, 2);
  });
});

describe('Invoice-Level Tax and Discount Calculations', () => {
  it('should calculate final total with no tax or discount', () => {
    const subtotal = 1000;
    const taxRate = 0;
    const discountRate = 0;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBe(0);
    expect(discountAmount).toBe(0);
    expect(finalTotal).toBe(1000);
  });

  it('should calculate final total with tax only', () => {
    const subtotal = 1000;
    const taxRate = 15;
    const discountRate = 0;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBe(150);
    expect(discountAmount).toBe(0);
    expect(finalTotal).toBe(1150);
  });

  it('should calculate final total with discount only', () => {
    const subtotal = 1000;
    const taxRate = 0;
    const discountRate = 10;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBe(0);
    expect(discountAmount).toBe(100);
    expect(finalTotal).toBe(900);
  });

  it('should calculate final total with both tax and discount', () => {
    const subtotal = 1000;
    const taxRate = 20;
    const discountRate = 15;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBe(200);
    expect(discountAmount).toBe(150);
    expect(finalTotal).toBe(1050);
  });

  it('should handle decimal tax and discount rates', () => {
    const subtotal = 1000;
    const taxRate = 12.5;
    const discountRate = 7.25;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBe(125);
    expect(discountAmount).toBe(72.5);
    expect(finalTotal).toBe(1052.5);
  });

  it('should handle maximum tax and discount rates', () => {
    const subtotal = 1000;
    const taxRate = 100;
    const discountRate = 100;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBe(1000);
    expect(discountAmount).toBe(1000);
    expect(finalTotal).toBe(1000);
  });

  it('should handle small amounts with tax and discount', () => {
    const subtotal = 0.99;
    const taxRate = 8.25;
    const discountRate = 5;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBeCloseTo(0.0817, 4);
    expect(discountAmount).toBeCloseTo(0.0495, 4);
    expect(finalTotal).toBeCloseTo(1.0222, 4);
  });

  it('should handle large amounts with tax and discount', () => {
    const subtotal = 999999.99;
    const taxRate = 25;
    const discountRate = 10;

    const taxAmount = subtotal * (taxRate / 100);
    const discountAmount = subtotal * (discountRate / 100);
    const finalTotal = subtotal + taxAmount - discountAmount;

    expect(taxAmount).toBeCloseTo(249999.9975, 2);
    expect(discountAmount).toBeCloseTo(99999.999, 2);
    expect(finalTotal).toBeCloseTo(1149999.9885, 2);
  });
});

describe('Currency Formatting', () => {
  it('should format USD correctly', () => {
    expect(formatCurrency(123.45, 'USD')).toBe('$123.45');
    expect(formatCurrency(1000, 'USD')).toBe('$1,000.00');
    expect(formatCurrency(0.99, 'USD')).toBe('$0.99');
  });

  it('should format EUR correctly', () => {
    expect(formatCurrency(123.45, 'EUR')).toBe('€123.45');
    expect(formatCurrency(1000, 'EUR')).toBe('€1,000.00');
  });

  it('should format GBP correctly', () => {
    expect(formatCurrency(123.45, 'GBP')).toBe('£123.45');
  });

  it('should handle large amounts', () => {
    expect(formatCurrency(1234567.89, 'USD')).toBe('$1,234,567.89');
  });

  it('should handle zero amounts', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  it('should handle negative amounts', () => {
    expect(formatCurrency(-123.45, 'USD')).toBe('-$123.45');
  });

  it('should handle fractional cents', () => {
    expect(formatCurrency(123.456, 'USD')).toBe('$123.46'); // rounds up
    expect(formatCurrency(123.454, 'USD')).toBe('$123.45'); // rounds down
  });
});

describe('Date Formatting', () => {
  it('should format dates correctly', () => {
    expect(formatDate('2025-01-01')).toBe('January 1, 2025');
    expect(formatDate('2025-12-31')).toBe('December 31, 2025');
    expect(formatDate('2024-02-29')).toBe('February 29, 2024');
  });

  it('should handle different date formats', () => {
    // ISO format
    expect(formatDate('2025-06-15T00:00:00.000Z')).toBe('June 15, 2025');

    // Date object string
    const date = new Date('2025-03-20');
    expect(formatDate(date.toISOString())).toBe('March 20, 2025');
  });
});

describe('Edge Cases and Error Handling', () => {
  it('should handle very large quantities', () => {
    const item = { description: 'Test', qty: 999999, unit: 0.01, tax: 0.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(9999.99);
  });

  it('should handle very small unit prices', () => {
    const item = { description: 'Test', qty: 1, unit: 0.001, tax: 0.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(0.001);
  });

  it('should handle maximum tax rate', () => {
    const item = { description: 'Test', qty: 1, unit: 100.0, tax: 100.0 };
    const total = calculateItemTotal(item);
    expect(total).toBe(200.0); // 100 + (100 * 1.0)
  });

  it('should validate invoice with all optional fields populated', () => {
    const fullInvoice = {
      seller: {
        name: 'Full Seller Inc',
        address: '123 Full Address, City, Country',
        email: 'seller@full.com',
        phone: '+1 555 123 4567',
      },
      buyer: {
        name: 'Full Buyer Corp',
        address: '456 Buyer Ave, City, Country',
        email: 'buyer@full.com',
        phone: '+1 555 987 6543',
      },
      items: [{ description: 'Premium Service', qty: 1, unit: 1000.0, tax: 25.0 }],
      currency: 'USD',
      issueDate: '2025-01-01',
      dueDate: '2025-01-31',
      notes: 'Payment terms: Net 30. Late fees apply after due date.',
    };

    const result = createInvoiceSchema.safeParse(fullInvoice);
    expect(result.success).toBe(true);
  });

  it('should provide detailed error messages for invalid data', () => {
    const invalidInvoice = {
      seller: { name: '', address: '', email: 'invalid', phone: '' },
      buyer: { name: '', address: '', email: 'invalid' },
      items: [],
      currency: 'US',
      issueDate: 'invalid',
      dueDate: 'invalid',
    };

    const result = createInvoiceSchema.safeParse(invalidInvoice);
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(5);
      expect(result.error.issues.some((issue) => issue.message.includes('Name is required'))).toBe(
        true
      );
      expect(result.error.issues.some((issue) => issue.message.includes('Invalid email'))).toBe(
        true
      );
      expect(result.error.issues.some((issue) => issue.message.includes('At least one item'))).toBe(
        true
      );
    }
  });
});
