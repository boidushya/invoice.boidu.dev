import type {
  CloudflareEnv,
  CreateInvoiceRequest,
  Folder,
  FolderDefaults,
  InvoiceMetadata,
  InvoiceStorageData,
  User,
  UserDefaults,
} from '@/types';

export class UserStorage {
  constructor(private kv: KVNamespace) {}

  async createUser(id: string, name: string, email: string, defaults: UserDefaults): Promise<User> {
    const user: User = {
      id,
      name,
      email,
      createdAt: new Date().toISOString(),
      defaults,
    };

    await this.kv.put(`user:${id}`, JSON.stringify(user));
    await this.kv.put(`user:email:${email}`, id);

    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    const data = await this.kv.get(`user:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const userId = await this.kv.get(`user:email:${email}`);
    if (!userId) return null;
    return this.getUserById(userId);
  }

  async updateUser(
    id: string,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>
  ): Promise<User | null> {
    const user = await this.getUserById(id);
    if (!user) return null;

    const updatedUser = { ...user, ...updates };
    await this.kv.put(`user:${id}`, JSON.stringify(updatedUser));

    if (updates.email && updates.email !== user.email) {
      await this.kv.delete(`user:email:${user.email}`);
      await this.kv.put(`user:email:${updates.email}`, id);
    }

    return updatedUser;
  }
}

export class FolderStorage {
  constructor(private kv: KVNamespace) {}

  async createFolder(
    id: string,
    userId: string,
    name: string,
    company: string,
    defaults: FolderDefaults
  ): Promise<Folder> {
    const folder: Folder = {
      id,
      userId,
      name,
      company,
      createdAt: new Date().toISOString(),
      defaults,
      invoiceCounter: 0,
    };

    await this.kv.put(`folder:${id}`, JSON.stringify(folder));
    await this.kv.put(`folder:user:${userId}:${id}`, '1');

    return folder;
  }

  async getFolderById(id: string): Promise<Folder | null> {
    const data = await this.kv.get(`folder:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async getFoldersByUserId(userId: string): Promise<Folder[]> {
    const listResult = await this.kv.list({ prefix: `folder:user:${userId}:` });
    const folders: Folder[] = [];

    for (const key of listResult.keys) {
      const folderId = key.name.split(':').pop();
      if (folderId) {
        const folder = await this.getFolderById(folderId);
        if (folder) {
          folders.push(folder);
        }
      }
    }

    return folders.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateFolder(
    id: string,
    updates: Partial<Omit<Folder, 'id' | 'userId' | 'createdAt'>>
  ): Promise<Folder | null> {
    const folder = await this.getFolderById(id);
    if (!folder) return null;

    const updatedFolder = { ...folder, ...updates };
    await this.kv.put(`folder:${id}`, JSON.stringify(updatedFolder));

    return updatedFolder;
  }

  async incrementInvoiceCounter(folderId: string): Promise<number> {
    const folder = await this.getFolderById(folderId);
    if (!folder) throw new Error('Folder not found');

    const newCounter = folder.invoiceCounter + 1;
    await this.updateFolder(folderId, { invoiceCounter: newCounter });

    return newCounter;
  }
}

export class InvoiceStorage {
  constructor(private kv: KVNamespace) {}

  generateInvoiceId(userId: string, folderCompany: string, invoiceNumber: number): string {
    const userPrefix = userId.substring(0, 3).toUpperCase();
    const companyPrefix = folderCompany
      .substring(0, 4)
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    return `INV-${userPrefix}-${companyPrefix}-${invoiceNumber.toString().padStart(4, '0')}`;
  }

  async saveInvoice(
    userId: string,
    folderId: string,
    request: CreateInvoiceRequest,
    invoiceNumber: number,
    folderCompany: string
  ): Promise<InvoiceMetadata> {
    const invoiceId = this.generateInvoiceId(userId, folderCompany, invoiceNumber);

    const total = request.items.reduce((sum, item) => {
      const subtotal = item.qty * item.unit;
      const taxAmount = subtotal * (item.tax / 100);
      return sum + subtotal + taxAmount;
    }, 0);

    const metadata: InvoiceMetadata = {
      id: invoiceId,
      userId,
      folderId,
      number: invoiceNumber,
      buyer: request.buyer.name,
      seller: request.seller.name,
      total: Math.round(total * 100) / 100,
      currency: request.currency,
      issueDate: request.issueDate,
      dueDate: request.dueDate,
      status: request.status || 'due',
      createdAt: new Date().toISOString(),
    };

    const storageData: InvoiceStorageData = {
      metadata,
      request,
    };

    await this.kv.put(`invoice:${invoiceId}`, JSON.stringify(storageData));
    await this.kv.put(`invoice:meta:${invoiceId}`, JSON.stringify(metadata));
    await this.kv.put(`invoice:user:${userId}:${invoiceId}`, '1');
    await this.kv.put(`invoice:folder:${folderId}:${invoiceId}`, '1');

    return metadata;
  }

  async getInvoiceMetadata(id: string): Promise<InvoiceMetadata | null> {
    const data = await this.kv.get(`invoice:meta:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async getInvoiceData(id: string): Promise<InvoiceStorageData | null> {
    const data = await this.kv.get(`invoice:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async getInvoice(id: string): Promise<InvoiceStorageData | null> {
    return this.getInvoiceData(id);
  }

  async listInvoicesByUser(
    userId: string,
    limit = 20,
    cursor?: string
  ): Promise<{
    invoices: InvoiceMetadata[];
    nextCursor?: string;
  }> {
    const listOptions: KVNamespaceListOptions = {
      limit,
      prefix: `invoice:user:${userId}:`,
    };

    if (cursor) {
      listOptions.cursor = cursor;
    }

    const result = await this.kv.list(listOptions);
    const invoices: InvoiceMetadata[] = [];

    for (const key of result.keys) {
      const invoiceId = key.name.split(':').pop();
      if (invoiceId) {
        const metadata = await this.getInvoiceMetadata(invoiceId);
        if (metadata) {
          invoices.push(metadata);
        }
      }
    }

    return {
      invoices: invoices.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      nextCursor: result.list_complete ? undefined : result.cursor,
    };
  }

  async listInvoicesByFolder(
    folderId: string,
    limit = 20,
    cursor?: string
  ): Promise<{
    invoices: InvoiceMetadata[];
    nextCursor?: string;
  }> {
    const listOptions: KVNamespaceListOptions = {
      limit,
      prefix: `invoice:folder:${folderId}:`,
    };

    if (cursor) {
      listOptions.cursor = cursor;
    }

    const result = await this.kv.list(listOptions);
    const invoices: InvoiceMetadata[] = [];

    for (const key of result.keys) {
      const invoiceId = key.name.split(':').pop();
      if (invoiceId) {
        const metadata = await this.getInvoiceMetadata(invoiceId);
        if (metadata) {
          invoices.push(metadata);
        }
      }
    }

    return {
      invoices: invoices.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      nextCursor: result.list_complete ? undefined : result.cursor,
    };
  }

  async searchInvoices(userId: string, query: string, limit = 100): Promise<InvoiceMetadata[]> {
    const userInvoices = await this.listInvoicesByUser(userId, limit);
    const lowerQuery = query.toLowerCase();

    return userInvoices.invoices.filter(
      (invoice) =>
        invoice.buyer.toLowerCase().includes(lowerQuery) ||
        invoice.seller.toLowerCase().includes(lowerQuery) ||
        invoice.id.toLowerCase().includes(lowerQuery)
    );
  }

  async updateInvoiceStatus(
    invoiceId: string,
    status: 'due' | 'paid'
  ): Promise<InvoiceMetadata | null> {
    const data = await this.getInvoiceData(invoiceId);
    if (!data) return null;

    // Update metadata
    const updatedMetadata = {
      ...data.metadata,
      status,
    };

    // Update storage data
    const updatedStorageData = {
      ...data,
      metadata: updatedMetadata,
    };

    // Save both full data and metadata
    await this.kv.put(`invoice:${invoiceId}`, JSON.stringify(updatedStorageData));
    await this.kv.put(`invoice:meta:${invoiceId}`, JSON.stringify(updatedMetadata));

    return updatedMetadata;
  }
}
