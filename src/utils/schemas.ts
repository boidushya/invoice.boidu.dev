import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().min(1, 'Address is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
});

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  qty: z.number().positive('Quantity must be positive'),
  unit: z.number().positive('Unit price must be positive'),
  tax: z.number().min(0).max(100, 'Tax must be between 0 and 100'),
});

export const userDefaultsSchema = z.object({
  seller: contactSchema,
  currency: z.string().length(3, 'Currency must be 3 characters'),
  notes: z.string().optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  defaults: userDefaultsSchema,
});

export const folderDefaultsSchema = z.object({
  buyer: contactSchema,
  currency: z.string().length(3, 'Currency must be 3 characters').optional(),
  notes: z.string().optional(),
});

export const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required'),
  company: z.string().min(1, 'Company name is required'),
  defaults: folderDefaultsSchema,
});

export const createInvoiceSchema = z.object({
  seller: contactSchema.optional(),
  buyer: contactSchema.optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item is required'),
  currency: z.string().length(3, 'Currency must be 3 characters').optional(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Issue date must be in YYYY-MM-DD format')
    .optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .optional(),
  taxRate: z.number().min(0).max(100, 'Tax rate must be between 0 and 100').optional().default(0),
  discountRate: z
    .number()
    .min(0)
    .max(100, 'Discount rate must be between 0 and 100')
    .optional()
    .default(0),
  notes: z.string().optional(),
});

export const authHeaderSchema = z.object({
  authorization: z.string().min(1, 'Authorization header is required'),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const searchSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type UserDefaultsInput = z.infer<typeof userDefaultsSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type FolderDefaultsInput = z.infer<typeof folderDefaultsSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type AuthHeaderInput = z.infer<typeof authHeaderSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
