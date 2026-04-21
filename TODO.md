 Plan: List/Summary Date Filters, Date-Specific Transactions, Bug Fix, Onboarding                                                                                
                                                        
 Context

 WhatsApp financial tracker bot needs several features and a critical bug fix. Currently:
 - list/show NLU only shows today's transactions (hardcoded)
 - summary via NLU only works as single-word trigger → defaults to this_month
 - "summary 19 april 2026" gets misclassified as add_expense (amount=2026, desc="summary 19 april") due to AMOUNT_SUFFIX_RE regex greedily matching
 - Expenses/income always record with createdAt = now() — no backdating support
 - Onboarding and help messages are minimal

 Bug Fix: "summary 19 april 2026" → expense

 Root cause: In src/nlu/fastPath.ts, AMOUNT_SUFFIX_RE ^(.+?)\s+(amount_pattern)$ matches "summary 19 april 2026" as label="summary 19 april", amount="2026". The
  guard at line 301 only checks exact match against REPORT_TRIGGERS/MENU_TRIGGERS sets, so "summary 19 april" doesn't match "summary".

 Fix in src/nlu/fastPath.ts:
 - In the AMOUNT_SUFFIX_RE handler (around line 294-315), change the guard to check if desc's first word is in any command trigger set (MENU_TRIGGERS,
 REPORT_TRIGGERS, SHOW_TRANSACTIONS_TRIGGERS, UNDO_TRIGGERS, DELETE_TRIGGERS):
 const descFirstWord = desc.toLowerCase().split(/\s+/)[0]
 if (MENU_TRIGGERS.has(descFirstWord) || REPORT_TRIGGERS.has(descFirstWord)
     || SHOW_TRANSACTIONS_TRIGGERS.has(descFirstWord) || UNDO_TRIGGERS.has(descFirstWord)
     || DELETE_TRIGGERS.has(descFirstWord)) {
   return null  // let Haiku or other fast-path patterns handle
 }
 - Apply same guard in AMOUNT_PREFIX_RE handler (line 270-291) — check if remainder starts with a command word

 ---
 Feature 1: List with date filters (specific date, yesterday, this week, this month)

 Goal: list yesterday, list this week, list this month, list 19 april, list april 2026

 1a. Extend fast path (src/nlu/fastPath.ts)

 Currently lines 149-158 catch SHOW_TRANSACTIONS_TRIGGERS as first word and return immediately with no entities. Change to:

 - After detecting first word is a show trigger, extract remaining text as date args
 - Add a helper parseInlineDateToFilter(text: string): DateFilter | null that handles:
   - "yesterday" / "kemarin" → { type: 'period', period: 'yesterday' } (need to add 'yesterday' to DateFilter period union)
   - "today" / "hari ini" → { type: 'period', period: 'today' }
   - "this week" / "minggu ini" → { type: 'period', period: 'week' }
   - "this month" / "bulan ini" → { type: 'period', period: 'month' }
   - Natural dates like "19 april", "april 2026" → delegate to parseDateFilter(args.split(' '))
 - Return show_transactions intent with a new dateFilter entity (or encode period)

 Wait — better approach: Don't add dateFilter to ParsedEntities. Instead:
 - Add 'yesterday' to the DateFilter period union type in src/utils/date-filter.ts
 - Encode the date as period entity in ParsedEntities (extend Period type to include 'yesterday')
 - For specific dates, pass through Haiku (the fast path should return null for complex date parsing)

 Simpler approach for fast path:
 if (SHOW_TRANSACTIONS_TRIGGERS.has(firstWord)) {
   const rest = lower.slice(firstWord.length).trim()
   if (!rest) {
     // No date arg → default today
     return { intent: 'show_transactions', confidence: 0.9, entities: {}, source: 'fast_path' }
   }
   // Check known period keywords
   const periodMap: Record<string, Period> = {
     'yesterday': 'yesterday', 'kemarin': 'yesterday',
     'today': 'today', 'hari ini': 'today',
     'this week': 'this_week', 'minggu ini': 'this_week',
     'this month': 'this_month', 'bulan ini': 'this_month',
   }
   const period = periodMap[rest]
   if (period) {
     return { intent: 'show_transactions', confidence: 0.9, entities: { period }, source: 'fast_path' }
   }
   // For specific dates like "19 april", fall through to Haiku
   return null
 }

 1b. Update NLU prompt (src/nlu/prompts.ts)

 Add to show_transactions intent description:
 - show_transactions — list/view transactions with optional date filter ("list yesterday", "show this week", "list 19 april")

 1c. Extend handleShowTransactions (src/nlu/handlers/showTransactions.ts)

 Currently: handleShowTransactions(ledgerId) → only today via getTodayTransactions.

 Change signature to: handleShowTransactions(ledgerId, parsed: ParsedIntent)

 Inside:
 - Use parsed.entities.period to determine date filter
 - Use periodToDateFilter() (from querySpending.ts — extract to shared util or import) to convert period → DateFilter
 - Use dateFilterToRange() + getTransactionsWithUserInRange() for the query
 - Build response text similar to current format but with correct label

 1d. Update router (src/router/message-router.ts)

 In routeNluMessage switch case for show_transactions:
 case 'show_transactions':
   response = await handleShowTransactions(ledgerId, parsed)
   break

 1e. Update DateFilter type (src/utils/date-filter.ts)

 Add 'yesterday' to period union:
 export type DateFilter =
   | { type: 'period'; period: 'today' | 'yesterday' | 'week' | 'month' }
   | { type: 'range'; start: Date; end: Date; label: string }

 Add yesterday case to dateFilterToRange():
 case 'yesterday': {
   const start = fromZonedTime(new Date(Date.UTC(y, mo, d - 1)), JAKARTA_TZ)
   const end = fromZonedTime(new Date(Date.UTC(y, mo, d)), JAKARTA_TZ)
   return { start, end, label: 'Yesterday' }
 }

 ---
 Feature 2: Summary with specific date

 Goal: summary yesterday, summary 19 april, summary this week

 2a. Extend fast path for summary/report triggers (src/nlu/fastPath.ts)

 Currently line 140-148 only catches exact single-word match. Change to check first word:

 if (REPORT_TRIGGERS.has(firstWord)) {
   const rest = lower.slice(firstWord.length).trim()
   if (!rest) {
     return { intent: 'query_spending', confidence: 0.9, entities: { period: 'this_month' }, source: 'fast_path' }
   }
   // Check period keywords (same map as list)
   const period = periodMap[rest]
   if (period) {
     return { intent: 'query_spending', confidence: 0.9, entities: { period }, source: 'fast_path' }
   }
   // Complex dates → fall to Haiku
   return null
 }

 Move the REPORT_TRIGGERS check AFTER the single-word check but BEFORE amount regex patterns. Actually the current position at line 140 already checks
 REPORT_TRIGGERS.has(lower) (exact full text). Change to check firstWord instead, then parse remaining args.

 2b. handleQuerySpending already handles periods

 The existing periodToDateFilter() in src/nlu/handlers/querySpending.ts already maps period strings to DateFilter. Just ensure it also handles 'yesterday' (it
 already does at line 16).

 For specific dates from Haiku (ISO range), need to handle that in periodToDateFilter or in the classify step.

 ---
 Feature 3: Add expense/income with specific date or yesterday

 Goal: spent 50k lunch yesterday, income 5jt salary 19 april, coffee 50k kemarin

 3a. Add transactionDate to ParsedEntities (src/nlu/types.ts)

 export interface ParsedEntities {
   amount?: number
   currency?: string
   merchant?: string
   category?: string
   period?: Period
   description?: string
   items?: ExpenseItem[]
   transactionDate?: string  // "yesterday", "2026-04-19", or period keyword
 }

 3b. Update NLU prompt (src/nlu/prompts.ts)

 Add to entities section:
 - transactionDate: date for the transaction if explicitly stated ("yesterday", "kemarin", "19 april", "last tuesday"). Only set when user explicitly references
  a past date for the expense/income. Do NOT set for the current day.

 3c. Update fast path (src/nlu/fastPath.ts)

 For amount+label patterns, detect trailing date keywords:
 - After matching expense pattern, check if description ends with a date keyword ("yesterday", "kemarin")
 - Strip the date keyword from description, set transactionDate entity
 - For complex dates ("19 april"), let Haiku handle (return null)

 Example approach:
 const YESTERDAY_KEYWORDS = new Set(['yesterday', 'kemarin'])

 // In expense handlers, after extracting desc:
 const descWords = desc.split(/\s+/)
 const lastWord = descWords[descWords.length - 1].toLowerCase()
 if (YESTERDAY_KEYWORDS.has(lastWord)) {
   const cleanDesc = descWords.slice(0, -1).join(' ')
   return {
     intent: 'add_expense', confidence: 0.85,
     entities: { amount, description: cleanDesc, category: guessCategory(cleanDesc), transactionDate: 'yesterday' },
     source: 'fast_path'
   }
 }

 3d. Update recordTransaction (src/services/transaction.service.ts)

 Add optional createdAt parameter:
 export async function recordTransaction(data: {
   // ...existing fields...
   createdAt?: Date  // optional override for backdated entries
 }) {
   const [created] = await db.insert(transactions).values({
     // ...existing fields...
     createdAt: data.createdAt ?? new Date(),  // use override or default to now
   }).returning()
   return created
 }

 Note: The schema uses defaultNow() which only applies when no value is provided at insert time. Drizzle allows overriding it by passing a value explicitly.

 3e. Update addExpense handler (src/nlu/handlers/addExpense.ts)

 - Import dateFilterToRange, date utilities
 - After validating amount, check parsed.entities.transactionDate
 - If "yesterday" → compute yesterday's date (midday Jakarta time to be safe)
 - If ISO date → parse to Date
 - Replace the isFutureDated check: if transactionDate is set AND in the future → reject
 - Pass createdAt override to recordTransaction
 - Update success message to indicate the date logged for

 3f. Update addIncome handler (src/nlu/handlers/addIncome.ts)

 Same changes as addExpense.

 ---
 Feature 4: Command list in WA bot

 Goal: Comprehensive command reference accessible via natural language

 4a. Update handleShowMenu (src/nlu/handlers/showMenu.ts)

 Rewrite to include all available commands with examples:

 const menuText = `📋 *What I can do:*

 💰 *Log Expenses* (natural language)
 • \`coffee 50k\` or \`50rb kopi\`
 • \`spent 75k groceries\`
 • \`lunch 35k, coffee 15k\` _(multiple)_
 • \`coffee 50k yesterday\` _(backdate)_

 📥 *Log Income*
 • \`income 5jt salary\`
 • \`gaji 5000000\`

 📊 *View Summary*
 • \`summary\` or \`report\`
 • \`summary yesterday\`
 • \`summary this week\`
 • \`summary april 2026\`

 📋 *List Transactions*
 • \`list\` or \`show\`
 • \`list yesterday\`
 • \`list this week\`

 🎯 *Budget & Income Target*
 • \`budget 2jt\`
 • \`/set-income 5jt\`

 ↶ *Undo / Delete*
 • \`undo\` _(within 5 min)_
 • \`/delete beli kopi 16 april\`

 ⚙️  *Slash Commands*
 /summary · /transactions · /income · /budget · /delete · /help

 💡 Tip: Just type naturally — I understand Indonesian & English!`

 4b. Update /help command (src/handlers/help.ts)

 Add new date filter examples:
 - /summary yesterday
 - /summary 19 april 2026
 - /transactions yesterday
 - /transactions this week

 Also add natural language section.

 ---
 Feature 5: Better onboarding

 5a. Update group onboarding (src/handlers/onboarding.ts)

 Rewrite handleGroupOnboarding reply to:
 👋 Hi everyone! I'm your group finance tracker.

 *Quick start — just mention me:*
 • @FinanceBot lunch 50k
 • @FinanceBot income 5jt salary
 • @FinanceBot summary
 • @FinanceBot list

 *I understand natural language in Indonesian & English:*
 • "kopi 15rb" ✓
 • "spent 75k groceries" ✓
 • "gaji 5jt" ✓

 *Set up your budget:*
 • @FinanceBot /budget 2000000
 • @FinanceBot /set-income 5000000

 *Tips for accuracy:*
 • Include the amount: "50k" or "50rb" or "50000"
 • Add a description: "lunch 50k" not just "50k"
 • Say "undo" within 5 min if something's wrong

 Type @FinanceBot menu anytime for full command list.

 5b. Update DM onboarding

 Similar rewrite for personal/DM context (no @mention needed).

 ---
 Files to modify (in order)

 ┌─────┬──────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
 │  #  │                 File                 │                                     Changes                                     │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 1   │ src/utils/date-filter.ts             │ Add 'yesterday' to DateFilter period union + dateFilterToRange case             │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 2   │ src/nlu/types.ts                     │ Add transactionDate?: string to ParsedEntities                                  │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 3   │ src/nlu/prompts.ts                   │ Update NLU_SYSTEM_PROMPT: show_transactions description, transactionDate entity │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 4   │ src/nlu/fastPath.ts                  │ Bug fix (AMOUNT_SUFFIX_RE guard), list+date, summary+date, expense+yesterday    │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 5   │ src/nlu/handlers/showTransactions.ts │ Accept ParsedIntent, use date filter, query by range                            │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 6   │ src/nlu/handlers/querySpending.ts    │ Ensure periodToDateFilter handles all cases (already mostly works)              │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 7   │ src/services/transaction.service.ts  │ Add optional createdAt param to recordTransaction                               │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 8   │ src/nlu/handlers/addExpense.ts       │ Handle transactionDate → compute createdAt override                             │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 9   │ src/nlu/handlers/addIncome.ts        │ Same as addExpense                                                              │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 10  │ src/nlu/handlers/showMenu.ts         │ Comprehensive command list                                                      │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 11  │ src/handlers/help.ts                 │ Add date filter examples, natural language section                              │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 12  │ src/handlers/onboarding.ts           │ Better onboarding with examples and tips                                        │
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
 │ 13  │ src/router/message-router.ts         │ Pass parsed to handleShowTransactions                                           │
 └─────┴──────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

 Verification

 1. Bug fix test: Send "summary 19 april 2026" → should get query_spending summary for April 19, 2026 (not an expense of Rp 2,026)
 2. List dates: Send "list yesterday" → shows yesterday's transactions. "list this week" → last 7 days. "list 19 april" → specific day.
 3. Summary dates: Send "summary yesterday" → summary for yesterday. "summary april 2026" → April 2026 summary.
 4. Backdate expense: Send "coffee 50k yesterday" → expense logged with yesterday's createdAt. Verify with "list yesterday".
 5. Backdate income: Send "income 5jt salary yesterday" → income logged yesterday.
 6. Menu: Send "menu" → comprehensive command list with all features.
 7. Onboarding: Add bot to new group → informative intro with accuracy tips.
 8. Regression: Send "coffee 50k" → still logs normally as today's expense. "summary" alone → still shows this month.
 ├─────┼──────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────┤                                
 │ 13  │ src/router/message-router.ts         │ Pass parsed to handleShowTransactions                                           │
 └─────┴──────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

 Verification               
                                 
 1. Bug fix test: Send "summary 19 april 2026" → should get query_spending summary for April 19, 2026 (not an expense of Rp 2,026)
 2. List dates: Send "list yesterday" → shows yesterday's transactions. "list this week" → last 7 days. "list 19 april" → specific day.
 3. Summary dates: Send "summary yesterday" → summary for yesterday. "summary april 2026" → April 2026 summary.
 4. Backdate expense: Send "coffee 50k yesterday" → expense logged with yesterday's createdAt. Verify with "list yesterday".
 5. Backdate income: Send "income 5jt salary yesterday" → income logged yesterday.
 6. Menu: Send "menu" → comprehensive command list with all features.
 7. Onboarding: Add bot to new group → informative intro with accuracy tips.
 8. Regression: Send "coffee 50k" → still logs normally as today's expense. "summary" alone → still shows this month.