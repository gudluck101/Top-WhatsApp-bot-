import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import express from 'express'

const app = express()
const PORT = process.env.PORT || 10000

let sockGlobal = null

async function startBot(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  const { version, isLatest } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)
  sockGlobal = sock

  // Generate pairing code
  if (!sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(phoneNumber)
      console.log('Pairing Code:', code)
    } catch (err) {
      console.error('Error generating pairing code:', err)
    }
  }
}

app.get('/', (req, res) => {
  res.send('🤖 CypherX WhatsApp Bot Running')
})

app.get('/pair', async (req, res) => {
  const { phone } = req.query
  if (!phone) return res.status(400).send('Phone number missing')

  try {
    await startBot(phone)
    res.send('✅ Pairing code sent to console/logs')
  } catch (err) {
    res.status(500).send('❌ Failed to generate pairing code')
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
