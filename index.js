const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const os = require('os');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSIONS = {}; // Store sockets & QR codes per user

// Ensure sessions folder exists
if (!fs.existsSync('./sessions')) fs.mkdirSync('./sessions');

// Utility to load or create session
async function createSession(userId) {
  const sessionPath = path.join(__dirname, 'sessions', userId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['CYPHER-X', 'RenderHost', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      qrcode.toDataURL(qr, (err, qrData) => {
        SESSIONS[userId].qr = qrData;
      });
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`User ${userId} disconnected: ${reason}`);
      if (reason !== DisconnectReason.loggedOut) {
        createSession(userId); // reconnect if not logged out
      } else {
        delete SESSIONS[userId]; // clean up on logout
      }
    }

    if (connection === 'open') {
      console.log(`✅ User ${userId} connected`);
      SESSIONS[userId].qr = null; // Clear QR when connected
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.fromMe) return;

    const type = Object.keys(msg.message)[0];
    const text =
      msg.message.conversation ||
      (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) ||
      '';

    if (text && text.toLowerCase().startsWith('.menu')) {
      const start = performance.now();
      await new Promise((r) => setTimeout(r, 100));
      const end = performance.now();
      const speed = (end - start).toFixed(3);

      const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const totalMemory = os.totalmem() / 1024 / 1024;
      const ramPercentage = ((usedMemory / totalMemory) * 100).toFixed(0);

      const menu = `
┏▣ ◈ *CYPHER-X* ◈
┃ *ᴜsᴇʀ* : ${userId}
┃ *ᴘʀᴇғɪx* : [ . ]
┃ *ʜᴏsᴛ* : RenderHost
┃ *ᴘʟᴜɢɪɴs* : 309
┃ *ᴍᴏᴅᴇ* : Private
┃ *ᴠᴇʀsɪᴏɴ* : 1.7.8
┃ *sᴘᴇᴇᴅ* : ${speed} ms
┃ *ᴜsᴀɢᴇ* : ${usedMemory.toFixed(2)} MB of ${totalMemory.toFixed(0)} MB
┃ *ʀᴀᴍ*: [${'█'.repeat(ramPercentage / 10)}${'░'.repeat(10 - ramPercentage / 10)}] ${ramPercentage}%
┗▣`;

      await sock.sendMessage(msg.key.remoteJid, { text: menu }, { quoted: msg });
    }
  });

  SESSIONS[userId] = { sock, qr: null };
}

// Route: Home → Enter userId
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="text-align:center;font-family:sans-serif">
        <h2>CYPHER-X Multi-User Login</h2>
        <form method="GET" action="/qr">
          <input name="id" placeholder="Enter your unique ID" required />
          <button type="submit">Get QR</button>
        </form>
      </body>
    </html>
  `);
});

// Route: Show QR for specific userId
app.get('/qr', async (req, res) => {
  const userId = req.query.id;
  if (!userId) return res.status(400).send('Missing ?id');

  // Start new session if doesn't exist
  if (!SESSIONS[userId]) await createSession(userId);

  const qr = SESSIONS[userId].qr;

  if (!qr) {
    return res.send(`
      <html><body style="text-align:center;font-family:sans-serif">
        <h2>No QR Code – already logged in?</h2>
        <p>Try sending .menu in WhatsApp to test</p>
      </body></html>
    `);
  }

  res.send(`
    <html>
      <head><title>Login WhatsApp - ${userId}</title></head>
      <body style="text-align:center;font-family:sans-serif">
        <h2>Scan QR Code for ${userId}</h2>
        <img src="${qr}" width="300" height="300" />
        <p>Go to WhatsApp → Linked Devices → Scan</p>
        <p><a href="/qr?id=${userId}">Refresh QR</a></p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
