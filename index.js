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

var app = express();
var port = 3000;
var session;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
const authenticatedUsers = {}; // 🔐 Memory-based auth store

app.use(express.static(path.join(__dirname, 'static')));

async function connector(Num, res) {
    var sessionDir = './session';
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir);
    }
    var { state, saveCreds } = await useMultiFileAuthState(sessionDir);

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
        var code = await session.requestPairingCode(Num);
        if (!res.headersSent) {
            res.send({ code: code?.match(/.{1,4}/g)?.join('-') });
        }
    }

    session.ev.on('creds.update', async () => {
        await saveCreds();
    });

    session.ev.on('connection.update', async (update) => {
        var { connection, lastDisconnect } = update;
        if (connection === 'open') {
            console.log('Connected successfully');
            await delay(5000);
            var myr = await session.sendMessage(session.user.id, { text: `${config.MESSAGE}` });
            var pth = './session/creds.json';
            try {
                var url = await upload(pth);
                var sID;
                if (url.includes("https://mega.nz/file/")) {
                    sID = config.PREFIX + url.split("https://mega.nz/file/")[1];
                } else {
                    sID = 'Fekd up';
                }
                await session.sendMessage(session.user.id, { image: { url: `${config.IMAGE}` }, caption: `*Session ID*\n\n${sID}` }, { quoted: myr });

            } catch (error) {
                console.error('Error:', error);
            } finally {
                if (fs.existsSync(path.join(__dirname, './session'))) {
                    fs.rmdirSync(path.join(__dirname, './session'), { recursive: true });
                }
            }
        } else if (connection === 'close') {
            var reason = lastDisconnect?.error?.output?.statusCode;
            reconn(reason);
        }
    });

    // 🔐 Handle commands from users
    session.ev.on('messages.upsert', async ({ messages, type }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

        if (body.startsWith('.password')) {
            const parts = body.split(' ');
            if (parts[1] === 'Topboy123') {
                authenticatedUsers[sender] = true;
                await session.sendMessage(sender, { text: `✅ Authenticated. You can now use .pair` });
            } else {
                await session.sendMessage(sender, { text: `❌ Wrong password.` });
            }
        }

        else if (body.startsWith('.pair')) {
            if (!authenticatedUsers[sender]) {
                return session.sendMessage(sender, { text: `⛔ Please authenticate first using .password` });
            }

            const phone = body.split(' ')[1];
            if (!phone || !/^\+?\d{10,15}$/.test(phone)) {
                return session.sendMessage(sender, { text: `⚠️ Invalid phone number.` });
            }

            try {
                const formatted = phone.replace(/\D/g, '');
                const { state, saveCreds } = await useMultiFileAuthState('./session');
                const tempSock = makeWASocket({
                    auth: {
                        creds: state.creds,
                        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
                    },
                    logger: pino({ level: 'fatal' }),
                    browser: Browsers.macOS('Safari'),
                    msgRetryCounterCache
                });

                await delay(1500);
                const code = await tempSock.requestPairingCode(formatted);
                const pairingCode = code?.match(/.{1,4}/g)?.join('-');
                await session.sendMessage(sender, { text: `🔗 Pairing code for ${phone}:\n*${pairingCode}*` });

                if (fs.existsSync(path.join(__dirname, './session'))) {
                    fs.rmdirSync(path.join(__dirname, './session'), { recursive: true });
                }

            } catch (err) {
                console.error(err);
                await session.sendMessage(sender, { text: `❌ Failed to generate pairing code.` });
            }
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

app.get('/pair', async (req, res) => {
    var Num = req.query.code;
    if (!Num) {
        return res.status(418).json({ message: 'Phone number is required' });
    }

    var release = await mutex.acquire();
    try {
        await connector(Num, res);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "fekd up" });
    } finally {
        release();
    }
});

app.listen(port, () => {
    console.log(`Running on PORT:${port}`);
});
