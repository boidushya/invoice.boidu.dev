import type { AuthContext, CloudflareEnv, User } from '@/types';
import { authHeaderSchema } from '@/utils/schemas';
import type { Context } from 'hono';
import { z } from 'zod';

export class AuthService {
  constructor(
    private kv: KVNamespace,
    private secret?: string
  ) {}

  async createApiKey(userId: string): Promise<string> {
    const apiKey = `ak_${userId}_${crypto.randomUUID().replace(/-/g, '')}`;
    await this.kv.put(`auth:${apiKey}`, userId);
    return apiKey;
  }

  async validateApiKey(apiKey: string): Promise<string | null> {
    const userId = await this.kv.get(`auth:${apiKey}`);
    return userId;
  }

  async revokeApiKey(apiKey: string): Promise<void> {
    await this.kv.delete(`auth:${apiKey}`);
  }

  async getUserById(userId: string): Promise<User | null> {
    const userData = await this.kv.get(`user:${userId}`);
    return userData ? JSON.parse(userData) : null;
  }

  extractApiKeyFromHeader(authorization: string): string | null {
    const match = authorization.match(/^Bearer (.+)$/);
    return match ? match[1] : null;
  }
}

export async function authenticateRequest(
  c: Context<{ Bindings: CloudflareEnv }>
): Promise<AuthContext | null> {
  try {
    const headers = c.req.header();
    const authResult = authHeaderSchema.safeParse({ authorization: headers.authorization });

    if (!authResult.success) {
      return null;
    }

    const authService = new AuthService(c.env.INVOICE_KV, c.env.AUTH_SECRET);
    const apiKey = authService.extractApiKeyFromHeader(authResult.data.authorization);

    if (!apiKey) {
      return null;
    }

    const userId = await authService.validateApiKey(apiKey);
    if (!userId) {
      return null;
    }

    const user = await authService.getUserById(userId);
    if (!user) {
      return null;
    }

    return { userId, user };
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

export function requireAuth() {
  return async (c: Context, next: () => Promise<void>) => {
    const authContext = await authenticateRequest(c);

    if (!authContext) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('auth', authContext);
    await next();
  };
}

export function getAuthContext(c: Context): AuthContext {
  const auth = c.get('auth');
  if (!auth) {
    throw new Error('Auth context not found');
  }
  return auth as AuthContext;
}
