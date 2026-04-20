# Command Inventory

> Generated during Phase 0 discovery. Documents every existing slash command and AI-parsed intent.

---

## Slash Commands

All slash commands are routed via `handleSlashCommand()` in [`src/router/message-router.ts`](../src/router/message-router.ts).

| Command | Parameters | Handler | DB Operation | Notes |
|---|---|---|---|---|
| `/help` | _(none)_ | `handleHelp()` in `src/handlers/help.ts` | None (read-only) | Prints command reference |
| `/summary` | `[today\|week\|month]` `[MM/YYYY]` `[MM/DD/YYYY]` `[YYYY]` `[MonthName [Day] [Year]]` `[user]` `[@mention\|name]` | `handleQuerySummary()` in `src/handlers/summary.ts` | Read: transactions (with user join) for date range | Supports `user` flag for per-member breakdown, `@mention` or fuzzy name for single-member filter |
| `/transactions` | Same as `/summary` | `handleTransactionsList()` in `src/handlers/transactions-list.ts` | Read: transactions (with user join) for date range | Shows individual entries; supports `user` grouping & member filter |
| `/income` | `[amount]` or `[date filter]` | If amount → `handleSetIncome()` in `src/handlers/budget.ts`; else → `handleIncomeReport()` in `src/handlers/income-report.ts` | Write: `ledgers.monthlyIncome` OR Read: income transactions | Dual purpose: set income target or view income report |
| `/set-income` / `/setincome` | `<amount>` | `handleSetIncome()` in `src/handlers/budget.ts` | Write: `ledgers.monthlyIncome` | Explicit alias for setting income |
| `/budget` | `<amount>` | `handleSetBudget()` in `src/handlers/budget.ts` | Write: `ledgers.monthlyBudget` | Sets monthly budget |
| `/delete` | `<name> [<day> <month>] [HH:MM]` or `<name> #N` | `handleDeleteTransaction()` in `src/handlers/delete-transaction.ts` | Write: `transactions.deletedAt` (soft delete) | Uses AI (`parseDeleteQueryWithOllama`) for date extraction; supports index-based selection |

### Amount parsing (slash commands)

`parseAmount()` in `message-router.ts` handles suffixes: `k`/`K`/`m`/`M` (×1000), `rb`/`RB` (×1000), `jt`/`JT` (×1,000,000).

---

## AI-parsed intents (natural language)

When no `/` prefix is detected, the message is sent to `parseMessageWithOllama()` in `src/ai/haiku.ts`.

| Intent | Dispatched To | DB Operation |
|---|---|---|
| `log_expense` | `handleLogTransaction()` in `src/handlers/transaction.ts` | Write: `transactions` row (expense) |
| `log_income` | `handleLogTransaction()` in `src/handlers/transaction.ts` | Write: `transactions` row (income) |
| `query_summary` | `handleQuerySummary()` in `src/handlers/summary.ts` | Read: transactions |
| `set_budget` | `handleSetBudget()` in `src/handlers/budget.ts` | Write: `ledgers.monthlyBudget` |
| `set_income` | `handleSetIncome()` in `src/handlers/budget.ts` | Write: `ledgers.monthlyIncome` |
| `unknown` | Sends generic "I didn't understand" text | None |

**Current AI model:** Anthropic Claude Haiku (configurable via `ANTHROPIC_MODEL` env var, default `claude-3-haiku-20240307`).

---

## Other message handlers (non-command)

| Trigger | Handler | Location |
|---|---|---|
| First message to unregistered group | `handleGroupOnboarding()` | `src/handlers/onboarding.ts` |
| First DM to unregistered user | `handleDMOnboarding()` | `src/handlers/onboarding.ts` |
| Group participant join | `handleMemberJoin()` | `src/handlers/members.ts` |
| Group participant leave | `handleMemberLeave()` | `src/handlers/members.ts` |
| Weekly cron (Sunday 20:00) | `startWeeklyRecapJob()` | `src/jobs/weekly-recap.ts` |

---

## Entry point & mention detection

- **Message entry:** `setupMessageListener()` in `src/whatsapp/listener.ts`
- **Mention detection:** Lines 80–100 of `listener.ts` — compares `mentionedJid` array against bot's own JID and LID. Skips if bot not mentioned in group.
- **Mention stripping:** Bot @mention tokens and other user @mention tokens are stripped from text before routing.
- **Routing:** `routeMessage()` in `src/router/message-router.ts` — tries slash command first, then AI parsing.

---

## DB layer

- **ORM:** Drizzle ORM with PostgreSQL (`drizzle-orm` + `postgres` driver)
- **Schema:** `src/db/schema.ts`
- **Connection:** `src/db/index.ts`

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `users` | User identity | `id`, `phoneNumber`, `displayName` |
| `ledgers` | Budget/finance container | `id`, `name`, `monthlyIncome`, `monthlyBudget`, `currency`, `timezone` |
| `ledger_members` | User ↔ Ledger mapping | `ledgerId`, `userId`, `role` (`owner`/`member`), `leftAt` |
| `transactions` | All income/expense entries | `ledgerId`, `userId`, `amount`, `category`, `transactionType`, `messageId`, `rawMessage`, `aiParsedData`, `deletedAt` |
| `group_chats` | WhatsApp group JID → Ledger mapping | `whatsappGroupId`, `ledgerId` |
| `ledger_settings` | Key-value settings per ledger | `ledgerId`, `key`, `value` |

### Deletion semantics

Soft delete: `transactions.deletedAt` is set; deleted rows still appear in lists but are excluded from totals.

---

## Session / state storage

**None.** No in-memory session, no conversation context, no pending state. Each message is processed independently.

---

## Schema compatibility with §5 ownership model

### ✅ Compatible

- **Ledger is keyed by group JID** via `group_chats.whatsappGroupId → ledgerId`. One group = one ledger. ✅
- **Entries tagged with `userId`** (equivalent to `logged_by` in §5). ✅
- **Any member can delete** any entry (no ownership check in `softDeleteTransaction`). ✅
- **Solo use** = DM creates a personal ledger with just the user. Same code path. ✅
- **One user can belong to multiple groups** = separate ledgers via `ledger_members`. ✅

### ⚠️ Minor naming difference

- Schema uses `userId` on `transactions`; §5 calls it `logged_by`. These are semantically identical. No migration needed — just document the mapping.

### ⚠️ No schema change required

The existing schema fully supports the §5 ownership model. No migration needed.
