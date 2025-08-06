import express from 'express'
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeInMemoryStore,
  generatePairingCode
} from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import qrcode from 'qrcode'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000

app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

app.post('/pair', async (req, res) => {
  const { number } = req.body
  if (!number) return res.status(400).send('Phone number is required')

  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  })

  try {
    const code = await generatePairingCode(sock, number)
    const qrImage = await qrcode.toDataURL(code)
    res.send(`<img src="${qrImage}" /><br><p>Scan this code with your WhatsApp</p>`)
  } catch (err) {
    console.error(err)
    res.status(500).send('Failed to generate pairing code')
  }

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
    } else if (connection === 'open') {
      console.log('✅ Connected successfully')
    }
  })
})

app.listen(PORT, () => {
  console.log(`✅ CypherX WhatsApp Bot Running at http://localhost:${PORT}`)
})
