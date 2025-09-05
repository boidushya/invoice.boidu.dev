# Invoice API

A production-ready Cloudflare-hosted Invoice API built with Hono, TypeScript, and Biome. Generates clean, minimal invoices as selectable-text PDFs using the embedded Geist Mono variable font.

## Features

- 🚀 **Cloudflare Workers** - Deploy globally with edge computing
- 📄 **PDF Generation** - Sharp, minimal invoices with selectable text
- 🔤 **Geist Mono Font** - Embedded variable TTF font for crisp typography
- 💾 **Cloudflare KV** - Persistent storage for invoice metadata
- 🛡️ **TypeScript** - Full type safety
- 🎨 **Biome** - Fast linting and formatting
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

### Create Invoice
```http
POST /invoices
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

### Get Invoice Metadata
```http
GET /invoices/1234
```

**Response:**
```json
{
  "id": 1234,
  "buyer": "Jane Doe",
  "seller": "Acme Inc",
  "total": 700,
  "currency": "USD",
  "issueDate": "2025-01-01",
  "dueDate": "2025-01-15",
  "createdAt": "2025-01-01T10:00:00Z"
}
```

### List Invoices
```http
GET /invoices?limit=20&cursor=abc123
```

**Response:**
```json
{
  "invoices": [
    { "id": 1234, "buyer": "Jane Doe", "total": 700 },
    { "id": 1235, "buyer": "John Smith", "total": 250 }
  ],
  "nextCursor": "def456"
}
```

### Additional Endpoints

- `GET /metadata/stats` - Get invoice statistics
- `GET /metadata/search?q=query` - Search invoices
- `GET /` - Health check

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
│   ├── invoices.ts       # Invoice CRUD endpoints
│   └── metadata.ts       # Metadata and search endpoints
├── utils/
│   ├── pdf.ts            # PDF generation with font embedding
│   ├── storage.ts        # Cloudflare KV operations
│   └── validators.ts     # Input validation
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
# Test with example data
curl -X POST http://localhost:8787/invoices \
  -H "Content-Type: application/json" \
  -d @test-example.json \
  --output invoice.pdf

# Run automated tests
./test-api.sh
```

## License

MIT
