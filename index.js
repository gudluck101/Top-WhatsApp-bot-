import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  DisconnectReason
} from '@whiskeysockets/baileys'
import P from 'pino'
import fs from 'fs'
import { join } from 'path'
import { Boom } from '@hapi/boom'

const logger = P({ level: 'silent' })
const store = makeInMemoryStore({ logger })

// 📦 Start session for a user by ID (e.g., phone number, UUID, etc.)
async function startSession(sessionId = 'default') {
  const sessionFolder = join('auth', sessionId)

  if (!fs.existsSync(sessionFolder)) {
    fs.mkdirSync(sessionFolder, { recursive: true })
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder)

  const sock = makeWASocket({
    logger,
    printQRInTerminal: true,
    auth: state,
    browser: ['CypherX-Bot', 'Chrome', '10.0']
  })

  store.bind(sock.ev)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = reason !== DisconnectReason.loggedOut
      console.log(`❌ Disconnected (${reason}), reconnecting: ${shouldReconnect}`)

      if (shouldReconnect) startSession(sessionId)
    } else if (connection === 'open') {
      console.log(`✅ Session [${sessionId}] connected`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type === 'notify') {
      const msg = messages[0]
      const sender = msg.key.remoteJid

      const body = msg.message?.conversation?.toLowerCase() || ''

      if (body === '.menu') {
        const used = process.memoryUsage()
        const memory = `${(used.rss / 1024 / 1024).toFixed(2)} MB`
        const speed = (Math.random() * 1000).toFixed(2)

        const menu = `
┏▣ ◈ *CYPHER-X* ◈  
┃ *ᴏᴡɴᴇʀ* : Multi-user
┃ *ᴘʀᴇғɪx* : [ . ]
┃ *sᴇssɪᴏɴ* : ${sessionId}
┃ *ᴠᴇʀsɪᴏɴ* : 1.7.8
┃ *sᴘᴇᴇᴅ* : ${speed} ms
┃ *ᴍᴇᴍᴏʀʏ* : ${memory}
┗▣`.trim()

        await sock.sendMessage(sender, { text: menu })
      }
    }
  })
}

// 👇 Start default session
startSession('default')

// 👇 Example: Start multiple users manually
// startSession('user1')
// startSession('user2')

// Later you can automate sessionId from a database or webhook
