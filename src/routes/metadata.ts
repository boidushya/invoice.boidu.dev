import { Hono } from 'hono';
import type { CloudflareEnv } from '@/types';
import { InvoiceStorage } from '@/utils/storage';

export const metadataRoutes = new Hono<{ Bindings: CloudflareEnv }>();

metadataRoutes.get('/stats', async (c) => {
  try {
    const storage = new InvoiceStorage(c.env.INVOICE_KV);
    const result = await storage.listInvoices(1000); // Get all for stats

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

metadataRoutes.get('/search', async (c) => {
  try {
    const query = c.req.query('q');
    if (!query || query.trim().length < 2) {
      return c.json({ error: 'Search query must be at least 2 characters' }, 400);
    }

    const storage = new InvoiceStorage(c.env.INVOICE_KV);
    const result = await storage.listInvoices(1000); // Get all for search

    const filteredInvoices = result.invoices.filter(
      (invoice) =>
        invoice.buyer.toLowerCase().includes(query.toLowerCase()) ||
        invoice.seller.toLowerCase().includes(query.toLowerCase()) ||
        invoice.id.toString().includes(query)
    );

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
