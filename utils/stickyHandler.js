const { EmbedBuilder } = require('discord.js');

let lastStickyMessageId = null;

async function handleStickyMessage(message) {
    const stickyChannelId = process.env.STICKY_CHANNEL_ID || process.env.SUBMIT_ADMIN_CHANNEL_ID;
    if (!stickyChannelId || message.channel.id !== stickyChannelId) return;

    if (message.author.bot && message.embeds.length && message.embeds[0]?.title?.includes('Quick Tip')) return;

    try {
        if (lastStickyMessageId) {
            const oldMsg = await message.channel.messages.fetch(lastStickyMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
        }

        const stickyEmbed = new EmbedBuilder()
            .setTitle('📌 Quick Tip for Clippers')
            .setDescription('Make sure your TikTok profile is registered before submitting clips! Check active campaigns for current pay rates.')
            .setColor('#FEE75C');

        const newMsg = await message.channel.send({ embeds: [stickyEmbed] });
        lastStickyMessageId = newMsg.id;
    } catch (err) {
        console.error('[STICKY ERROR]:', err.message);
    }
}

module.exports = { handleStickyMessage };
