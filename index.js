import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  generatePairingCode,
} from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Pairing code endpoint
app.post('/get-code', async (req, res) => {
  const { number } = req.body
  if (!number) return res.status(400).json({ error: 'Phone number is required' })

  try {
    const code = await startBot(number)
    res.json({ code })
  } catch (err) {
    console.error('Error generating code:', err)
    res.status(500).json({ error: 'Failed to generate pairing code' })
  }
})

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

// Start bot logic
async function startBot(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()
  const store = makeInMemoryStore({
    logger: P({ level: 'silent' }).child({ stream: 'store' }),
  })

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ['CypherX-Bot', 'Chrome', '1.0.0'],
    printQRInTerminal: false,
  })

  store.bind(sock.ev)

  if (!sock.authState.creds.registered) {
    const code = await generatePairingCode(sock, phoneNumber)
    if (!code) throw new Error('Could not get pairing code')
    console.log('Generated pairing code:', code)
    return code
  } else {
    console.log('Already paired')
    return '✅ Already connected'
  }

  sock.ev.on('creds.update', saveCreds)
}
