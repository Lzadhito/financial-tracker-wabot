# Financial Tracker WhatsApp Bot

A WhatsApp financial tracking bot built with Hono, Bun, Baileys, Drizzle ORM, and Ollama.

## Prerequisites

- **Bun** v1.1+ ([install](https://bun.sh/docs/installation))
- **PostgreSQL** 12+ running locally or remotely
- **Ollama Cloud API Key** ([get one](https://ollama.com/cloud))

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Create Database

```bash
# Create a PostgreSQL database
createdb finance_bot
```

### 3. Set Up Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your values:
```
DATABASE_URL=postgresql://user:password@localhost:5432/finance_bot
OLLAMA_API_KEY=your-ollama-cloud-api-key
OLLAMA_MODEL=qwen3.5
ADMIN_API_KEY=your-secret-key-here
TZ=Asia/Jakarta
NODE_ENV=development
```

**To get your Ollama Cloud API Key:**
1. Visit [ollama.com/cloud](https://ollama.com/cloud)
2. Sign up or log in
3. Create an API key in your account settings
4. Paste it in `OLLAMA_API_KEY`

### 4. Run Database Migrations

```bash
bun run db:generate  # Generate migration files (first time only)
bun run db:migrate   # Apply migrations
```

## Running

### Development

```bash
bun run dev
```

The bot will:
1. Start HTTP server on `http://localhost:3000`
2. Initialize Baileys WhatsApp connection
3. Show QR code at `http://localhost:3000/qr`

### Production

```bash
bun run start
```

## Endpoints

- `GET /health` - Health check (returns connection state)
- `GET /qr` - WhatsApp QR code display page
- `GET /ai/status` - Ollama status check (requires `x-api-key` header)

## Usage

1. Open `http://localhost:3000/qr` in a browser
2. Scan the QR code with WhatsApp on your phone
3. Start a DM or mention the bot in a group with:
   - `spent 50k lunch`
   - `income 5M salary`
   - `/summary` or `/summary week`
   - `/budget 2000000`
   - `/help`

## Architecture

```
src/
├── index.ts              # Entry point
├── env.ts                # Environment validation
├── db/
│   ├── index.ts          # Drizzle setup
│   └── schema.ts         # Database schema
├── whatsapp/
│   ├── client.ts         # Baileys socket
│   ├── listener.ts       # Message handler
│   └── sender.ts         # Reply helpers
├── ai/
│   ├── ollama.ts         # Ollama HTTP client
│   └── prompts.ts        # System prompts
├── handlers/
│   ├── transaction.ts    # Log transactions
│   ├── summary.ts        # Period summaries
│   ├── budget.ts         # Budget/income
│   ├── onboarding.ts     # First-time setup
│   ├── help.ts           # Help command
│   └── members.ts        # Group membership
├── services/
│   ├── user.service.ts
│   ├── ledger.service.ts
│   └── transaction.service.ts
├── jobs/
│   └── weekly-recap.ts   # Sunday 20:00 recap
├── router/
│   └── message-router.ts # Command dispatch
└── routes/
    └── admin.ts          # HTTP routes
```

## Key Features

- **Message Parsing**: Uses Ollama for natural language understanding
- **Deduplication**: Prevents duplicate transaction logging
- **Group Support**: Tracks finances for individuals and groups
- **Automatic Recap**: Weekly summary job (Sunday 20:00 WIB)
- **Budget Tracking**: Monthly budgets and income targets
- **Category Breakdown**: Expenses by category and member
- **No Chromium**: Uses Baileys WebSocket implementation (~50MB RAM)

## Database Schema

**users** - Phone numbers and display names
**ledgers** - Budget containers (personal or group)
**ledger_members** - User membership in ledgers
**transactions** - Expense/income records
**group_chats** - Maps WhatsApp group JIDs to ledgers
**ledger_settings** - Key-value configuration

## Notes

- **AI Model**: Uses Ollama Cloud API with `qwen3.5` model by default (fast & accurate)
- **Auth State**: Saved to `.baileys_auth/` (added to `.gitignore`)
- **WhatsApp**: Never use a personal WhatsApp number; create a test account
- **Production**: For scale, migrate from file-based auth state to Postgres-backed state
- **Money**: All amounts stored as integers (full Rupiah, no floats)
- **Timezone**: Defaults to `Asia/Jakarta`, configurable per ledger
