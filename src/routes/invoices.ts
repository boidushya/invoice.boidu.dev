import type { CloudflareEnv } from '@/types';
import { getAuthContext, requireAuth } from '@/utils/auth';
import { InvoicePDFGenerator } from '@/utils/pdf';
import { createInvoiceSchema, paginationSchema, updateInvoiceStatusSchema } from '@/utils/schemas';
import { FolderStorage, InvoiceStorage } from '@/utils/storage';
import { Hono } from 'hono';

export const invoiceRoutes = new Hono<{ Bindings: CloudflareEnv }>();

invoiceRoutes.post('/folders/:folderId', requireAuth(), async (c) => {
  try {
    const { userId, user } = getAuthContext(c);
    const folderId = c.req.param('folderId');
    const body = await c.req.json();

    const validationResult = createInvoiceSchema.safeParse(body);
    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const folderStorage = new FolderStorage(c.env.INVOICE_KV);
    const folder = await folderStorage.getFolderById(folderId);

    if (!folder) {
      return c.json({ error: 'Folder not found' }, 404);
    }

    if (folder.userId !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }

    // Infer seller from user defaults if not provided
    const seller = validationResult.data.seller || user.defaults.seller;

    // Infer buyer from folder defaults if not provided
    const buyer = validationResult.data.buyer || folder.defaults.buyer;

    // Infer currency from folder or user defaults, fallback to USD
    const currency =
      validationResult.data.currency || folder.defaults.currency || user.defaults.currency || 'USD';

    // Infer issueDate to today if not provided
    const issueDate = validationResult.data.issueDate || new Date().toISOString().split('T')[0];

    // Infer dueDate to NET15 (15 days from issue date) if not provided
    let dueDate = validationResult.data.dueDate;
    if (!dueDate) {
      const issueDateObj = new Date(issueDate);
      issueDateObj.setDate(issueDateObj.getDate() + 15);
      dueDate = issueDateObj.toISOString().split('T')[0];
    }

    // Validate required fields after inference
    if (!seller) {
      return c.json({ error: 'Seller is required and not found in user defaults' }, 400);
    }
    if (!buyer) {
      return c.json({ error: 'Buyer is required and not found in folder defaults' }, 400);
    }

    const inferredInvoiceData = {
      ...validationResult.data,
      seller,
      buyer,
      currency,
      issueDate,
      dueDate,
    };

    const invoiceStorage = new InvoiceStorage(c.env.INVOICE_KV);
    const pdfGenerator = new InvoicePDFGenerator(c.env);

    const invoiceNumber = await folderStorage.incrementInvoiceCounter(folderId);
    const metadata = await invoiceStorage.saveInvoice(
      userId,
      folderId,
      inferredInvoiceData,
      invoiceNumber,
      folder.company
    );

    const pdfBytes = await pdfGenerator.generateInvoicePDF(inferredInvoiceData, metadata.id);

    return new Response(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${metadata.id}.pdf"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

invoiceRoutes.get('/:id', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const invoiceId = c.req.param('id');

    const invoiceStorage = new InvoiceStorage(c.env.INVOICE_KV);
    const metadata = await invoiceStorage.getInvoiceMetadata(invoiceId);

    if (!metadata) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    if (metadata.userId !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }

    return c.json(metadata);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

invoiceRoutes.get('/', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);

    const queryParams = {
      limit: c.req.query('limit'),
      cursor: c.req.query('cursor'),
    };

    const validationResult = paginationSchema.safeParse(queryParams);
    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const { limit, cursor } = validationResult.data;
    const invoiceStorage = new InvoiceStorage(c.env.INVOICE_KV);
    const result = await invoiceStorage.listInvoicesByUser(userId, limit, cursor);

    return c.json(result);
  } catch (error) {
    console.error('Error listing invoices:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

invoiceRoutes.patch('/:id/status', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const invoiceId = c.req.param('id');
    const body = await c.req.json();

    const validationResult = updateInvoiceStatusSchema.safeParse(body);
    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const invoiceStorage = new InvoiceStorage(c.env.INVOICE_KV);
    const metadata = await invoiceStorage.getInvoiceMetadata(invoiceId);

    if (!metadata) {
      return c.json({ error: 'Invoice not found' }, 404);
    }

    if (metadata.userId !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const updatedMetadata = await invoiceStorage.updateInvoiceStatus(
      invoiceId,
      validationResult.data.status
    );

    return c.json(updatedMetadata);
  } catch (error) {
    console.error('Error updating invoice status:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
