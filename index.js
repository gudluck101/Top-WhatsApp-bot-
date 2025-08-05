import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  DisconnectReason,
  useSingleFileLegacyAuthState,
  makeCacheableSignalKeyStore,
  makeWALegacySocket,
  downloadContentFromMessage,
  generateWAMessageFromContent,
  generatePairingCode
} from '@whiskeysockets/baileys'

import P from 'pino'
import fs from 'fs'
import { join } from 'path'
import { Boom } from '@hapi/boom'

const logger = P({ level: 'silent' })
const store = makeInMemoryStore({ logger })
const PASSWORD = 'cypherpass' // 🔐 Change to your bot password

const AUTHED_NUMBERS = {} // Tracks who authenticated

// 🧠 Start a session by ID (multi-user)
async function startSession(sessionId = 'default', usePairing = false, phoneNumber = null) {
  const sessionFolder = join('auth', sessionId)
  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder)

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: !usePairing,
    browser: ['CypherX-Bot', 'Chrome', '10.0'],
  })

  store.bind(sock.ev)
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = reason !== DisconnectReason.loggedOut
      console.log(`❌ [${sessionId}] Disconnected (${reason}), reconnecting: ${shouldReconnect}`)
      if (shouldReconnect) startSession(sessionId)
    } else if (connection === 'open') {
      console.log(`✅ [${sessionId}] connected`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    const msg = messages[0]
    const sender = msg.key.remoteJid
    const body = msg.message?.conversation?.trim().toLowerCase() || ''
    const isGroup = sender.endsWith('@g.us')

    if (!isGroup) {
      // 🔐 Handle .auth password
      if (body.startsWith('.auth ')) {
        const pass = body.split(' ')[1]
        if (pass === PASSWORD) {
          AUTHED_NUMBERS[sender] = true
          await sock.sendMessage(sender, { text: '✅ Authenticated successfully.' })
        } else {
          await sock.sendMessage(sender, { text: '❌ Invalid password.' })
        }
        return
      }

      // 🧩 Generate pairing code after auth
      if (body.startsWith('.pair ')) {
        if (!AUTHED_NUMBERS[sender]) {
          await sock.sendMessage(sender, { text: '🔒 Please authenticate first using `.auth password`' })
          return
        }

        const phone = body.split(' ')[1]
        if (!phone || !phone.startsWith('+')) {
          await sock.sendMessage(sender, { text: '⚠️ Invalid number. Use format: `.pair +234xxxxxxxxxx`' })
          return
        }

        const sessionId = phone.replace(/\D/g, '')
        const { state } = await useMultiFileAuthState(`auth/${sessionId}`)
        const pairSock = makeWASocket({
          auth: state,
          browser: ['CypherX-Bot', 'Chrome', '10.0'],
        })

        pairSock.ev.on('connection.update', async (update) => {
          const { pairingCode, connection } = update
          if (pairingCode) {
            await sock.sendMessage(sender, { text: `🔗 Pairing Code for ${phone}:\n\n${pairingCode}` })
          } else if (connection === 'open') {
            await sock.sendMessage(sender, { text: `✅ ${phone} paired successfully.` })
          }
        })

        pairSock.ev.on('creds.update', () => {
          state.saveCreds()
        })
        return
      }

      // 🧾 Show menu
      if (body === '.menu') {
        const used = process.memoryUsage().rss / 1024 / 1024
        const speed = (Math.random() * 1000).toFixed(2)
        const bar = `[${'█'.repeat(7)}${'░'.repeat(3)}] 72%`
        const menu = `
┏▣ ◈ *CYPHER-X* ◈
┃ *ᴏᴡɴᴇʀ* : Multi-user
┃ *ᴘʀᴇғɪx* : [ . ]
┃ *sᴇssɪᴏɴ* : ${sessionId}
┃ *ᴠᴇʀsɪᴏɴ* : 1.7.8
┃ *sᴘᴇᴇᴅ* : ${speed} ms
┃ *ᴜsᴀɢᴇ* : ${used.toFixed(2)} MB of 31 GB
┃ *ʀᴀᴍ:* ${bar}
┗▣`.trim()

        await sock.sendMessage(sender, { text: menu })
      }
    }
  })
}

startSession('cypher-main')
