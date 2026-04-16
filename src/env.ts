import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  OLLAMA_API_KEY: z.string().min(1, 'OLLAMA_API_KEY is required'),
  OLLAMA_MODEL: z.string().default('qwen3.5'),
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
