import { Hono } from 'hono';
import type { CloudflareEnv } from '@/types';
import { InvoiceStorage } from '@/utils/storage';
import { InvoicePDFGenerator } from '@/utils/pdf';
import { validateCreateInvoiceRequest } from '@/utils/validators';
import { validateInvoiceData } from '@/templates/invoice-template';

export const invoiceRoutes = new Hono<{ Bindings: CloudflareEnv }>();

invoiceRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();

    if (!validateCreateInvoiceRequest(body)) {
      return c.json({ error: 'Invalid invoice data' }, 400);
    }

    const validationErrors = validateInvoiceData(body);
    if (validationErrors.length > 0) {
      return c.json({ error: 'Validation failed', details: validationErrors }, 400);
    }

    const storage = new InvoiceStorage(c.env.INVOICE_KV);
    const pdfGenerator = new InvoicePDFGenerator(c.env);

    const invoiceId = await storage.getNextInvoiceId();
    await storage.saveInvoice(invoiceId, body);
    const pdfBytes = await pdfGenerator.generateInvoicePDF(body, invoiceId);

    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoiceId}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

invoiceRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const invoiceId = Number.parseInt(id, 10);

    if (Number.isNaN(invoiceId) || invoiceId <= 0) {
      return c.json({ error: 'Invalid invoice ID' }, 400);
    }

    const storage = new InvoiceStorage(c.env.INVOICE_KV);
    const metadata = await storage.getInvoiceMetadata(invoiceId);

    if (!metadata) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    return c.json(metadata);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

invoiceRoutes.get('/', async (c) => {
  try {
    const limit = Number.parseInt(c.req.query('limit') || '20', 10);
    const cursor = c.req.query('cursor');

    if (limit < 1 || limit > 100) {
      return c.json({ error: 'Limit must be between 1 and 100' }, 400);
    }

    const storage = new InvoiceStorage(c.env.INVOICE_KV);
    const result = await storage.listInvoices(limit, cursor);

    return c.json(result);
  } catch (error) {
    console.error('Error listing invoices:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
