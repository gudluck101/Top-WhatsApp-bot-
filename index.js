const express = require('express')
const path = require('path')
const fs = require('fs')
const P = require('pino')
const baileys = require('@whiskeysockets/baileys')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = baileys

const generatePairingCode = baileys.generatePairingCode

const app = express()
const PORT = process.env.PORT || 10000

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.post('/get-code', async (req, res) => {
  const { number } = req.body
  if (!number) return res.status(400).json({ error: 'Phone number is required' })

  try {
    const code = await startBot(number)
    res.json({ code })
  } catch (err) {
    console.error('Error generating pairing code:', err)
    res.status(500).json({ error: 'Failed to generate pairing code' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

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

  if (!sock.authState.creds.registered) {
    const code = await generatePairingCode(sock, phoneNumber)
    if (!code) throw new Error('Failed to generate code')
    console.log('Generated Code:', code)
    return code
  } else {
    console.log('Already linked.')
    return '✅ Already connected'
  }

  sock.ev.on('creds.update', saveCreds)
}
