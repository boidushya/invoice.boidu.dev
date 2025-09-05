export interface Contact {
  name: string;
  address: string;
  email: string;
  phone?: string;
}

export interface InvoiceItem {
  description: string;
  qty: number;
  unit: number;
  tax: number;
}

export interface CreateInvoiceRequest {
  seller: Contact;
  buyer: Contact;
  items: InvoiceItem[];
  currency: string;
  issueDate: string;
  dueDate: string;
  notes?: string;
}

export interface InvoiceMetadata {
  id: number;
  buyer: string;
  seller: string;
  total: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  createdAt: string;
}

export interface InvoiceListResponse {
  invoices: InvoiceMetadata[];
  nextCursor?: string;
}

export interface CloudflareEnv {
  INVOICE_KV: KVNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

export interface InvoiceStorageData {
  metadata: InvoiceMetadata;
  request: CreateInvoiceRequest;
}
