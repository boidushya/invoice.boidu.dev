import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { CloudflareEnv } from '@/types';
import { invoiceRoutes } from '@/routes/invoices';
import { metadataRoutes } from '@/routes/metadata';

const app = new Hono<{ Bindings: CloudflareEnv }>();

// CORS middleware
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    message: 'invoice.boidu.dev is running',
    environment: c.env.ENVIRONMENT || 'development',
  });
});

// API routes
app.route('/invoices', invoiceRoutes);
app.route('/metadata', metadataRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
