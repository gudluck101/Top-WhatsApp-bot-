const express = require('express')
const path = require('path')
const fs = require('fs')
const P = require('pino')
const { fileURLToPath } = require('url')
const { join } = require('path')

// Import Baileys using default require
const baileys = require('@whiskeysockets/baileys')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} = baileys

const generatePairingCode = baileys.generatePairingCode

// Setup Express
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.post('/get-code', async (req, res) => {
  const { number } = req.body
  if (!number) return res.status(400).json({ error: 'Phone number required' })

  try {
    const code = await startBot(number)
    res.json({ code })
  } catch (err) {
    console.error('Error:', err)
    res.status(500).json({ error: 'Failed to generate pairing code' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

// Bot logic
async function startBot(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ['CypherX', 'Chrome', '1.0.0'],
    printQRInTerminal: false,
  })

  const store = makeInMemoryStore({ logger: P({ level: 'silent' }) })
  store.bind(sock.ev)

  if (!sock.authState.creds.registered) {
    const code = await generatePairingCode(sock, phoneNumber)
    if (!code) throw new Error('Could not generate code')
    console.log('Pairing code:', code)
    return code
  } else {
    console.log('Already linked.')
    return '✅ Already connected'
  }

  sock.ev.on('creds.update', saveCreds)
    }
