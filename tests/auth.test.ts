import type { User } from '@/types';
import { AuthService } from '@/utils/auth';
import { beforeEach, describe, expect, it } from 'vitest';

// Mock KV implementation for testing
class MockKV implements KVNamespace {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async list(): Promise<KVNamespaceListResult<unknown, string>> {
    throw new Error('Not implemented for tests');
  }

  async getWithMetadata(): Promise<KVNamespaceGetWithMetadataResult<string, unknown>> {
    throw new Error('Not implemented for tests');
  }

  clear() {
    this.data.clear();
  }
}

describe('AuthService', () => {
  let mockKV: MockKV;
  let authService: AuthService;

  beforeEach(() => {
    mockKV = new MockKV();
    authService = new AuthService(mockKV, 'test-secret');
  });

  describe('API Key Management', () => {
    it('should create API key with correct format', async () => {
      const userId = 'user123';
      const apiKey = await authService.createApiKey(userId);

      expect(apiKey).toMatch(/^ak_user123_[a-f0-9]+$/);
      expect(apiKey.length).toBeGreaterThan(40);
    });

    it('should store API key mapping in KV', async () => {
      const userId = 'user456';
      const apiKey = await authService.createApiKey(userId);

      const storedUserId = await authService.validateApiKey(apiKey);
      expect(storedUserId).toBe(userId);
    });

    it('should create unique API keys', async () => {
      const userId = 'user789';
      const apiKey1 = await authService.createApiKey(userId);
      const apiKey2 = await authService.createApiKey(userId);

      expect(apiKey1).not.toBe(apiKey2);
    });

    it('should validate existing API key', async () => {
      const userId = 'validuser';
      const apiKey = await authService.createApiKey(userId);

      const result = await authService.validateApiKey(apiKey);
      expect(result).toBe(userId);
    });

    it('should return null for invalid API key', async () => {
      const result = await authService.validateApiKey('invalid-key');
      expect(result).toBeNull();
    });

    it('should revoke API key successfully', async () => {
      const userId = 'revokeuser';
      const apiKey = await authService.createApiKey(userId);

      // Verify key works
      expect(await authService.validateApiKey(apiKey)).toBe(userId);

      // Revoke key
      await authService.revokeApiKey(apiKey);

      // Verify key no longer works
      expect(await authService.validateApiKey(apiKey)).toBeNull();
    });
  });

  describe('User Management', () => {
    it('should store and retrieve user data', async () => {
      const user: User = {
        id: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        createdAt: '2025-01-01T00:00:00.000Z',
        defaults: {
          seller: {
            name: 'Test Company',
            address: '123 Test St',
            email: 'company@test.com',
            phone: '+1 555 0123',
          },
          currency: 'USD',
          notes: 'Default notes',
        },
      };

      // Store user
      await mockKV.put(`user:${user.id}`, JSON.stringify(user));

      // Retrieve user
      const retrievedUser = await authService.getUserById(user.id);
      expect(retrievedUser).toEqual(user);
    });

    it('should return null for non-existent user', async () => {
      const result = await authService.getUserById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('Header Parsing', () => {
    it('should extract API key from valid Bearer token', () => {
      const apiKey = 'ak_user123_abcdef123456';
      const authHeader = `Bearer ${apiKey}`;

      const result = authService.extractApiKeyFromHeader(authHeader);
      expect(result).toBe(apiKey);
    });

    it('should return null for invalid Bearer token format', () => {
      const invalidHeaders = [
        'Basic dXNlcjpwYXNz',
        'Bearer',
        'Bearer ',
        'ak_user123_abcdef123456',
        'Token ak_user123_abcdef123456',
        '',
      ];

      for (const header of invalidHeaders) {
        const result = authService.extractApiKeyFromHeader(header);
        expect(result).toBeNull();
      }
    });

    it('should handle Bearer token with extra whitespace', () => {
      const apiKey = 'ak_user123_abcdef123456';
      const authHeader = `Bearer  ${apiKey}  `;

      const result = authService.extractApiKeyFromHeader(authHeader);
      expect(result).toBe(` ${apiKey}  `); // Preserves extra whitespace after Bearer
    });
  });

  describe('Integration Tests', () => {
    it('should complete full auth flow', async () => {
      // 1. Create user
      const user: User = {
        id: 'flowuser',
        name: 'Flow User',
        email: 'flow@example.com',
        createdAt: '2025-01-01T00:00:00.000Z',
        defaults: {
          seller: {
            name: 'Flow Company',
            address: '456 Flow Ave',
            email: 'flow@company.com',
          },
          currency: 'EUR',
        },
      };
      await mockKV.put(`user:${user.id}`, JSON.stringify(user));

      // 2. Create API key
      const apiKey = await authService.createApiKey(user.id);

      // 3. Validate API key
      const validatedUserId = await authService.validateApiKey(apiKey);
      expect(validatedUserId).toBe(user.id);

      // 4. Get user by ID
      const retrievedUser = await authService.getUserById(user.id);
      expect(retrievedUser).toEqual(user);

      // 5. Extract from header
      const extractedKey = authService.extractApiKeyFromHeader(`Bearer ${apiKey}`);
      expect(extractedKey).toBe(apiKey);

      // 6. Revoke key
      await authService.revokeApiKey(apiKey);
      const revokedCheck = await authService.validateApiKey(apiKey);
      expect(revokedCheck).toBeNull();
    });

    it('should handle multiple users and keys', async () => {
      const users = [
        { id: 'user1', name: 'User One' },
        { id: 'user2', name: 'User Two' },
        { id: 'user3', name: 'User Three' },
      ];

      const apiKeys = [];

      // Create API keys for all users
      for (const userData of users) {
        const user: User = {
          ...userData,
          email: `${userData.id}@example.com`,
          createdAt: '2025-01-01T00:00:00.000Z',
          defaults: {
            seller: {
              name: `${userData.name} Company`,
              address: `${userData.id} Street`,
              email: `${userData.id}@company.com`,
            },
            currency: 'USD',
          },
        };

        await mockKV.put(`user:${user.id}`, JSON.stringify(user));
        const apiKey = await authService.createApiKey(user.id);
        apiKeys.push({ userId: user.id, apiKey });
      }

      // Validate all keys work
      for (const { userId, apiKey } of apiKeys) {
        const validatedUserId = await authService.validateApiKey(apiKey);
        expect(validatedUserId).toBe(userId);
      }

      // Revoke one key, others should still work
      await authService.revokeApiKey(apiKeys[1].apiKey);

      expect(await authService.validateApiKey(apiKeys[0].apiKey)).toBe(apiKeys[0].userId);
      expect(await authService.validateApiKey(apiKeys[1].apiKey)).toBeNull();
      expect(await authService.validateApiKey(apiKeys[2].apiKey)).toBe(apiKeys[2].userId);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed user data gracefully', async () => {
      await mockKV.put('user:baduser', 'invalid-json');

      expect(async () => {
        await authService.getUserById('baduser');
      }).rejects.toThrow();
    });

    it('should handle empty API key', async () => {
      const result = await authService.validateApiKey('');
      expect(result).toBeNull();
    });

    it('should handle undefined authorization header', () => {
      expect(() => {
        authService.extractApiKeyFromHeader(undefined as unknown as string);
      }).toThrow();
    });
  });
});
