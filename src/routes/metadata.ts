import type { CloudflareEnv } from '@/types';
import { getAuthContext, requireAuth } from '@/utils/auth';
import { searchSchema } from '@/utils/schemas';
import { InvoiceStorage } from '@/utils/storage';
import { Hono } from 'hono';

export const metadataRoutes = new Hono<{ Bindings: CloudflareEnv }>();

metadataRoutes.get('/stats', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const invoiceStorage = new InvoiceStorage(c.env.INVOICE_KV);
    const result = await invoiceStorage.listInvoicesByUser(userId, 1000);

    const totalInvoices = result.invoices.length;
    const totalRevenue = result.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const currencyBreakdown = result.invoices.reduce(
      (acc, invoice) => {
        acc[invoice.currency] = (acc[invoice.currency] || 0) + invoice.total;
        return acc;
      },
      {} as Record<string, number>
    );

    return c.json({
      totalInvoices,
      totalRevenue,
      currencyBreakdown,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

metadataRoutes.get('/search', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);

    const queryParams = { q: c.req.query('q') };
    const validationResult = searchSchema.safeParse(queryParams);

    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const { q: query } = validationResult.data;
    const invoiceStorage = new InvoiceStorage(c.env.INVOICE_KV);
    const filteredInvoices = await invoiceStorage.searchInvoices(userId, query);

    return c.json({
      invoices: filteredInvoices,
      query,
      count: filteredInvoices.length,
    });
  } catch (error) {
    console.error('Error searching invoices:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
