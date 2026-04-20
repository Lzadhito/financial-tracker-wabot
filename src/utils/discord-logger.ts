import { formatISO } from 'date-fns'
import { env } from '../env'

const MAX_LENGTH = 1900 // Discord embed description limit

function truncate(text: string): string {
  if (text.length <= MAX_LENGTH) return text
  return text.slice(0, MAX_LENGTH) + '\n...(truncated)'
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) =>
      arg instanceof Error
        ? `${arg.message}\n${arg.stack ?? ''}`
        : typeof arg === 'object'
          ? JSON.stringify(arg, null, 2)
          : String(arg)
    )
    .join(' ')
}

async function sendToDiscord(level: 'ERROR' | 'WARN' | 'FATAL', message: string): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL) return

  const color = level === 'FATAL' ? 0xff0000 : level === 'ERROR' ? 0xff4500 : 0xffa500
  const now = formatISO(new Date())

  const payload = {
    embeds: [
      {
        title: `[${level}] financial-tracker-bot`,
        description: `\`\`\`\n${truncate(message)}\n\`\`\``,
        color,
        footer: { text: now },
      },
    ],
  }

  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Silently ignore — don't cause infinite loop
  }
}

/**
 * Patches console.error to also forward messages to Discord,
 * and registers global handlers for uncaught exceptions and
 * unhandled promise rejections.
 *
 * Call once at application startup.
 */
export function setupDiscordLogger(): void {
  if (!env.DISCORD_WEBHOOK_URL) {
    console.log('[Logger] DISCORD_WEBHOOK_URL not set — Discord logging disabled')
    return
  }

  // Patch console.error
  const _originalError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    _originalError(...args)
    void sendToDiscord('ERROR', formatArgs(args))
  }

  // Patch console.warn
  const _originalWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    _originalWarn(...args)
    void sendToDiscord('WARN', formatArgs(args))
  }

  // Uncaught synchronous exceptions
  process.on('uncaughtException', (error: Error) => {
    void sendToDiscord('FATAL', `uncaughtException\n${error.message}\n${error.stack ?? ''}`)
  })

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    const message =
      reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ''}`
        : JSON.stringify(reason)
    void sendToDiscord('FATAL', `unhandledRejection\n${message}`)
  })

  console.log('[Logger] Discord logging enabled')
}
