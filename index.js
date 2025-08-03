const startBot = async () => { const { state, saveCreds } = await useMultiFileAuthState('auth');

const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }), printQRInTerminal: true });

sock.ev.on('creds.update', saveCreds);

sock.ev.on('messages.upsert', async ({ messages }) => { const msg = messages[0]; if (!msg.message || msg.key.fromMe) return;

const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

if (text.startsWith('.menu')) {
  const start = performance.now();

  // Simulate load
  await new Promise(res => setTimeout(res, 200));
  const end = performance.now();

  const speed = (end - start).toFixed(4);
  const usedMemory = process.memoryUsage().heapUsed / 1024 / 1024;
  const totalMemory = os.totalmem() / 1024 / 1024;
  const ramPercentage = ((usedMemory / totalMemory) * 100).toFixed(0);

  const menu = `

┏▣ ◈ CYPHER-X ◈ ┃ ᴏᴡɴᴇʀ : Not Set! ┃ ᴘʀᴇғɪx : [ . ] ┃ ʜᴏsᴛ : Render ┃ ᴘʟᴜɢɪɴs : 309 ┃ ᴍᴏᴅᴇ : Private ┃ ᴠᴇʀsɪᴏɴ : 1.7.8 ┃ sᴘᴇᴇᴅ : ${speed} ms ┃ ᴜsᴀɢᴇ : ${usedMemory.toFixed(2)} MB of ${totalMemory.toFixed(0)} MB ┃ ʀᴀᴍ: [${'█'.repeat(ramPercentage / 10)}${'░'.repeat(10 - ramPercentage / 10)}] ${ramPercentage}% ┗▣`;

await sock.sendMessage(msg.key.remoteJid, { text: menu }, { quoted: msg });
}

}); };

startBot();

