# Invoice API

A production-ready Cloudflare-hosted Invoice API built with Hono, TypeScript, and Biome. Generates clean, minimal invoices as selectable-text PDFs using the embedded Geist Mono variable font with user/folder organization and API key authentication. Includes a powerful CLI tool for streamlined invoice creation and management.

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
- 🖥️ **CLI Tool** - Interactive command-line interface for invoice management

## Font Setup

The API uses Geist Mono variable font files located at:

```text
public/fonts/GeistMono-regular.ttf
public/fonts/GeistMono-medium.ttf
public/fonts/GeistMono-semibold.ttf
```

This font is automatically embedded in generated PDFs, ensuring:

- ✅ Sharp, crisp text rendering
- ✅ Fully selectable/copyable text
- ✅ Consistent typography across all invoices
- ✅ Fallback to Helvetica if font loading fails

## CLI Tool

Interactive CLI wrapper for creating and managing invoices.

### 🚀 Quick Install

**Install globally with a single command:**

```bash
curl -sSL https://invoice.boidu.dev/install.sh | bash
```

**Then start using immediately:**

```bash
invoice setup    # One-time setup
invoice new      # Create your first invoice

invoice --help   # Help
```

> [!NOTE]
> Requires Node.js 18+ and either curl or wget.

### Help

```text
Usage: invoice [options] [command]

⚡ Ultra-fast invoice creation

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  setup                      🔧 One-time setup
  new|create [options]       🚀 Create new invoice (main command)
  list|ls [options]          📋 List recent invoices
  paid <invoiceId>           ✅ Mark invoice as paid
  get [options] <invoiceId>  📄 Download invoice PDF
  stats                      📊 Revenue stats
  clients                    👥 Manage clients
  config [options]           ⚙️ Settings
  self-update                🔄 Update CLI to latest version
  help [command]             display help for command

🚀 Common Workflow:

  invoice setup              First-time setup
  invoice new                Create invoice
  invoice paid INV-XXX-001   Mark as paid
  invoice stats              Check revenue
  invoice self-update        Update CLI

⚡ Power User Tips:

  invoice new -c acme -a 1500 -d "Website redesign"
  invoice clients            # List client nicknames
  invoice config --due-days 15 # Change defaults
```

### Manual Installation & Usage

```bash
# Build the CLI
pnpm run build:cli

# Run the CLI
node dist-cli/index.js

# Or use directly with commands
node dist-cli/index.js setup
```

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

#### Get Invoice PDF

```http
GET /invoices/INV-JOH-ACME-0001
Authorization: Bearer your_api_key
```

**Response:** PDF file with `Content-Type: application/pdf`

#### Update Invoice Status

```http
PATCH /invoices/INV-JOH-ACME-0001/status
Authorization: Bearer your_api_key
Content-Type: application/json

{
  "status": "paid"
}
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
  "status": "paid",
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
- pnpm package manager
- Cloudflare account
- Wrangler CLI

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Font files are included:**

   ```bash
   # Geist Mono font files are already included in:
   public/fonts/GeistMono-regular.ttf
   public/fonts/GeistMono-medium.ttf
   public/fonts/GeistMono-semibold.ttf
   ```

3. **Configure Cloudflare KV:**

   ```bash
   wrangler kv:namespace create "INVOICE_KV"
   wrangler kv:namespace create "INVOICE_KV" --preview
   ```

4. **Update `wrangler.toml`** with your KV namespace IDs

5. **Development:**

   ```bash
   pnpm run dev
   ```

6. **Build CLI:**

   ```bash
   pnpm run build:cli
   ```

7. **Linting and formatting:**

   ```bash
   pnpm run lint
   pnpm run format
   pnpm run check  # Run both lint + format
   ```

8. **Testing:**

   ```bash
   pnpm test
   ```

### Deployment

```bash
pnpm run build    # Build TypeScript
pnpm run deploy   # Deploy to Cloudflare Workers
```

## Project Structure

```text
├── cli/
│   └── index.ts          # CLI application with interactive prompts
├── dist-cli/
│   └── index.js          # Built CLI bundle
├── public/
│   └── fonts/            # Geist Mono font files for PDF embedding
│       ├── GeistMono-regular.ttf
│       ├── GeistMono-medium.ttf
│       └── GeistMono-semibold.ttf
├── src/
│   ├── index.ts          # Main entry point
│   ├── worker.ts         # Hono app configuration
│   ├── types.ts          # TypeScript type definitions
│   ├── routes/
│   │   ├── users.ts      # User management endpoints
│   │   ├── folders.ts    # Folder management endpoints
│   │   ├── invoices.ts   # Invoice CRUD endpoints
│   │   └── metadata.ts   # Metadata and search endpoints
│   ├── utils/
│   │   ├── auth.ts       # Authentication and API key management
│   │   ├── schemas.ts    # Zod validation schemas
│   │   ├── storage.ts    # Multi-user KV storage operations
│   │   ├── pdf.ts        # PDF generation with font embedding
│   │   └── validators.ts # Input validation helpers
│   └── templates/
│       └── invoice-template.ts # Invoice calculations and formatting
├── tests/                # Test files
├── biome.json            # Biome configuration
├── tsconfig.json         # TypeScript configuration
├── tsconfig.cli.json     # CLI-specific TypeScript configuration
└── wrangler.toml         # Cloudflare Workers configuration
```

## Design Philosophy

- **Minimal & Sharp** - Clean geometric design with Geist Mono variable font
- **Selectable Text** - PDFs use embedded fonts for copyable text
- **Type Safety** - Full TypeScript coverage
- **Modular** - One utility per file, single responsibility
- **Edge-Ready** - Optimized for Cloudflare Workers
- **Developer Experience** - Interactive CLI with smart defaults and caching

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

### CLI Configuration

- Uses `conf` package for persistent settings
- Stores API key, user preferences, and client cache
- Configurable defaults for tax rate, due days, etc.

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
