# Invoice API

A production-ready Cloudflare-hosted Invoice API built with Hono, TypeScript, and Biome. Generates clean, minimal invoices as selectable-text PDFs using the embedded Geist Mono variable font with user/folder organization and API key authentication.

## Features

- 🚀 **Cloudflare Workers** - Deploy globally with edge computing
- 📄 **PDF Generation** - Sharp, minimal invoices with selectable text
- 🔤 **Geist Mono Font** - Embedded variable TTF font for crisp typography
- 💾 **Cloudflare KV** - Persistent storage for invoice metadata
- 🛡️ **TypeScript** - Full type safety with Zod validation
- 🎨 **Biome** - Fast linting and formatting
- 🔐 **Authentication** - API key-based authentication
- 👥 **Multi-User** - User/folder organization with custom invoice IDs
- 📊 **RESTful API** - Create, retrieve, and list invoices

## Font Setup

The API uses your local `GeistMono.ttf` variable font file located at:
```
src/assets/fonts/GeistMono.ttf
```

This font is automatically embedded in generated PDFs, ensuring:
- ✅ Sharp, crisp text rendering
- ✅ Fully selectable/copyable text
- ✅ Consistent typography across all invoices
- ✅ Fallback to Helvetica if font loading fails

## API Endpoints

All endpoints require authentication via Bearer token in the Authorization header:
```http
Authorization: Bearer your_api_key_here
```

### User Management

#### Create User
```http
POST /users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "defaults": {
    "seller": {
      "name": "Acme Inc",
      "address": "123 Office Rd, City, Country",
      "email": "invoices@acme.test",
      "phone": "+1 123 456 7890"
    },
    "currency": "USD",
    "notes": "Thanks for your business"
  }
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "name": "John Doe", "email": "john@example.com", ... },
  "apiKey": "ak_uuid_randomstring"
}
```

#### Get User Profile
```http
GET /users/me
Authorization: Bearer your_api_key
```

### Folder Management

#### Create Folder
```http
POST /folders
Authorization: Bearer your_api_key
Content-Type: application/json

{
  "name": "ACME Project",
  "company": "ACME",
  "defaults": {
    "buyer": {
      "name": "ACME Corp",
      "address": "456 Client St, City, Country",
      "email": "accounting@acme.com"
    },
    "currency": "USD"
  }
}
```

#### List Folders
```http
GET /folders
Authorization: Bearer your_api_key
```

### Invoice Management

#### Create Invoice
```http
POST /invoices/folders/{folderId}
Authorization: Bearer your_api_key
Content-Type: application/json

{
  "seller": {
    "name": "Acme Inc",
    "address": "123 Office Rd, City, Country",
    "email": "invoices@acme.test",
    "phone": "+1 123 456 7890"
  },
  "buyer": {
    "name": "Jane Doe",
    "address": "456 Home St, City, Country",
    "email": "jane@example.com"
  },
  "items": [
    { "description": "Design work", "qty": 10, "unit": 50.00, "tax": 0.0 },
    { "description": "Consulting", "qty": 2, "unit": 200.00, "tax": 0.0 }
  ],
  "currency": "USD",
  "issueDate": "2025-01-01",
  "dueDate": "2025-01-15",
  "notes": "Thanks for your business"
}
```

**Response:** PDF file with `Content-Type: application/pdf`  
**Invoice ID Format:** `INV-{userPrefix}-{companyPrefix}-{number}` (e.g., `INV-JOH-ACME-0001`)

#### Get Invoice Metadata
```http
GET /invoices/INV-JOH-ACME-0001
Authorization: Bearer your_api_key
```

**Response:**
```json
{
  "id": "INV-JOH-ACME-0001",
  "userId": "uuid",
  "folderId": "uuid",
  "number": 1,
  "buyer": "Jane Doe",
  "seller": "Acme Inc",
  "total": 700,
  "currency": "USD",
  "issueDate": "2025-01-01",
  "dueDate": "2025-01-15",
  "createdAt": "2025-01-01T10:00:00Z"
}
```

#### List User Invoices
```http
GET /invoices?limit=20&cursor=abc123
Authorization: Bearer your_api_key
```

#### List Folder Invoices
```http
GET /folders/{folderId}/invoices?limit=20
Authorization: Bearer your_api_key
```

### Metadata & Search

#### Get User Statistics
```http
GET /metadata/stats
Authorization: Bearer your_api_key
```

#### Search Invoices
```http
GET /metadata/search?q=query
Authorization: Bearer your_api_key
```

### Additional Endpoints

- `GET /` - Health check (no auth required)
- `PUT /users/me` - Update user profile
- `POST /users/api-keys` - Generate new API key
- `DELETE /users/api-keys/{key}` - Revoke API key

## Development

### Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI
- GeistMono.ttf font file in `src/assets/fonts/`

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Add your GeistMono.ttf font:**
   ```bash
   # Place your GeistMono.ttf file in:
   src/assets/fonts/GeistMono.ttf
   ```

3. **Configure Cloudflare KV:**
   ```bash
   wrangler kv:namespace create "INVOICE_KV"
   wrangler kv:namespace create "INVOICE_KV" --preview
   ```

4. **Update `wrangler.toml`** with your KV namespace IDs

5. **Development:**
   ```bash
   npm run dev
   ```

6. **Linting and formatting:**
   ```bash
   npm run lint
   npm run format
   ```

7. **Testing:**
   ```bash
   npm test
   ```

### Deployment

```bash
npm run deploy
```

## Project Structure

```
src/
├── index.ts              # Main entry point
├── worker.ts             # Hono app configuration
├── types.ts              # TypeScript type definitions
├── assets/
│   └── fonts/
│       └── GeistMono.ttf # Embedded variable font
├── routes/
│   ├── users.ts          # User management endpoints
│   ├── folders.ts        # Folder management endpoints
│   ├── invoices.ts       # Invoice CRUD endpoints
│   └── metadata.ts       # Metadata and search endpoints
├── utils/
│   ├── auth.ts           # Authentication and API key management
│   ├── schemas.ts        # Zod validation schemas
│   ├── storage-v2.ts     # Multi-user KV storage operations
│   ├── pdf.ts            # PDF generation with font embedding
│   └── validators.ts     # Input validation helpers
└── templates/
    └── invoice-template.ts # Invoice calculations and formatting
```

## Design Philosophy

- **Minimal & Sharp** - Clean geometric design with Geist Mono variable font
- **Selectable Text** - PDFs use embedded fonts for copyable text
- **Type Safety** - Full TypeScript coverage
- **Modular** - One utility per file, single responsibility
- **Edge-Ready** - Optimized for Cloudflare Workers

## Configuration

### Biome (biome.json)
- Single quotes, semicolons, trailing commas
- 2-space indentation, 100 character line width
- Strict linting rules

### TypeScript (tsconfig.json)
- ES2022 target, ESNext modules
- Strict mode enabled
- Cloudflare Workers types
- Path mapping with `@/` alias

### Wrangler (wrangler.toml)
- KV namespace binding
- Asset binding for font files
- Environment variables
- Compatibility date

## Testing

Use the provided test files:

```bash
# 1. Create a user and get API key
curl -X POST http://localhost:8787/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "defaults": {
      "seller": {
        "name": "Test Company",
        "address": "123 Test St",
        "email": "test@company.com"
      },
      "currency": "USD"
    }
  }'

# 2. Create a folder (use API key from step 1)
curl -X POST http://localhost:8787/folders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "name": "Test Project",
    "company": "ACME",
    "defaults": {
      "buyer": {
        "name": "ACME Corp",
        "address": "456 Client St",
        "email": "accounting@acme.com"
      }
    }
  }'

# 3. Create invoice (use folder ID from step 2)
curl -X POST http://localhost:8787/invoices/folders/{folderId} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d @test-example.json \
  --output invoice.pdf

# Run automated tests
pnpm test
```

## License

MIT
