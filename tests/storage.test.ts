import type { CreateInvoiceRequest, Folder, InvoiceMetadata, User } from '@/types';
import { FolderStorage, InvoiceStorage, UserStorage } from '@/utils/storage';
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

  async list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<
    KVNamespaceListResult<unknown, string>
  > {
    const keys = Array.from(this.data.keys());
    const filteredKeys = options?.prefix ? keys.filter((k) => k.startsWith(options.prefix)) : keys;

    return {
      keys: filteredKeys.slice(0, options?.limit || 100).map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    };
  }

  async getWithMetadata(): Promise<KVNamespaceGetWithMetadataResult<string, unknown>> {
    throw new Error('Not implemented for tests');
  }

  clear() {
    this.data.clear();
  }

  getAllData() {
    return new Map(this.data);
  }
}

describe('UserStorage', () => {
  let mockKV: MockKV;
  let userStorage: UserStorage;

  beforeEach(() => {
    mockKV = new MockKV();
    userStorage = new UserStorage(mockKV);
  });

  const sampleUser: User = {
    id: 'user123',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: '2025-01-01T00:00:00.000Z',
    defaults: {
      seller: {
        name: 'Acme Corp',
        address: '123 Business St',
        email: 'billing@acme.com',
        phone: '+1 555 0123',
      },
      currency: 'USD',
      notes: 'Net 30 payment terms',
    },
  };

  it('should create user successfully', async () => {
    const result = await userStorage.createUser(
      'user123',
      'John Doe',
      'john@example.com',
      sampleUser.defaults
    );

    expect(result).toMatchObject({
      id: 'user123',
      name: 'John Doe',
      email: 'john@example.com',
      defaults: sampleUser.defaults,
    });
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should store user data correctly', async () => {
    const user = await userStorage.createUser(
      'user456',
      'Jane Smith',
      'jane@example.com',
      sampleUser.defaults
    );

    const retrieved = await userStorage.getUserById(user.id);
    expect(retrieved).toEqual(user);
  });

  it('should create email mapping', async () => {
    const user = await userStorage.createUser(
      'user789',
      'Test User',
      'test@example.com',
      sampleUser.defaults
    );

    const userByEmail = await userStorage.getUserByEmail('test@example.com');
    expect(userByEmail).toEqual(user);
  });

  it('should return null for non-existent user', async () => {
    const result = await userStorage.getUserById('nonexistent');
    expect(result).toBeNull();
  });

  it('should return null for non-existent email', async () => {
    const result = await userStorage.getUserByEmail('nonexistent@example.com');
    expect(result).toBeNull();
  });

  it('should update user successfully', async () => {
    const user = await userStorage.createUser(
      'user999',
      'Original Name',
      'update@example.com',
      sampleUser.defaults
    );

    const updates = {
      name: 'Updated Name',
      defaults: {
        ...sampleUser.defaults,
        currency: 'EUR',
        notes: 'Updated notes',
      },
    };

    const updated = await userStorage.updateUser(user.id, updates);

    expect(updated?.name).toBe('Updated Name');
    expect(updated?.defaults.currency).toBe('EUR');
    expect(updated?.defaults.notes).toBe('Updated notes');
    expect(updated?.email).toBe('update@example.com'); // Should remain unchanged
  });

  it('should return null when updating non-existent user', async () => {
    const result = await userStorage.updateUser('nonexistent', { name: 'New Name' });
    expect(result).toBeNull();
  });
});

describe('FolderStorage', () => {
  let mockKV: MockKV;
  let folderStorage: FolderStorage;

  beforeEach(() => {
    mockKV = new MockKV();
    folderStorage = new FolderStorage(mockKV);
  });

  const sampleFolderDefaults = {
    buyer: {
      name: 'Client Corp',
      address: '456 Client Ave',
      email: 'billing@client.com',
    },
    currency: 'USD',
    notes: 'Monthly retainer',
  };

  it('should create folder successfully', async () => {
    const result = await folderStorage.createFolder(
      'folder123',
      'user123',
      'Project Alpha',
      'ALPHA_CORP',
      sampleFolderDefaults
    );

    expect(result).toMatchObject({
      id: 'folder123',
      userId: 'user123',
      name: 'Project Alpha',
      company: 'ALPHA_CORP',
      defaults: sampleFolderDefaults,
      invoiceCounter: 0,
    });
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should retrieve folder by ID', async () => {
    const folder = await folderStorage.createFolder(
      'folder456',
      'user456',
      'Beta Project',
      'BETA_INC',
      sampleFolderDefaults
    );

    const retrieved = await folderStorage.getFolderById(folder.id);
    expect(retrieved).toEqual(folder);
  });

  it('should list folders for user', async () => {
    const userId = 'user789';

    const folder1 = await folderStorage.createFolder(
      'folder789a',
      userId,
      'Folder One',
      'COMPANY1',
      sampleFolderDefaults
    );
    const folder2 = await folderStorage.createFolder(
      'folder789b',
      userId,
      'Folder Two',
      'COMPANY2',
      sampleFolderDefaults
    );
    await folderStorage.createFolder(
      'folderother',
      'otheruser',
      'Other Folder',
      'OTHER',
      sampleFolderDefaults
    );

    const userFolders = await folderStorage.getFoldersByUserId(userId);

    expect(userFolders).toHaveLength(2);
    expect(userFolders).toContainEqual(folder1);
    expect(userFolders).toContainEqual(folder2);
  });

  it('should update folder successfully', async () => {
    const folder = await folderStorage.createFolder(
      'folder999',
      'user999',
      'Original',
      'ORIG',
      sampleFolderDefaults
    );

    const updates = {
      name: 'Updated Folder',
      company: 'UPDATED_CORP',
      defaults: {
        ...sampleFolderDefaults,
        currency: 'EUR',
      },
    };

    const updated = await folderStorage.updateFolder(folder.id, updates);

    expect(updated?.name).toBe('Updated Folder');
    expect(updated?.company).toBe('UPDATED_CORP');
    expect(updated?.defaults.currency).toBe('EUR');
    expect(updated?.userId).toBe('user999'); // Should remain unchanged
  });

  it('should increment invoice counter', async () => {
    const folder = await folderStorage.createFolder(
      'folder111',
      'user111',
      'Counter Test',
      'COUNTER',
      sampleFolderDefaults
    );

    expect(folder.invoiceCounter).toBe(0);

    const counter1 = await folderStorage.incrementInvoiceCounter(folder.id);
    expect(counter1).toBe(1);

    const counter2 = await folderStorage.incrementInvoiceCounter(folder.id);
    expect(counter2).toBe(2);

    const counter3 = await folderStorage.incrementInvoiceCounter(folder.id);
    expect(counter3).toBe(3);

    // Verify the folder was updated
    const updatedFolder = await folderStorage.getFolderById(folder.id);
    expect(updatedFolder?.invoiceCounter).toBe(3);
  });

  it('should return null for non-existent folder operations', async () => {
    expect(await folderStorage.getFolderById('nonexistent')).toBeNull();
    expect(await folderStorage.updateFolder('nonexistent', { name: 'New' })).toBeNull();
    expect(async () => {
      await folderStorage.incrementInvoiceCounter('nonexistent');
    }).rejects.toThrow('Folder not found');
  });
});

describe('InvoiceStorage', () => {
  let mockKV: MockKV;
  let invoiceStorage: InvoiceStorage;

  beforeEach(() => {
    mockKV = new MockKV();
    invoiceStorage = new InvoiceStorage(mockKV);
  });

  const sampleInvoiceRequest: CreateInvoiceRequest = {
    seller: {
      name: 'Seller Corp',
      address: '123 Seller St',
      email: 'billing@seller.com',
    },
    buyer: {
      name: 'Buyer Inc',
      address: '456 Buyer Ave',
      email: 'ap@buyer.com',
    },
    items: [
      { description: 'Consulting', qty: 10, unit: 150.0, tax: 0.0 },
      { description: 'Materials', qty: 5, unit: 50.0, tax: 10.0 },
    ],
    currency: 'USD',
    issueDate: '2025-01-01',
    dueDate: '2025-01-31',
    notes: 'Thank you for your business',
  };

  it('should generate correct invoice ID format', () => {
    const invoiceId1 = invoiceStorage.generateInvoiceId('john_doe', 'ACME Corporation', 1);
    expect(invoiceId1).toBe('INV-JOH-ACME-0001');

    const invoiceId2 = invoiceStorage.generateInvoiceId('alice_smith', 'Beta-Tech Inc.', 42);
    expect(invoiceId2).toBe('INV-ALI-BETA-0042');

    const invoiceId3 = invoiceStorage.generateInvoiceId('x', 'Y', 9999);
    expect(invoiceId3).toBe('INV-X-Y-9999');
  });

  it('should handle special characters in company names', () => {
    const invoiceId1 = invoiceStorage.generateInvoiceId('user', 'Test & Associates, LLC', 1);
    expect(invoiceId1).toBe('INV-USE-TEST-0001');

    const invoiceId2 = invoiceStorage.generateInvoiceId('user', '123-ABC-XYZ', 1);
    expect(invoiceId2).toBe('INV-USE--0001'); // Only first 4 chars: '123-' -> '' after regex

    const invoiceId3 = invoiceStorage.generateInvoiceId('user', '!@#$%^&*()', 1);
    expect(invoiceId3).toBe('INV-USE--0001'); // All special chars removed
  });

  it('should save invoice successfully', async () => {
    const metadata = await invoiceStorage.saveInvoice(
      'user123',
      'folder456',
      sampleInvoiceRequest,
      1,
      'ACME Corp'
    );

    expect(metadata).toMatchObject({
      id: 'INV-USE-ACME-0001',
      userId: 'user123',
      folderId: 'folder456',
      number: 1,
      buyer: 'Buyer Inc',
      seller: 'Seller Corp',
      total: 1775.0, // (10*150) + (5*50*1.1) = 1500 + 275 = 1775
      currency: 'USD',
      issueDate: '2025-01-01',
      dueDate: '2025-01-31',
    });
    expect(metadata.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should retrieve invoice metadata', async () => {
    const saved = await invoiceStorage.saveInvoice(
      'user789',
      'folder123',
      sampleInvoiceRequest,
      5,
      'TestCorp'
    );

    const retrieved = await invoiceStorage.getInvoiceMetadata(saved.id);
    expect(retrieved).toEqual(saved);
  });

  it('should retrieve full invoice data', async () => {
    const metadata = await invoiceStorage.saveInvoice(
      'user999',
      'folder999',
      sampleInvoiceRequest,
      10,
      'FullTest'
    );

    const fullData = await invoiceStorage.getInvoiceData(metadata.id);
    expect(fullData?.metadata).toEqual(metadata);
    expect(fullData?.request).toEqual(sampleInvoiceRequest);
  });

  it('should list invoices by user', async () => {
    const userId = 'listuser';

    // Create invoices for the user
    const inv1 = await invoiceStorage.saveInvoice(
      userId,
      'folder1',
      sampleInvoiceRequest,
      1,
      'Company1'
    );
    const inv2 = await invoiceStorage.saveInvoice(
      userId,
      'folder2',
      sampleInvoiceRequest,
      2,
      'Company2'
    );

    // Create invoice for different user
    await invoiceStorage.saveInvoice('otheruser', 'folder3', sampleInvoiceRequest, 1, 'Company3');

    const result = await invoiceStorage.listInvoicesByUser(userId, 10);

    expect(result.invoices).toHaveLength(2);
    expect(result.invoices.map((i) => i.id)).toContain(inv1.id);
    expect(result.invoices.map((i) => i.id)).toContain(inv2.id);
  });

  it('should list invoices by folder', async () => {
    const folderId = 'testfolder';

    const inv1 = await invoiceStorage.saveInvoice(
      'user1',
      folderId,
      sampleInvoiceRequest,
      1,
      'Company'
    );
    const inv2 = await invoiceStorage.saveInvoice(
      'user1',
      folderId,
      sampleInvoiceRequest,
      2,
      'Company'
    );
    await invoiceStorage.saveInvoice('user1', 'otherfolder', sampleInvoiceRequest, 1, 'Company');

    const result = await invoiceStorage.listInvoicesByFolder(folderId, 10);

    expect(result.invoices).toHaveLength(2);
    expect(result.invoices.map((i) => i.id)).toContain(inv1.id);
    expect(result.invoices.map((i) => i.id)).toContain(inv2.id);
  });

  it('should search invoices by query', async () => {
    const userId = 'searchuser';

    const request1 = {
      ...sampleInvoiceRequest,
      buyer: { ...sampleInvoiceRequest.buyer, name: 'Apple Inc' },
    };
    const request2 = {
      ...sampleInvoiceRequest,
      buyer: { ...sampleInvoiceRequest.buyer, name: 'Microsoft Corp' },
    };
    const request3 = {
      ...sampleInvoiceRequest,
      buyer: { ...sampleInvoiceRequest.buyer, name: 'Google LLC' },
    };

    await invoiceStorage.saveInvoice(userId, 'folder1', request1, 1, 'Company');
    await invoiceStorage.saveInvoice(userId, 'folder2', request2, 2, 'Company');
    await invoiceStorage.saveInvoice(userId, 'folder3', request3, 3, 'Company');

    const results = await invoiceStorage.searchInvoices(userId, 'apple');
    expect(results).toHaveLength(1);
    expect(results[0].buyer).toBe('Apple Inc');

    const corpResults = await invoiceStorage.searchInvoices(userId, 'microsoft');
    expect(corpResults).toHaveLength(1);
    expect(corpResults[0].buyer).toBe('Microsoft Corp');
  });

  it('should handle pagination correctly', async () => {
    const userId = 'pageuser';

    // Create 5 invoices
    const invoices = [];
    for (let i = 1; i <= 5; i++) {
      const inv = await invoiceStorage.saveInvoice(
        userId,
        'folder1',
        sampleInvoiceRequest,
        i,
        'PageTest'
      );
      invoices.push(inv);
    }

    // Test with limit
    const page1 = await invoiceStorage.listInvoicesByUser(userId, 3);
    expect(page1.invoices).toHaveLength(3);
    // Note: Our mock KV doesn't implement proper pagination cursor
    // In real implementation, this would have a nextCursor
  });

  it('should calculate totals correctly', async () => {
    const complexRequest: CreateInvoiceRequest = {
      ...sampleInvoiceRequest,
      items: [
        { description: 'Service A', qty: 2, unit: 100.0, tax: 10.0 },
        { description: 'Service B', qty: 1, unit: 200.0, tax: 0.0 },
        { description: 'Service C', qty: 3, unit: 50.0, tax: 25.0 },
      ],
    };

    const metadata = await invoiceStorage.saveInvoice(
      'calcuser',
      'calcfolder',
      complexRequest,
      1,
      'CalcCorp'
    );

    // Expected: (2*100*1.1) + (1*200) + (3*50*1.25) = 220 + 200 + 187.5 = 607.5
    expect(metadata.total).toBe(607.5);
  });

  it('should return null for non-existent invoices', async () => {
    expect(await invoiceStorage.getInvoiceMetadata('nonexistent')).toBeNull();
    expect(await invoiceStorage.getInvoiceData('nonexistent')).toBeNull();
  });

  it('should handle empty search results', async () => {
    const results = await invoiceStorage.searchInvoices('emptyuser', 'nonexistent');
    expect(results).toEqual([]);
  });

  it('should save invoice with default status (due)', async () => {
    const metadata = await invoiceStorage.saveInvoice(
      'statususer',
      'statusfolder',
      sampleInvoiceRequest,
      1,
      'StatusCorp'
    );

    expect(metadata.status).toBe('due');
  });

  it('should save invoice with explicit due status', async () => {
    const requestWithDueStatus = {
      ...sampleInvoiceRequest,
      status: 'due' as const,
    };

    const metadata = await invoiceStorage.saveInvoice(
      'statususer',
      'statusfolder',
      requestWithDueStatus,
      2,
      'StatusCorp'
    );

    expect(metadata.status).toBe('due');
  });

  it('should save invoice with paid status', async () => {
    const requestWithPaidStatus = {
      ...sampleInvoiceRequest,
      status: 'paid' as const,
    };

    const metadata = await invoiceStorage.saveInvoice(
      'statususer',
      'statusfolder',
      requestWithPaidStatus,
      3,
      'StatusCorp'
    );

    expect(metadata.status).toBe('paid');
  });

  it('should update invoice status from due to paid', async () => {
    // Create invoice with due status
    const metadata = await invoiceStorage.saveInvoice(
      'updateuser',
      'updatefolder',
      sampleInvoiceRequest,
      1,
      'UpdateCorp'
    );

    expect(metadata.status).toBe('due');

    // Update to paid
    const updatedMetadata = await invoiceStorage.updateInvoiceStatus(metadata.id, 'paid');

    expect(updatedMetadata).not.toBeNull();
    if (updatedMetadata) {
      expect(updatedMetadata.status).toBe('paid');
      expect(updatedMetadata.id).toBe(metadata.id);
      expect(updatedMetadata.total).toBe(metadata.total);
    }
  });

  it('should update invoice status from paid to due', async () => {
    // Create invoice with paid status
    const requestWithPaidStatus = {
      ...sampleInvoiceRequest,
      status: 'paid' as const,
    };

    const metadata = await invoiceStorage.saveInvoice(
      'updateuser2',
      'updatefolder2',
      requestWithPaidStatus,
      1,
      'UpdateCorp2'
    );

    expect(metadata.status).toBe('paid');

    // Update to due
    const updatedMetadata = await invoiceStorage.updateInvoiceStatus(metadata.id, 'due');

    expect(updatedMetadata).not.toBeNull();
    if (updatedMetadata) {
      expect(updatedMetadata.status).toBe('due');
      expect(updatedMetadata.id).toBe(metadata.id);
    }
  });

  it('should return null when updating non-existent invoice status', async () => {
    const result = await invoiceStorage.updateInvoiceStatus('NON-EXISTENT-ID', 'paid');
    expect(result).toBeNull();
  });

  it('should persist status update in both full data and metadata', async () => {
    // Create invoice
    const metadata = await invoiceStorage.saveInvoice(
      'persistuser',
      'persistfolder',
      sampleInvoiceRequest,
      1,
      'PersistCorp'
    );

    // Update status
    await invoiceStorage.updateInvoiceStatus(metadata.id, 'paid');

    // Verify full data was updated
    const fullData = await invoiceStorage.getInvoiceData(metadata.id);
    expect(fullData).not.toBeNull();
    if (fullData) {
      expect(fullData.metadata.status).toBe('paid');
    }

    // Verify metadata was updated
    const updatedMetadata = await invoiceStorage.getInvoiceMetadata(metadata.id);
    expect(updatedMetadata).not.toBeNull();
    if (updatedMetadata) {
      expect(updatedMetadata.status).toBe('paid');
    }
  });

  it('should preserve all other invoice data when updating status', async () => {
    const complexRequest = {
      ...sampleInvoiceRequest,
      notes: 'Original notes',
      taxRate: 15,
      discountRate: 10,
    };

    const metadata = await invoiceStorage.saveInvoice(
      'preserveuser',
      'preservefolder',
      complexRequest,
      1,
      'PreserveCorp'
    );

    const originalTotal = metadata.total;
    const originalBuyer = metadata.buyer;

    // Update status
    const updatedMetadata = await invoiceStorage.updateInvoiceStatus(metadata.id, 'paid');

    expect(updatedMetadata).not.toBeNull();
    if (updatedMetadata) {
      expect(updatedMetadata.status).toBe('paid');
      expect(updatedMetadata.total).toBe(originalTotal);
      expect(updatedMetadata.buyer).toBe(originalBuyer);
      expect(updatedMetadata.currency).toBe(metadata.currency);
      expect(updatedMetadata.issueDate).toBe(metadata.issueDate);
      expect(updatedMetadata.dueDate).toBe(metadata.dueDate);
    }

    // Verify full data preservation
    const fullData = await invoiceStorage.getInvoiceData(metadata.id);
    if (fullData) {
      expect(fullData.request.notes).toBe('Original notes');
      expect(fullData.request.taxRate).toBe(15);
      expect(fullData.request.discountRate).toBe(10);
    }
  });

  it('should handle multiple invoices with different statuses', async () => {
    const userId = 'multistatususer';
    const folderId = 'multistatusfolder';

    // Create invoices with different statuses
    const dueInvoice = await invoiceStorage.saveInvoice(
      userId,
      folderId,
      { ...sampleInvoiceRequest, status: 'due' },
      1,
      'MultiCorp'
    );

    const paidInvoice = await invoiceStorage.saveInvoice(
      userId,
      folderId,
      { ...sampleInvoiceRequest, status: 'paid' },
      2,
      'MultiCorp'
    );

    const defaultInvoice = await invoiceStorage.saveInvoice(
      userId,
      folderId,
      sampleInvoiceRequest,
      3,
      'MultiCorp'
    );

    // List all invoices
    const result = await invoiceStorage.listInvoicesByUser(userId, 10);
    expect(result.invoices).toHaveLength(3);

    // Verify statuses
    const invoiceById = new Map(result.invoices.map((inv) => [inv.id, inv]));
    expect(invoiceById.get(dueInvoice.id)?.status).toBe('due');
    expect(invoiceById.get(paidInvoice.id)?.status).toBe('paid');
    expect(invoiceById.get(defaultInvoice.id)?.status).toBe('due'); // default
  });

  it('should handle status updates with concurrent modifications', async () => {
    const metadata = await invoiceStorage.saveInvoice(
      'concurrentuser',
      'concurrentfolder',
      sampleInvoiceRequest,
      1,
      'ConcurrentCorp'
    );

    // First update
    const firstUpdate = await invoiceStorage.updateInvoiceStatus(metadata.id, 'paid');
    expect(firstUpdate?.status).toBe('paid');

    // Second update
    const secondUpdate = await invoiceStorage.updateInvoiceStatus(metadata.id, 'due');
    expect(secondUpdate?.status).toBe('due');

    // Verify final state
    const finalMetadata = await invoiceStorage.getInvoiceMetadata(metadata.id);
    expect(finalMetadata?.status).toBe('due');
  });
});
