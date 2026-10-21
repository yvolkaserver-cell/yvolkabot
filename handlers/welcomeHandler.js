const { EmbedBuilder } = require('discord.js');

async function handleGuildMemberAddWelcome(member) {
    try {
        const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
        if (!welcomeChannelId) {
            console.warn('[WELCOME WARN] WELCOME_CHANNEL_ID not set in .env');
            return;
        }

        const channel = member.guild.channels.cache.get(welcomeChannelId);
        if (!channel) {
            console.error(`[WELCOME ERROR] Channel with ID ${welcomeChannelId} not found!`);
            return;
        }

        const howToStartChannelId = process.env.START_CHANNEL_ID || process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID;
        const howToStartMention = howToStartChannelId ? `<#${howToStartChannelId}>` : '#how-to-start';

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎉 Welcome to Rune Viral, ${member.user.username}!`)
            .setDescription(
                `Hey ${member}, welcome to the official **Rune Viral** !\n\n` +
                `🚀 **Getting Started:**\n` +
                `Head over to ${howToStartMention} to set up your Clipper Profile and start submitting video clips to active campaigns.\n\n` +
                `📌 **Quick Steps:**\n` +
                `1️⃣ Click **👤 Set / Edit Profile** to link your social accounts & payment info.\n` +
                `2️⃣ Check active campaigns and submit your TikTok/IG clips.\n` +
                `3️⃣ Track your approved views & earnings directly in your **Dashboard**!`
            )
            .setColor('#5865F2')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'Rune Viral Clipper System' })
            .setTimestamp();

        await channel.send({
            content: `👋 Welcome ${member}!`,
            embeds: [welcomeEmbed]
        });

        console.log(`[WELCOME SUCCESS] Sent welcome message for ${member.user.tag}`);
    } catch (err) {
        console.error('[WELCOME ERROR]:', err.message);
    }
}

module.exports = { handleGuildMemberAddWelcome };
