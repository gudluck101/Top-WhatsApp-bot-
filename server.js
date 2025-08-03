import express from 'express';
import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import P from 'pino';
import os from 'os';
import qrcode from 'qrcode';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static('public'));

let qrCodeData = '';
let sock;

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ qr }) => {
    if (qr) {
      qrCodeData = await qrcode.toDataURL(qr);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    if (text.startsWith('.menu')) {
      const start = performance.now();
      await new Promise(res => setTimeout(res, 200));
      const end = performance.now();

      const speed = (end - start).toFixed(4);
      const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const totalMemory = os.totalmem() / 1024 / 1024;
      const ramPercentage = ((usedMemory / totalMemory) * 100).toFixed(0);

      const bar = `[${'█'.repeat(ramPercentage / 10)}${'░'.repeat(10 - ramPercentage / 10)}]`;

      const menu = `┏▣ ◈ CYPHER-X ◈
┃ ᴏᴡɴᴇʀ : Not Set!
┃ ᴘʀᴇғɪx : [ . ]
┃ ʜᴏsᴛ : Render
┃ ᴘʟᴜɢɪɴs : 309
┃ ᴍᴏᴅᴇ : Private
┃ ᴠᴇʀsɪᴏɴ : 1.7.8
┃ sᴘᴇᴇᴅ : ${speed} ms
┃ ᴜsᴀɢᴇ : ${usedMemory.toFixed(2)} MB of ${totalMemory.toFixed(0)} MB
┃ ʀᴀᴍ: ${bar} ${ramPercentage}%
┗▣`;

      await sock.sendMessage(msg.key.remoteJid, { text: menu }, { quoted: msg });
    }
  });
};

startBot();

// Route to show QR
app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.send(`<img src="${qrCodeData}" style="width:300px;">`);
  } else {
    res.send('QR not generated yet or already scanned.');
  }
});

app.listen(PORT, () => console.log(`Bot ready on http://localhost:${PORT}`));
