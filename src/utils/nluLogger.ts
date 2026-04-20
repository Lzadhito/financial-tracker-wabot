import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

const LOGS_DIR = path.join(process.cwd(), 'logs')
const LOG_FILE = path.join(LOGS_DIR, 'nlu-events.jsonl')

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true })
}

function hashJID(jid: string): string {
  const hash = createHash('sha256').update(jid).digest('hex')
  return hash.substring(0, 12)
}

export interface NluLogEntry {
  event: 'haiku_call' | 'clarification' | 'button_press' | 'user_edit'
  intent?: string
  confidence?: number
  source?: string
  latency_ms?: number
  token_usage?: number
  hashed_group: string
  hashed_sender: string
  at: number
}

export function logNluEvent(entry: NluLogEntry, nluEnabled: boolean): void {
  if (!nluEnabled) return

  try {
    const line = JSON.stringify(entry)
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch (error) {
    console.error('[NLU Logger] Error writing to log file:', error)
  }
}

export function prepareNluLogEntry(
  event: NluLogEntry['event'],
  groupJID: string,
  senderJID: string,
  extras?: Partial<NluLogEntry>
): NluLogEntry {
  return {
    event,
    hashed_group: hashJID(groupJID),
    hashed_sender: hashJID(senderJID),
    at: Date.now(),
    ...extras,
  }
}
