const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const os = require('os');
const express = require('express');
const session = require('express-session');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSIONS = {}; // Active user sessions
const SESSION_DIR = path.join(__dirname, 'sessions');

// Create sessions directory if not exists
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);

// Hardcoded login credentials
const USERNAME = 'Topboy';
const PASSWORD = '151007';

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'cypher-x-lock',
  resave: false,
  saveUninitialized: false,
}));

function isAuthenticated(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/login');
}

async function createSession(userId) {
  const sessionPath = path.join(SESSION_DIR, userId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['CØÑ$PÏRÅÇ¥', 'Cloudfare', '1.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;
    const sessionPath = path.join(SESSION_DIR, userId);

    if (qr) {
      qrcode.toDataURL(qr, (err, qrData) => {
        if (!err && SESSIONS[userId]) {
          SESSIONS[userId].qr = qrData;
        }
      });
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.message;
      console.log(`User ${userId} disconnected: ${reason}`);

      if (
        reason === DisconnectReason.loggedOut ||
        reason === 401 ||
        /logged out/i.test(reason)
      ) {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        delete SESSIONS[userId];
      } else {
        await createSession(userId); // Try reconnect
      }
    }

    if (connection === 'open') {
      console.log(`✅ User ${userId} connected`);
      SESSIONS[userId].qr = null;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || !msg.key.fromMe) return;

    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption || '';

    if (text && text.toLowerCase().startsWith('.menu')) {
      const start = performance.now();
      await new Promise(r => setTimeout(r, 100));
      const end = performance.now();
      const speed = (end - start).toFixed(3);

      const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      const totalMemory = os.totalmem() / 1024 / 1024;
      const ramPercentage = ((usedMemory / totalMemory) * 100).toFixed(0);
      const bar = `[${'█'.repeat(ramPercentage / 10)}${'░'.repeat(10 - ramPercentage / 10)}] ${ramPercentage}%`;

      const menu = `
┏▣ ◈ CØÑ$PÏRÅÇ¥ ◈
┃ ᴜsᴇʀ : ${userId}
┃ ᴘʀᴇғɪx : [ . ]
┃ ʜᴏsᴛ : Cloudfare
┃ ᴘʟᴜɢɪɴs : 309
┃ ᴍᴏᴅᴇ : Private
┃ ᴠᴇʀsɪᴏɴ : 1.7.8
┃ sᴘᴇᴇᴅ : ${speed} ms
┃ ᴜsᴀɢᴇ : ${usedMemory.toFixed(2)} MB of ${totalMemory.toFixed(0)} MB
┃ ʀᴀᴍ: ${bar}
┗▣`;
      await sock.sendMessage(msg.key.remoteJid, { text: menu }, { quoted: msg });
    }
  });

  SESSIONS[userId] = { sock, qr: null };
}

// Routes

app.get('/login', (req, res) => {
  res.send(`
    <html><body style="text-align:center;font-family:sans-serif">
      <h2>Login to CØÑ$PÏRÅÇ¥-X</h2>
      <form method="POST" action="/login">
        <input name="username" placeholder="Username" required /><br/>
        <input name="password" type="password" placeholder="Password" required /><br/>
        <button type="submit">Login</button>
      </form>
    </body></html>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect('/dashboard');
  }
  res.send('Invalid credentials. <a href="/login">Try again</a>');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', isAuthenticated, (req, res) => {
  res.send(`
    <html><body style="text-align:center;font-family:sans-serif">
      <h2>CØÑ$PÏRÅÇ¥ Multi-User Login</h2>
      <form method="GET" action="/qr">
        <input name="id" placeholder="Enter your unique ID" required />
        <button type="submit">Get QR</button>
      </form><br/>
      <a href="/dashboard">Go to Dashboard</a><br/>
      <a href="/logout">Logout</a>
    </body></html>
  `);
});

app.get('/qr', isAuthenticated, async (req, res) => {
  const userId = req.query.id;
  const reset = req.query.reset === '1';

  if (!userId) return res.status(400).send('Missing ?id');

  const sessionPath = path.join(SESSION_DIR, userId);
  if (reset && fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    delete SESSIONS[userId];
  }

  if (!SESSIONS[userId]) await createSession(userId);
  const qr = SESSIONS[userId].qr;

  if (!qr) {
    return res.send(`
      <html><body style="text-align:center;font-family:sans-serif">
        <h2>No QR Code – already logged in?</h2>
        <p>Try sending .menu in WhatsApp to test</p>
        <p><a href="/qr?id=${userId}&reset=1">🔁 Reset Session</a></p>
        <a href="/dashboard">Back to Dashboard</a>
      </body></html>
    `);
  }

  res.send(`
    <html><body style="text-align:center;font-family:sans-serif">
      <h2>Scan QR Code for ${userId}</h2>
      <img src="${qr}" width="300" height="300" />
      <p>Go to WhatsApp → Linked Devices → Scan</p>
      <p><a href="/qr?id=${userId}">Refresh QR</a> | <a href="/dashboard">Back</a></p>
    </body></html>
  `);
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  let html = `
    <html><body style="font-family:sans-serif">
    <h2>📋 Active User Sessions</h2>
    <table border="1" cellpadding="10" style="border-collapse:collapse">
    <tr><th>User ID</th><th>Status</th><th>Actions</th></tr>
  `;

  for (const [id, data] of Object.entries(SESSIONS)) {
    const status = data.qr ? 'Awaiting QR Scan' : 'Connected';
    html += `
      <tr>
        <td>${id}</td>
        <td>${status}</td>
        <td>
          <form method="POST" action="/remove-user" style="display:inline">
            <input type="hidden" name="id" value="${id}" />
            <button type="submit" onclick="return confirm('Remove ${id}?')">💀 Remove</button>
          </form>
          <form method="GET" action="/qr" style="display:inline">
            <input type="hidden" name="id" value="${id}" />
            <input type="hidden" name="reset" value="1" />
            <button type="submit">🔁 Reset QR</button>
          </form>
        </td>
      </tr>
    `;
  }

  html += `
    </table><br/>
    <a href="/">Back</a> | <a href="/logout">Logout</a>
    </body></html>
  `;

  res.send(html);
});

app.post('/remove-user', isAuthenticated, express.urlencoded({ extended: true }), async (req, res) => {
  const userId = req.body.id;
  const sessionPath = path.join(SESSION_DIR, userId);

  if (SESSIONS[userId]) {
    try {
      await SESSIONS[userId].sock.logout();
    } catch (err) {
      console.log(`Error logging out ${userId}:`, err.message);
    }
    delete SESSIONS[userId];
  }

  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  res.redirect('/dashboard');
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
