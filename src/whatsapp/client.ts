import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys'
import type { WASocket, GroupMetadata } from '@whiskeysockets/baileys'
import pino from 'pino'
import { Boom } from '@hapi/boom'
import { rm } from 'fs/promises'

const logger = pino({ level: 'silent' })

export const groupMetadataCache = new Map<string, GroupMetadata>()

let connectionState: 'connected' | 'disconnected' = 'disconnected'
let reconnectAttempt = 0
const MAX_RECONNECT_DELAY = 60000 // 60 seconds

export function getConnectionState() {
  return connectionState
}

export function setConnectionState(state: 'connected' | 'disconnected') {
  connectionState = state
}

async function exponentialBackoffReconnect() {
  const delay = Math.min(Math.pow(2, reconnectAttempt) * 1000, MAX_RECONNECT_DELAY)
  console.log(`[WhatsApp] Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})...`)
  await Bun.sleep(delay)
  reconnectAttempt++
}

let qrCode: string | null = null
let currentSocket: WASocket | null = null
let onSocketReconnect: ((sock: WASocket) => void) | null = null

export function getQRCode(): string | null {
  return qrCode
}

export function getCurrentSocket(): WASocket | null {
  return currentSocket
}

export async function initializeWASocket(reconnectCallback?: (sock: WASocket) => void): Promise<WASocket> {
  if (reconnectCallback) onSocketReconnect = reconnectCallback

  const { state, saveCreds } = await useMultiFileAuthState('.baileys_auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu('FinanceBot'),
    cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
  })

  currentSocket = sock
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCode = qr
      console.log('[WhatsApp] QR code generated, visit /qr to scan')
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut

      if (shouldReconnect) {
        setConnectionState('disconnected')
        qrCode = null
        await exponentialBackoffReconnect()
        const newSock = await initializeWASocket()
        onSocketReconnect?.(newSock)
      } else {
        console.log('[WhatsApp] Logged out — clearing auth state and reinitializing...')
        setConnectionState('disconnected')
        qrCode = null
        try {
          await rm('.baileys_auth', { recursive: true, force: true })
        } catch {}
        reconnectAttempt = 0
        const newSock = await initializeWASocket()
        onSocketReconnect?.(newSock)
      }
    } else if (connection === 'open') {
      console.log('[WhatsApp] Connected successfully')
      setConnectionState('connected')
      reconnectAttempt = 0
      qrCode = null
    }
  })

  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      if (update.id) {
        const metadata = await sock.groupMetadata(update.id)
        groupMetadataCache.set(update.id, metadata)
      }
    }
  })

  sock.ev.on('group-participants.update', async (event) => {
    const metadata = await sock.groupMetadata(event.id)
    groupMetadataCache.set(event.id, metadata)
  })

  return sock
}
