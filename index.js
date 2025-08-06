const express = require('express');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');
const os = require('os');
const { performance } = require('perf_hooks');
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

const app = express();
const port = 3000;
let session;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
app.use(express.static(path.join(__dirname, 'static')));

function getBar(percent) {
    const totalBars = 10;
    const filledBars = Math.round((percent / 100) * totalBars);
    return '█'.repeat(filledBars) + '░'.repeat(totalBars - filledBars);
}

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

    // Handle .menu command
    session.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key?.remoteJid === 'status@broadcast') return;

        const sender = msg.key.remoteJid;
        const messageText =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            '';

        if (messageText.trim().toLowerCase() === '.menu') {
            const totalMem = os.totalmem();
            const usedMem = totalMem - os.freemem();
            const usageMB = (usedMem / 1024 / 1024).toFixed(0);
            const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(0);
            const usagePercent = ((usedMem / totalMem) * 100).toFixed(0);
            const bar = getBar(usagePercent);
            const start = performance.now();
            await delay(10);
            const speed = (performance.now() - start).toFixed(4);

            const menuText = `┏▣ ◈ *CYPHER-X* ◈
┃ *ᴏᴡɴᴇʀ* : Not Set!
┃ *ᴘʀᴇғɪx* : [ . ]
┃ *ʜᴏsᴛ* : Panel
┃ *ᴘʟᴜɢɪɴs* : 309
┃ *ᴍᴏᴅᴇ* : Private
┃ *ᴠᴇʀsɪᴏɴ* : 1.7.8
┃ *sᴘᴇᴇᴅ* : ${speed} ms
┃ *ᴜsᴀɢᴇ* : ${usageMB} MB of ${totalGB} GB
┃ *ʀᴀᴍ:* [${bar}] ${usagePercent}%
┗▣`;

            await session.sendMessage(sender, { text: menuText }, { quoted: msg });
        }
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
            const myr = await session.sendMessage(session.user.id, { text: `${config.MESSAGE}` });
            const pth = './session/creds.json';
            try {
                const url = await upload(pth);
                let sID;
                if (url.includes("https://mega.nz/file/")) {
                    sID = config.PREFIX + url.split("https://mega.nz/file/")[1];
                } else {
                    sID = 'Fekd up';
                }
                await session.sendMessage(session.user.id, {
                    image: { url: `${config.IMAGE}` },
                    caption: `*Session ID*\n\n${sID}`
                }, { quoted: myr });
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

app.get('/pair', async (req, res) => {
    const Num = req.query.code;
    if (!Num) {
        return res.status(418).json({ message: 'Phone number is required' });
    }

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

app.listen(port, () => {
    console.log(`Running on PORT:${port}`);
});
