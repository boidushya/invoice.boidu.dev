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

export interface UserDefaults {
  seller: Contact;
  currency: string;
  notes?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  defaults: UserDefaults;
}

export interface FolderDefaults {
  buyer: Contact;
  currency?: string;
  notes?: string;
}

export interface Folder {
  id: string;
  userId: string;
  name: string;
  company: string;
  createdAt: string;
  defaults: FolderDefaults;
  invoiceCounter: number;
}

export interface CreateInvoiceRequest {
  seller: Contact;
  buyer: Contact;
  items: InvoiceItem[];
  currency: string;
  issueDate: string;
  dueDate: string;
  taxRate?: number;
  discountRate?: number;
  notes?: string;
}

export interface InvoiceMetadata {
  id: string;
  userId: string;
  folderId: string;
  number: number;
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
  AUTH_SECRET?: string;
}

export interface InvoiceStorageData {
  metadata: InvoiceMetadata;
  request: CreateInvoiceRequest;
}

export interface AuthContext {
  userId: string;
  user: User;
}

export type AppContext = {
  Bindings: CloudflareEnv;
  Variables: { auth: AuthContext };
};

export type FontType = 'regular' | 'medium' | 'semibold';
