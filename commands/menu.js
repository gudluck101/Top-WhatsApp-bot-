module.exports = {
  name: 'menu',
  run: async ({ sock, from }) => {
    const ramUsage = '30%';  // Example value, calculate it as needed
    const speed = '50ms';  // Example value

    const menuText = `
┏▣ ◈ *CYPHER-X* ◈    
┃ *ᴏᴡɴᴇʀ* : Not Set!    
┃ *ᴘʀᴇғɪx* : [ . ]    
┃ *ᴍᴏᴅᴇ* : Private    
┃ *ᴠᴇʀsɪᴏɴ* : 1.7.8    
┃ *sᴘᴇᴇᴅ* : ${speed}    
┃ *ʀᴀᴍ:* ${ramUsage}    
┗▣
    `;
    await sock.sendMessage(from, { text: menuText.trim() });
  }
};
