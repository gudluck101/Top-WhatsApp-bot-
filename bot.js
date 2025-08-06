import {
  default as makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  generatePairingCode,
} from '@whiskeysockets/baileys'

import P from 'pino'
import fs from 'fs'

const store = makeInMemoryStore({
  logger: P({ level: 'silent' }).child({ stream: 'store' }),
})

export async function startBot(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: 'silent' }),
    syncFullHistory: false,
    browser: ['PairBot', 'Chrome', '1.0.0'],
  })

  store.bind(sock.ev)

  if (!sock.authState.creds.registered) {
    const code = await generatePairingCode(sock, phoneNumber)
    if (!code) throw new Error('Failed to get pairing code')
    console.log('Pairing code:', code)
    return code
  } else {
    console.log('Already connected.')
    return 'Already connected.'
  }

  sock.ev.on('creds.update', saveCreds)
}
