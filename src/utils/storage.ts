import type {
  CloudflareEnv,
  InvoiceMetadata,
  InvoiceStorageData,
  CreateInvoiceRequest,
} from '@/types';

export class InvoiceStorage {
  constructor(private kv: KVNamespace) {}

  async getNextInvoiceId(): Promise<number> {
    const currentId = await this.kv.get('invoice:counter');
    const nextId = currentId ? Number.parseInt(currentId, 10) + 1 : 1;
    await this.kv.put('invoice:counter', nextId.toString());
    return nextId;
  }

  async saveInvoice(id: number, request: CreateInvoiceRequest): Promise<InvoiceMetadata> {
    const total = request.items.reduce((sum, item) => {
      const subtotal = item.qty * item.unit;
      const taxAmount = subtotal * (item.tax / 100);
      return sum + subtotal + taxAmount;
    }, 0);

    const metadata: InvoiceMetadata = {
      id,
      buyer: request.buyer.name,
      seller: request.seller.name,
      total: Math.round(total * 100) / 100,
      currency: request.currency,
      issueDate: request.issueDate,
      dueDate: request.dueDate,
      createdAt: new Date().toISOString(),
    };

    const storageData: InvoiceStorageData = {
      metadata,
      request,
    };

    await this.kv.put(`invoice:${id}`, JSON.stringify(storageData));
    await this.kv.put(`invoice:meta:${id}`, JSON.stringify(metadata));

    return metadata;
  }

  async getInvoiceMetadata(id: number): Promise<InvoiceMetadata | null> {
    const data = await this.kv.get(`invoice:meta:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async getInvoiceData(id: number): Promise<InvoiceStorageData | null> {
    const data = await this.kv.get(`invoice:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async listInvoices(
    limit = 20,
    cursor?: string
  ): Promise<{
    invoices: InvoiceMetadata[];
    nextCursor?: string;
  }> {
    const listOptions: KVNamespaceListOptions = {
      limit,
      prefix: 'invoice:meta:',
    };

    if (cursor) {
      listOptions.cursor = cursor;
    }

    const result = await this.kv.list(listOptions);
    const invoices: InvoiceMetadata[] = [];

    for (const key of result.keys) {
      const data = await this.kv.get(key.name);
      if (data) {
        invoices.push(JSON.parse(data));
      }
    }

    return {
      invoices: invoices.sort((a, b) => b.id - a.id),
      nextCursor: result.list_complete ? undefined : result.cursor,
    };
  }
}
