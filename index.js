const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  generatePairingCode,
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const Boom = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Simple health check
app.get('/', (req, res) => res.send('🤖 CypherX Bot is running!'));
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));

// ✅ Session storage file for auth
const SESSION_FILE = 'session.json';
if (!fs.existsSync(SESSION_FILE)) fs.writeFileSync(SESSION_FILE, '{}');
const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE));

// ✅ Start bot
async function startBot(sessionId = 'cypher-main') {
  const { state, saveCreds } = await useMultiFileAuthState(`auth/${sessionId}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true, // Main account QR shown in terminal
    auth: state,
    browser: ['CypherX', 'Chrome', '1.0.0'],
  });

  // ✅ Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    // 🔘 Menu command
    if (text.startsWith('.menu')) {
      return sock.sendMessage(sender, {
        text: `🤖 *CypherX Bot Menu*\n\n🔐 .auth [password]\n🔗 .pair [phone]\n📜 .menu`,
      });
    }

    // 🔐 Auth command
    if (text.startsWith('.auth')) {
      const inputPass = text.split(' ')[1];
      if (!inputPass)
        return sock.sendMessage(sender, {
          text: '❌ Usage: `.auth cypherpass`',
        });

      if (inputPass === 'cypherpass') {
        sessionData[sender] = true;
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
        return sock.sendMessage(sender, {
          text: '✅ Auth successful. Now send `.pair +234xxxxxxx`',
        });
      } else {
        return sock.sendMessage(sender, { text: '❌ Wrong password.' });
      }
    }

    // 🔗 Pair command
    if (text.startsWith('.pair')) {
      if (!sessionData[sender]) {
        return sock.sendMessage(sender, {
          text: '❌ Not authorized. Use `.auth cypherpass` first.',
        });
      }

      const phone = text.split(' ')[1];
      if (!phone)
        return sock.sendMessage(sender, {
          text: '❌ Provide phone: `.pair +234xxxxxxxx`',
        });

      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const sessionFolder = `auth/${cleanPhone}`;
      if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });

      try {
        const { state: pairState, saveCreds: savePairCreds } = await useMultiFileAuthState(sessionFolder);
        const pairSock = makeWASocket({
          auth: pairState,
          logger: P({ level: 'silent' }),
          browser: ['CypherX-Bot', 'Firefox', '2.0.0'],
        });

        const code = await generatePairingCode(pairSock, phone);
        await sock.sendMessage(sender, {
          text: `🔗 *Pairing Code for ${phone}:*\n\n*${code}*\n\nOpen WhatsApp → Linked Devices → Enter Code`,
        });

        pairSock.ev.on('creds.update', savePairCreds);
      } catch (err) {
        await sock.sendMessage(sender, {
          text: `❌ Error generating code: ${err.message}`,
        });
      }
    }
  });

  // 🔁 Auto reconnect
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('🔁 Reconnecting...');
        startBot();
      } else {
        console.log('📴 Bot logged out.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot connected.');
    }
  });

  // ✅ Save credentials on change
  sock.ev.on('creds.update', saveCreds);
}

// 🚀 Launch
startBot();
