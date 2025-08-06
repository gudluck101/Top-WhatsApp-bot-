const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeInMemoryStore,
  generatePairingCode,
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

const SESSION_FILE = 'session.json';
if (!fs.existsSync(SESSION_FILE)) fs.writeFileSync(SESSION_FILE, '{}');
const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE));

const store = makeInMemoryStore({ logger: P().child({ level: 'silent', stream: 'store' }) });

async function startBot(sessionId = 'cypher-main') {
  const { state, saveCreds } = await useMultiFileAuthState(`auth/${sessionId}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['CypherX', 'Safari', '1.0.0'],
  });

  store.bind(sock.ev);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (text.startsWith('.menu')) {
      await sock.sendMessage(sender, {
        text: `🤖 *CypherX Bot*\n\n✅ .auth [password]\n✅ .pair [phone]\n✅ .menu`,
      });
    }

    if (text.startsWith('.auth')) {
      const inputPass = text.split(' ')[1];
      if (!inputPass) return sock.sendMessage(sender, { text: '❌ Enter password: `.auth cypherpass`' });

      if (inputPass === 'cypherpass') {
        sessionData[sender] = true;
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
        await sock.sendMessage(sender, { text: '✅ Auth successful. Use `.pair +234xxxxxxx`' });
      } else {
        await sock.sendMessage(sender, { text: '❌ Wrong password.' });
      }
    }

    if (text.startsWith('.pair')) {
      if (!sessionData[sender]) {
        return sock.sendMessage(sender, { text: '❌ Not authorized. Use `.auth cypherpass` first.' });
      }

      const phone = text.split(' ')[1];
      if (!phone) return sock.sendMessage(sender, { text: '❌ Provide phone: `.pair +234xxxxxxxx`' });

      const sessionFolder = `auth/${phone.replace(/[^0-9]/g, '')}`;
      if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });

      const { state: pairState, saveCreds: savePairCreds } = await useMultiFileAuthState(sessionFolder);
      const pairSock = makeWASocket({
        auth: pairState,
        browser: ['CypherX-Bot', 'Chrome', '10.0'],
      });

      try {
        const code = await generatePairingCode(pairSock, phone);
        await sock.sendMessage(sender, {
          text: `🔗 Pairing Code for ${phone}:\n\n*${code}*\n\nGo to WhatsApp → Linked Devices to enter it.`,
        });
      } catch (err) {
        await sock.sendMessage(sender, { text: `❌ Error: ${err.message}` });
      }

      pairSock.ev.on('creds.update', savePairCreds);
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log('Reconnecting...');
        startBot();
      }
    } else if (connection === 'open') {
      console.log('Bot connected ✅');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

startBot();
