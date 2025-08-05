const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const os = require('os');
const { performance } = require('perf_hooks');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSIONS = {};

const ADMIN_USER = 'admin';
const ADMIN_PASS = '151007';
const PREFIX = '.';
const VERSION = '1.7.8';

app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'cypher-x-secret', resave: false, saveUninitialized: false }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Auth middleware
function isAuth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/login');
}

// Create/loading WhatsApp session
async function createSession(userId, usePairing = false, phone = null) {
  const dir = path.join(__dirname, 'sessions', userId);
  await fs.promises.mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ['CYPHER-X','Panel','1.0'] });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async u => {
    const { connection, lastDisconnect, qr } = u;
    console.log('update', userId, u);
    if (qr) {
      const qrData = await qrcode.toDataURL(qr);
      SESSIONS[userId].qr = qrData;
    }
    if (connection === 'open') {
      SESSIONS[userId].qr = null;
      SESSIONS[userId].pairingCode = null;
    }
    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('Disconnected', userId, reason);
      if (reason !== DisconnectReason.loggedOut) {
        await createSession(userId, usePairing, phone);
      } else {
        delete SESSIONS[userId];
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
    if (text.toLowerCase().startsWith(PREFIX + 'menu')) {
      const start = performance.now();
      await new Promise(r => setTimeout(r, 100));
      const end = performance.now();
      const speed = (end - start).toFixed(4);
      const used = process.memoryUsage().heapUsed / 1024 / 1024;
      const total = os.totalmem() / 1024 / 1024;
      const pct = Math.round((used / total) * 100);
      const bar = `[${'█'.repeat(Math.floor(pct / 10)).padEnd(10,'░')}] ${pct}%`;
      const menu = `
┏▣ ◈ *CYPHER-X* ◈
┃ *ᴏᴡɴᴇʀ* : Not Set!
┃ *ᴘʀᴇғɪx* : [ ${PREFIX} ]
┃ *ʜᴏsᴛ* : Panel
┃ *ᴘʟᴜɢɪɴs* : 309
┃ *ᴍᴏᴅᴇ* : Private
┃ *ᴠᴇʀsɪᴏɴ* : ${VERSION}
┃ *sᴘᴇᴇᴅ* : ${speed} ms
┃ *ᴜsᴀɢᴇ* : ${used.toFixed(0)} MB of ${(total / 1024).toFixed(0)} GB
┃ *ʀᴀᴍ:* ${bar}
┗▣`;
      await sock.sendMessage(m.key.remoteJid, { text: menu }, { quoted: m });
    }
  });

  SESSIONS[userId] = { sock, qr: null, pairingCode: null };
}

// Routes
app.get('/login', (req, res) => {
  res.send(`
    <form method="POST"><input name="username"/><br/><input type="password" name="password"/><br/><button>Login</button></form>
  `);
});
app.post('/login', (req, res) => {
  if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
    req.session.loggedIn = true;
    res.redirect('/dashboard');
  } else res.send('Invalid');
});

app.get('/dashboard', isAuth, (req, res) => {
  res.render('dashboard', { sessions: SESSIONS });
});

app.get('/qr', isAuth, async (req, res) => {
  const userId = req.query.id;
  if (!userId) return res.send('Missing id');
  if (!SESSIONS[userId]) await createSession(userId);
  const s = SESSIONS[userId];
  res.render('qr', { userId, qr: s.qr, pairingCode: s.pairingCode });
});

app.post('/remove', isAuth, async (req, res) => {
  const id = req.body.id;
  if (SESSIONS[id]) {
    await SESSIONS[id].sock.logout().catch(() => {});
    delete SESSIONS[id];
  }
  res.redirect('/dashboard');
});

app.listen(PORT, () => console.log(`🚀 Listening on port ${PORT}`));
