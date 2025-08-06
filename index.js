const express = require('express');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');
const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  delay, 
  Browsers, 
  makeCacheableSignalKeyStore, 
  DisconnectReason 
} = require('baileys');
const { upload } = require('./mega');
const { Mutex } = require('async-mutex');
const config = require('./config');
const path = require('path');

// Initialize Express
const app = express();
const port = 3000;

let session;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();

// Static files like images, etc
app.use(express.static(path.join(__dirname, 'static')));

// Main connector function
async function connector(Num, res) {
    const sessionDir = './session';
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir);
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    session = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' }))
        },
        logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
        browser: Browsers.macOS("Safari"),
        markOnlineOnConnect: true,
        msgRetryCounterCache
    });

    if (!session.authState.creds.registered) {
        await delay(1500);
        Num = Num.replace(/[^0-9]/g, '');
        const code = await session.requestPairingCode(Num);
        if (!res.headersSent) {
            res.send({ code: code?.match(/.{1,4}/g)?.join('-') });
        }
    }

    session.ev.on('creds.update', async () => {
        await saveCreds();
    });

    session.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('Connected successfully');
            await delay(5000);
            await session.sendMessage(session.user.id, { text: `${config.MESSAGE}` });
            const pth = './session/creds.json';
            try {
                const url = await upload(pth);
                const sID = url.includes("https://mega.nz/file/") ? config.PREFIX + url.split("https://mega.nz/file/")[1] : 'Failed to get URL';
                await session.sendMessage(session.user.id, { image: { url: `${config.IMAGE}` }, caption: `*Session ID*\n\n${sID}` });
            } catch (error) {
                console.error('Error:', error);
            } finally {
                if (fs.existsSync(path.join(__dirname, './session'))) {
                    fs.rmdirSync(path.join(__dirname, './session'), { recursive: true });
                }
            }
        } else if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            reconn(reason);
        }
    });
}

function reconn(reason) {
    if ([DisconnectReason.connectionLost, DisconnectReason.connectionClosed, DisconnectReason.restartRequired].includes(reason)) {
        console.log('Connection lost, reconnecting...');
        connector();
    } else {
        console.log(`Disconnected! reason: ${reason}`);
        session.end();
    }
}

// Load commands
const loadCommands = require('./utils/commandLoader');
app.get('/pair', async (req, res) => {
    const Num = req.query.code;
    if (!Num) {
        return res.status(418).json({ message: 'Phone number is required' });
    }

    // Mutex to avoid simultaneous requests
    const release = await mutex.acquire();
    try {
        await connector(Num, res);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "fekd up" });
    } finally {
        release();
    }
});

// Initialize command loader after connection
loadCommands(session);

app.listen(port, () => {
    console.log(`Running on PORT:${port}`);
});
