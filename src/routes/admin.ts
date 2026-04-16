import { Hono } from 'hono'
import type { Context } from 'hono'
import { env } from '../env'
import { getConnectionState, getQRCode } from '../whatsapp/client'
import { checkClaudeStatus } from '../ai/claude'

const app = new Hono()

// Middleware for API key validation (except /health and /qr)
const apiKeyMiddleware = async (c: Context, next: () => Promise<void>) => {
  const path = c.req.path

  if (path === '/health' || path === '/qr') {
    await next()
    return
  }

  const apiKey = c.req.header('x-api-key')
  if (apiKey !== env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
}

app.use('*', apiKeyMiddleware)

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    whatsapp: getConnectionState(),
    uptime: process.uptime(),
  })
})

// QR code display page
app.get('/qr', (c) => {
  const connected = getConnectionState() === 'connected'

  if (connected) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>FinanceBot - Connected</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f0f0; }
          .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #2ecc71; }
          p { color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Connected</h1>
          <p>FinanceBot is connected and ready to use!</p>
        </div>
      </body>
      </html>
    `)
  }

  const qrCode = getQRCode()

  if (!qrCode) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>FinanceBot - Waiting for QR</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f0f0; }
          .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #e74c3c; }
          p { color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⏳ Waiting for QR Code</h1>
          <p>Refresh this page in a moment...</p>
          <script>setTimeout(() => location.reload(), 2000);</script>
        </div>
      </body>
      </html>
    `)
  }

  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>FinanceBot - QR Code</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f0f0; }
        .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #3498db; }
        img { border: 2px solid #3498db; border-radius: 8px; }
        p { color: #666; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 Scan QR Code</h1>
        <img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrCode)}&size=256x256" alt="WhatsApp QR Code">
        <p>Scan this QR code with your phone to connect</p>
        <p style="font-size: 12px; color: #999;">Page auto-refreshes every 5 seconds</p>
        <script>setTimeout(() => location.reload(), 5000);</script>
      </div>
    </body>
    </html>
  `)
})

// AI status check
app.get('/ai/status', async (c) => {
  const status = await checkClaudeStatus()
  return c.json(status)
})

export default app
