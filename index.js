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
const os = require('os');
const { performance } = require('perf_hooks');
const { execSync } = require('child_process');

var app = express();
var port = 3000;
var session;
const msgRetryCounterCache = new NodeCache();
const mutex = new Mutex();
app.use(express.static(path.join(__dirname, 'static')));

// System info helpers
function getSpeed() {
    const start = performance.now();
    for (let i = 0; i < 1e6; i++) {}
    const end = performance.now();
    return (end - start).toFixed(4);
}

function getRAMUsageBar() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percent = Math.round((used / total) * 100);
    const barLength = 10;
    const bars = Math.round((percent / 100) * barLength);
    const bar = '█'.repeat(bars) + '░'.repeat(barLength - bars);
    return { bar, percent };
}

function getDiskUsage() {
    try {
        const output = execSync('df -h --output=used,size / | tail -1').toString();
        const parts = output.trim().split(/\s+/);
        return `${parts[0]} of ${parts[1]}`;
    } catch (e) {
        return 'Unknown';
    }
}

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
            var reason = lastDisconnect?.error?.output?.statusCode;
            reconn(reason);
        }
    });

    // Listen for `.menu` messages
    session.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages || !messages[0]) return;

        const msg = messages[0];
        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const isBot = msg.key.fromMe;

        if (!msg.message || isBot) return;

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!body || !body.startsWith('.menu')) return;

        const speed = getSpeed();
        const ramInfo = getRAMUsageBar();
        const disk = getDiskUsage();

        const menu = `
┏▣ ◈ *CYPHER-X* ◈
┃ *ᴏᴡɴᴇʀ* : Not Set!
┃ *ᴘʀᴇғɪx* : [ . ]
┃ *ʜᴏsᴛ* : Panel
┃ *ᴘʟᴜɢɪɴs* : 309
┃ *ᴍᴏᴅᴇ* : Private
┃ *ᴠᴇʀsɪᴏɴ* : 1.7.8
┃ *sᴘᴇᴇᴅ* : ${speed} ms
┃ *ᴜsᴀɢᴇ* : ${disk}
┃ *ʀᴀᴍ:* [${ramInfo.bar}] ${ramInfo.percent}%
┗▣


┏▣ ◈  *AI MENU* ◈
│➽ analyze
│➽ blackbox
│➽ dalle
│➽ gemini
│➽ generate
│➽ deepseek
│➽ deepseekr1
│➽ doppleai
│➽ gpt
│➽ gpt2
│➽ imagen
│➽ imagine
│➽ llama
│➽ metaai
│➽ mistral
│➽ photoai
┗▣ 

┏▣ ◈  *AUDIO MENU* ◈
│➽ bass
│➽ blown
│➽ deep
│➽ earrape
│➽ reverse
│➽ robot
│➽ volaudio
│➽ tomp3
│➽ toptt
┗▣ 

┏▣ ◈  *DOWNLOAD MENU* ◈
│➽ apk
│➽ download
│➽ facebook
│➽ gdrive
│➽ gitclone
│➽ image
│➽ instagram
│➽ itunes
│➽ mediafire
│➽ song
│➽ song2
│➽ play
│➽ play2
│➽ savestatus
│➽ telesticker
│➽ tiktok
│➽ tiktokaudio
│➽ twitter
│➽ video
│➽ videodoc
│➽ xvideos
│➽ ytmp3
│➽ ytmp3doc
│➽ ytmp4
│➽ ytmp4doc
┗▣ 

┏▣ ◈  *EPHOTO360 MENU* ◈
│➽ 1917style
│➽ advancedglow
│➽ blackpinklogo
│➽ blackpinkstyle
│➽ cartoonstyle
│➽ deletingtext
│➽ dragonball
│➽ effectclouds
│➽ flag3dtext
│➽ flagtext
│➽ freecreate
│➽ galaxystyle
│➽ galaxywallpaper
│➽ glitchtext
│➽ glowingtext
│➽ gradienttext
│➽ graffiti
│➽ incandescent
│➽ lighteffects
│➽ logomaker
│➽ luxurygold
│➽ makingneon
│➽ matrix
│➽ multicoloredneon
│➽ neonglitch
│➽ papercutstyle
│➽ pixelglitch
│➽ royaltext
│➽ sand
│➽ summerbeach
│➽ topography
│➽ typography
│➽ watercolortext
│➽ writetext
┗▣ 

┏▣ ◈  *FUN MENU* ◈
│➽ dare
│➽ fact
│➽ jokes
│➽ memes
│➽ quotes
│➽ trivia
│➽ truth
│➽ truthdetector
│➽ xxqc
┗▣ 

┏▣ ◈  *GROUP MENU* ◈
│➽ add
│➽ antibadword
│➽ antibot
│➽ antitag
│➽ antitagadmin
│➽ antigroupmention
│➽ antilink
│➽ antilinkgc
│➽ allow
│➽ delallowed
│➽ listallowed
│➽ announcements
│➽ antidemote
│➽ antiforeign
│➽ addcode
│➽ delcode
│➽ listcode
│➽ listactive
│➽ listinactive
│➽ kickinactive
│➽ kickall
│➽ cancelkick
│➽ antipromote
│➽ welcome
│➽ approveall
│➽ close
│➽ delppgroup
│➽ demote
│➽ disapproveall
│➽ getgrouppp
│➽ editsettings
│➽ link
│➽ hidetag
│➽ invite
│➽ kick
│➽ listonline
│➽ listrequests
│➽ mediatag
│➽ open
│➽ closetime
│➽ opentime
│➽ poll
│➽ promote
│➽ resetlink
│➽ setdesc
│➽ setgroupname
│➽ setppgroup
│➽ tagadmin
│➽ tagall
│➽ totalmembers
│➽ userid
│➽ vcf
┗▣ 

┏▣ ◈  *IMAGE MENU* ◈
│➽ remini
│➽ wallpaper
┗▣ 

┏▣ ◈  *OTHER MENU* ◈
│➽ botstatus
│➽ pair
│➽ ping
│➽ runtime
│➽ repo
│➽ time
┗▣ 

┏▣ ◈  *OWNER MENU* ◈
│➽ block
│➽ delete
│➽ deljunk
│➽ disk
│➽ dlvo
│➽ gcaddprivacy
│➽ groupid
│➽ hostip
│➽ join
│➽ lastseen
│➽ leave
│➽ listbadword
│➽ listblocked
│➽ listignorelist
│➽ listsudo
│➽ modestatus
│➽ online
│➽ owner
│➽ ppprivacy
│➽ react
│➽ readreceipts
│➽ restart
│➽ setbio
│➽ setprofilepic
│➽ setstickercmd
│➽ delstickercmd
│➽ tostatus
│➽ toviewonce
│➽ unblock
│➽ unblockall
│➽ warn
┗▣ 

┏▣ ◈  *RELIGION MENU* ◈
│➽ bible
│➽ quran
┗▣ 

┏▣ ◈  *SEARCH MENU* ◈
│➽ define
│➽ define2
│➽ imdb
│➽ lyrics
│➽ shazam
│➽ weather
│➽ yts
┗▣ 

┏▣ ◈  *SETTINGS MENU* ◈
│➽ addbadword
│➽ addignorelist
│➽ addsudo
│➽ alwaysonline
│➽ antibug
│➽ anticall
│➽ antidelete
│➽ antideletestatus
│➽ antiedit
│➽ autobio
│➽ autoreactstatus
│➽ autoviewstatus
│➽ autoreact
│➽ autoread
│➽ autotype
│➽ autorecord
│➽ autorecordtyping
│➽ autoblock
│➽ addcountrycode
│➽ delcountrycode
│➽ listcountrycode
│➽ chatbot
│➽ deletebadword
│➽ delignorelist
│➽ delsudo
│➽ mode
│➽ setmenu
│➽ setprefix
│➽ setstatusemoji
│➽ setbotname
│➽ setownername
│➽ setownernumber
│➽ setwatermark
│➽ setstickerauthor
│➽ setstickerpackname
│➽ settimezone
│➽ setcontextlink
│➽ setmenuimage
│➽ setanticallmsg
│➽ showanticallmsg
│➽ delanticallmsg
│➽ testanticallmsg
│➽ getsettings
│➽ resetwarn
│➽ setwarn
│➽ listwarn
│➽ resetsetting
┗▣ 

┏▣ ◈  *SPORTS MENU* ◈
│➽ clstandings
│➽ laligastandings
│➽ bundesligastandings
│➽ serieastandings
│➽ ligue1standings
│➽ elstandings
│➽ eflstandings
│➽ wcstandings
│➽ eplstandings
│➽ eplmatches
│➽ clmatches
│➽ laligamatches
│➽ bundesligamatches
│➽ serieamatches
│➽ ligue1matches
│➽ elmatches
│➽ eflmatches
│➽ wcmatches
│➽ eplscorers
│➽ clscorers
│➽ laligascorers
│➽ bundesligascorers
│➽ serieascorers
│➽ ligue1scorers
│➽ elscorers
│➽ eflscorers
│➽ wcscorers
│➽ eplupcoming
│➽ clupcoming
│➽ laligaupcoming
│➽ bundesligaupcoming
│➽ serieaupcoming
│➽ ligue1upcoming
│➽ elupcoming
│➽ eflupcoming
│➽ wcupcoming
│➽ wrestlingevents
│➽ wwenews
│➽ wweschedule
┗▣ 

┏▣ ◈  *SUPPORT MENU* ◈
│➽ feedback
│➽ helpers
┗▣ 

┏▣ ◈  *TOOLS MENU* ◈
│➽ browse
│➽ calculate
│➽ getpp
│➽ getabout
│➽ emojimix
│➽ fliptext
│➽ gsmarena
│➽ genpass
│➽ device
│➽ obfuscate
│➽ filtervcf
│➽ qrcode
│➽ say
│➽ ssweb
│➽ sswebpc
│➽ sswebtab
│➽ sticker
│➽ fancy
│➽ take
│➽ tinyurl
│➽ toimage
│➽ tourl
│➽ translate
│➽ texttopdf
│➽ vcc
┗▣ 

┏▣ ◈  *VIDEO MENU* ◈
│➽ volvideo
│➽ toaudio
│➽ tovideo
┗▣ 

        `.trim();

        await session.sendMessage(from, { text: menu }, { quoted: msg });
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
