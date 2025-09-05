import type { CloudflareEnv } from '@/types';
import { AuthService, getAuthContext, requireAuth } from '@/utils/auth';
import { createUserSchema } from '@/utils/schemas';
import { UserStorage } from '@/utils/storage';
import { Hono } from 'hono';

export const userRoutes = new Hono<{ Bindings: CloudflareEnv }>();

userRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const validationResult = createUserSchema.safeParse(body);

    if (!validationResult.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: validationResult.error.issues,
        },
        400
      );
    }

    const { name, email, defaults } = validationResult.data;
    const userStorage = new UserStorage(c.env.INVOICE_KV);
    const authService = new AuthService(c.env.INVOICE_KV, c.env.AUTH_SECRET);

    const existingUser = await userStorage.getUserByEmail(email);
    if (existingUser) {
      return c.json({ error: 'User with this email already exists' }, 409);
    }

    const userId = crypto.randomUUID();
    const user = await userStorage.createUser(userId, name, email, defaults);
    const apiKey = await authService.createApiKey(userId);

    return c.json(
      {
        user,
        apiKey,
      },
      201
    );
  } catch (error) {
    console.error('Error creating user:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.get('/me', requireAuth(), async (c) => {
  try {
    const { user } = getAuthContext(c);
    return c.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.put('/me', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const body = await c.req.json();

    const updateSchema = createUserSchema.partial().omit({ email: true });
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

    const userStorage = new UserStorage(c.env.INVOICE_KV);
    const updatedUser = await userStorage.updateUser(userId, validationResult.data);

    if (!updatedUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.post('/api-keys', requireAuth(), async (c) => {
  try {
    const { userId } = getAuthContext(c);
    const authService = new AuthService(c.env.INVOICE_KV, c.env.AUTH_SECRET);

    const newApiKey = await authService.createApiKey(userId);

    return c.json(
      {
        apiKey: newApiKey,
        createdAt: new Date().toISOString(),
      },
      201
    );
  } catch (error) {
    console.error('Error creating API key:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

userRoutes.delete('/api-keys/:key', requireAuth(), async (c) => {
  try {
    const apiKey = c.req.param('key');
    const authService = new AuthService(c.env.INVOICE_KV, c.env.AUTH_SECRET);

    await authService.revokeApiKey(apiKey);

    return c.json({ message: 'API key revoked successfully' });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
