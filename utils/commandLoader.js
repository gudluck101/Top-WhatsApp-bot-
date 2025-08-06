const fs = require('fs');
const path = require('path');

function loadCommands(sock) {
    const commands = new Map();
    const dir = path.join(__dirname, '../commands');

    // Dynamically load all command files
    fs.readdirSync(dir).forEach(file => {
        const command = require(path.join(dir, file));
        if (command.name && typeof command.run === 'function') {
            commands.set(command.name, command);
        }
    });

    // Listen for messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        let text = '';

        // Get message text
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        }

        // Check if the message starts with a command
        if (!text.startsWith('.')) return;

        const args = text.slice(1).trim().split(' ');
        const cmdName = args.shift().toLowerCase();
        const command = commands.get(cmdName);

        if (command) {
            try {
                await command.run({ sock, msg, from, args });
            } catch (err) {
                console.error(`Error running .${cmdName}`, err);
                await sock.sendMessage(from, { text: '❌ Command error occurred.' });
            }
        }
    });
}

module.exports = loadCommands;
