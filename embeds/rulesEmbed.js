const { EmbedBuilder } = require('discord.js');

function getRulesEmbed() {
    return new EmbedBuilder()
        .setTitle('📜 Server Content Rules')
        .setDescription(
            `Keep it real, fair, and clean! Any attempt to bot or bypass the system = instant rejection and permanent ban from future campaigns.\n\n` +
            `**❌ No Cheating / Manipulation**\n` +
            `• No viewbots, fake engagement, or paid ads.\n` +
            `• No buying followers/likes or submitting duplicate clips across alt accounts.\n` +
            `• *Detected manipulation = automatic blacklist.*\n\n` +
            `**🧩 Content Guidelines**\n` +
            `• **Language:** Must be in English.\n` +
            `• **Transparency:** Engagement stats (likes/comments) MUST be public. Hidden stats = auto reject.`
        )
        .setColor('#ED4245');
}

function getStartEmbed() {
    return new EmbedBuilder()
        .setTitle('🎬 How To Start & Submission Rules')
        .setDescription(
            `Ready to clip? Make sure you follow these posting guidelines:\n\n` +
            `**📊 Rules Per Posting**\n` +
            `• Minimum **2-hour gap** between posts if you submit multiple clips.\n` +
            `• Only organic engagement on comic/manga content is counted.\n` +
            `• Restricted comments or hidden analytics = auto reject.\n\n` +
            `**⏱️ 48-Hour Active Window**\n` +
            `• Each clip is active for **2 days (48 hours)** after posting.\n` +
            `• Once submitted, any further view/like growth stops counting.\n` +
            `• Submit your clip link along with a screenshot of your analytics.\n` +
            `• *Late submissions after 48h will automatically expire.*\n\n` +
            `👉 **Click the button below to grab your creator role and start clipping!**`
        )
        .setColor('#57F287');
}

module.exports = { getRulesEmbed, getStartEmbed };

