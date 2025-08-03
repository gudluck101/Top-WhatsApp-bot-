const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const os = require('os');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');
const { performance } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;

let qrCodeBase64 = '';
let sock;

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['CYPHER-X', 'RenderHost', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection } = update;

    if (qr) {
      qrCodeBase64 = await qrcode.toDataURL(qr);
    }

    if (connection === 'close') {
      console.log('Disconnected. Reconnecting...');
      startBot();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.fromMe) return; // ✅ Only accept commands from linked device (you)

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
┃ *ᴏᴡɴᴇʀ* : Not Set!
┃ *ᴘʀᴇғɪx* : [ . ]
┃ *ʜᴏsᴛ* : Render
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
};

startBot();

// Serve frontend QR code
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/qr');
});

app.get('/qr', (req, res) => {
  if (!qrCodeBase64) return res.send('QR not ready. Wait and refresh.');
  res.send(`
    <html>
      <head><title>CYPHER-X - QR Login</title></head>
      <body style="text-align:center;font-family:sans-serif">
        <h2>Scan QR Code to Login WhatsApp</h2>
        <img src="${qrCodeBase64}" width="300" height="300" />
        <p>Go to WhatsApp → Linked Devices → Scan</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
