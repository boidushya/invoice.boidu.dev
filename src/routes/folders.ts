import type { CloudflareEnv } from '@/types';
import { getAuthContext, requireAuth } from '@/utils/auth';
import { createFolderSchema, paginationSchema } from '@/utils/schemas';
import { FolderStorage, InvoiceStorage } from '@/utils/storage';
import { Hono } from 'hono';

export const folderRoutes = new Hono<{ Bindings: CloudflareEnv }>();

folderRoutes.post('/', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const body = await c.req.json();

    const validationResult = createFolderSchema.safeParse(body);
    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const { name, company, defaults } = validationResult.data;
    const folderId = crypto.randomUUID();

    const folderStorage = new FolderStorage(c.env.INVOICE_KV);
    const folder = await folderStorage.createFolder(folderId, userId, name, company, defaults);

    return c.json(folder, 201);
  } catch (error) {
    console.error('Error creating folder:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

folderRoutes.get('/', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const folderStorage = new FolderStorage(c.env.INVOICE_KV);

    const folders = await folderStorage.getFoldersByUserId(userId);
    return c.json({ folders });
  } catch (error) {
    console.error('Error listing folders:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

folderRoutes.get('/:id', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const folderId = c.req.param('id');

    const folderStorage = new FolderStorage(c.env.INVOICE_KV);
    const folder = await folderStorage.getFolderById(folderId);

    if (!folder) {
      return c.json({ error: 'Folder not found' }, 404);
    }

    if (folder.userId !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }

    return c.json(folder);
  } catch (error) {
    console.error('Error fetching folder:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

folderRoutes.put('/:id', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const folderId = c.req.param('id');
    const body = await c.req.json();

    const folderStorage = new FolderStorage(c.env.INVOICE_KV);
    const folder = await folderStorage.getFolderById(folderId);

    if (!folder) {
      return c.json({ error: 'Folder not found' }, 404);
    }

    if (folder.userId !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const updateSchema = createFolderSchema.partial();
    const validationResult = updateSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const updatedFolder = await folderStorage.updateFolder(folderId, validationResult.data);
    return c.json(updatedFolder);
  } catch (error) {
    console.error('Error updating folder:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

folderRoutes.get('/:id/invoices', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const folderId = c.req.param('id');

    const folderStorage = new FolderStorage(c.env.INVOICE_KV);
    const folder = await folderStorage.getFolderById(folderId);

    if (!folder) {
      return c.json({ error: 'Folder not found' }, 404);
    }

    if (folder.userId !== userId) {
      return c.json({ error: 'Access denied' }, 403);
    }

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
    const result = await invoiceStorage.listInvoicesByFolder(folderId, limit, cursor);

    return c.json(result);
  } catch (error) {
    console.error('Error listing folder invoices:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
