import { Hono } from 'hono'
import { env } from './env'
import { initializeWASocket, setConnectionState } from './whatsapp/client'
import { setupMessageListener } from './whatsapp/listener'
import { startWeeklyRecapJob } from './jobs/weekly-recap'
import adminRoutes from './routes/admin'

const app = new Hono()

// Mount admin routes
app.route('/', adminRoutes)

// Start server and initialize bot
async function startServer() {
  const port = 3000

  const server = Bun.serve({
    port,
    fetch: app.fetch,
  })

  console.log(`[Server] FinanceBot running on http://localhost:${port}`)
  console.log(`[Server] Check /qr for WhatsApp QR code`)

  // Initialize WhatsApp socket
  try {
    const sock = await initializeWASocket((newSock) => {
      setupMessageListener(newSock)
    })

    // Set up message listener on initial socket
    setupMessageListener(sock)

    // Start weekly recap job once (uses getCurrentSocket() internally)
    startWeeklyRecapJob()

    console.log('[WhatsApp] Socket initialized and listeners set up')
  } catch (error) {
    console.error('[WhatsApp] Failed to initialize:', error)
    process.exit(1)
  }
}

startServer().catch((error) => {
  console.error('[Server] Startup failed:', error)
  process.exit(1)
})
