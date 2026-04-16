import { pgTable, varchar, timestamp, uuid, integer, text, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// Users table
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phoneNumber: varchar('phone_number').unique().notNull(),
    displayName: varchar('display_name'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    phoneNumberIdx: index('users_phone_number_idx').on(table.phoneNumber),
  })
)

// Ledgers table (personal or group budget)
export const ledgers = pgTable('ledgers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name'),
  monthlyIncome: integer('monthly_income'), // in Rupiah
  monthlyBudget: integer('monthly_budget'), // in Rupiah
  currency: varchar('currency').notNull().default('IDR'),
  timezone: varchar('timezone').notNull().default('Asia/Jakarta'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// Ledger members table (relationship between users and ledgers)
export const ledgerMembers = pgTable(
  'ledger_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull().references(() => ledgers.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: varchar('role').notNull().default('member'), // 'owner' or 'member'
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
    leftAt: timestamp('left_at'),
  },
  (table) => ({
    ledgerUserUnique: uniqueIndex('ledger_members_ledger_user_unique').on(
      table.ledgerId,
      table.userId
    ),
  })
)

// Category enum
export const transactionCategories = [
  'food',
  'transport',
  'bills',
  'shopping',
  'entertainment',
  'health',
  'education',
  'income',
  'other',
] as const

// Transactions table
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull().references(() => ledgers.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    amount: integer('amount').notNull(), // in Rupiah
    category: varchar('category').notNull(), // enum from transactionCategories
    description: varchar('description'),
    transactionType: varchar('transaction_type').notNull(), // 'expense' or 'income'
    messageId: varchar('message_id').unique().notNull(), // Baileys msg.key.id for dedup
    rawMessage: text('raw_message').notNull(),
    aiParsedData: jsonb('ai_parsed_data'), // full Ollama response for debugging
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    ledgerCreatedIdx: index('transactions_ledger_created_idx').on(
      table.ledgerId,
      table.createdAt
    ),
    messageIdIdx: index('transactions_message_id_idx').on(table.messageId),
  })
)

// Group chats table (maps WhatsApp group JID to ledger)
export const groupChats = pgTable(
  'group_chats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    whatsappGroupId: varchar('whatsapp_group_id').unique().notNull(), // group JID (e.g., 120363XXXXXXXX@g.us)
    ledgerId: uuid('ledger_id').notNull().references(() => ledgers.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    whatsappGroupIdIdx: index('group_chats_whatsapp_group_id_idx').on(
      table.whatsappGroupId
    ),
  })
)

// Ledger settings table
export const ledgerSettings = pgTable(
  'ledger_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull().references(() => ledgers.id),
    key: varchar('key').notNull(),
    value: text('value').notNull(),
  },
  (table) => ({
    ledgerKeyUnique: uniqueIndex('ledger_settings_ledger_key_unique').on(
      table.ledgerId,
      table.key
    ),
  })
)

// Relations
export const ledgersRelations = relations(ledgers, ({ many }) => ({
  members: many(ledgerMembers),
  transactions: many(transactions),
  groupChats: many(groupChats),
  settings: many(ledgerSettings),
}))

export const usersRelations = relations(users, ({ many }) => ({
  ledgerMembers: many(ledgerMembers),
  transactions: many(transactions),
}))

export const ledgerMembersRelations = relations(ledgerMembers, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [ledgerMembers.ledgerId],
    references: [ledgers.id],
  }),
  user: one(users, {
    fields: [ledgerMembers.userId],
    references: [users.id],
  }),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [transactions.ledgerId],
    references: [ledgers.id],
  }),
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}))

export const groupChatsRelations = relations(groupChats, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [groupChats.ledgerId],
    references: [ledgers.id],
  }),
}))

export const ledgerSettingsRelations = relations(ledgerSettings, ({ one }) => ({
  ledger: one(ledgers, {
    fields: [ledgerSettings.ledgerId],
    references: [ledgers.id],
  }),
}))
