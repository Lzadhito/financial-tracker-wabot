import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  TZ: z.string().default('Asia/Jakarta'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data
