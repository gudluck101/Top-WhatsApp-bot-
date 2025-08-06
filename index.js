import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'

import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const PORT = process.env.PORT || 10000

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')))

let sockGlobal = null

async function startBot(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)
  sockGlobal = sock

  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(phoneNumber)
      console.log('✅ Pairing Code for', phoneNumber, ':', code)
    } catch (err) {
      console.error('❌ Error generating pairing code:', err)
    }
  }
}

app.get('/pair', async (req, res) => {
  const { phone } = req.query
  if (!phone) return res.status(400).send('Phone number missing')

  try {
    await startBot(phone)
    res.send('✅ Pairing code has been logged in the console. Check Render logs.')
  } catch (err) {
    console.error(err)
    res.status(500).send('❌ Failed to generate pairing code.')
  }
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
