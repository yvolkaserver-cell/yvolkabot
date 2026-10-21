const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionFlagsBits 
} = require('discord.js');

async function handleMessageCommands(message, client) {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (!message.member || !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return;
    }

    // 1. !setup-admin
    if (command === 'setup-admin') {
        const adminEmbed = new EmbedBuilder()
            .setTitle('⚙️ Rune Viral - Admin Dashboard')
            .setDescription('Manage clipping campaigns, post new campaigns, edit rates, or archive finished campaigns.')
            .setColor('#5865F2')
            .setFooter({ text: 'Rune Viral Admin System' })
            .setTimestamp();

        const addBtn = new ButtonBuilder().setCustomId('admin_add_campaign_btn').setLabel('➕ Add Campaign').setStyle(ButtonStyle.Success);
        const closeBtn = new ButtonBuilder().setCustomId('admin_close_campaign_btn').setLabel('⛔ Close Campaign').setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(addBtn, closeBtn);
        await message.delete().catch(() => {});
        return await message.channel.send({ embeds: [adminEmbed], components: [row] });
    }

    // 2. !setup-start
    if (command === 'setup-start') {
        const activeChannelId = process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID ? `<#${process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID}>` : 'the active campaigns channel';

        const startEmbed = new EmbedBuilder()
            .setTitle('🚀 How to Start Clipping & Earn Rewards')
            .setDescription(
                `Welcome to **Rune Viral**!\n\n` +
                `**1️⃣ Set Your Profile (One-Time)**\n` +
                `Click the **👤 Set / Edit Profile** button below to register your TikTok/IG usernames (max 3) and payment info.\n\n` +
                `**2️⃣ Browse Campaigns**\n` +
                `Check active campaigns in ${activeChannelId}.\n\n` +
                `**3️⃣ Submit Your Clip**\n` +
                `Click **📤 Submit Clip** and paste your TikTok video link. Metrics & views are fetched automatically!`
            )
            .setColor('#57F287')
            .setFooter({ text: 'Rune Viral Clipper Guide' })
            .setTimestamp();

        const profileBtn = new ButtonBuilder()
            .setCustomId('btn_open_profile_setup')
            .setLabel('👤 Set / Edit Profile')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(profileBtn);

        await message.delete().catch(() => {});
        return await message.channel.send({ embeds: [startEmbed], components: [row] });
    }

    // 3. !setup-ticket
    if (command === 'setup-ticket') {
        const ticketEmbed = new EmbedBuilder()
            .setTitle('🎫 Need Help? Open a Support Ticket')
            .setDescription('Click the button below if you have inquiries, payment issues, or private questions for Staff.')
            .setColor('#FEE75C')
            .setFooter({ text: 'Rune Viral Support' })
            .setTimestamp();

        const ticketBtn = new ButtonBuilder()
            .setCustomId('btn_open_ticket')
            .setLabel('📩 Open Ticket')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(ticketBtn);

        await message.delete().catch(() => {});
        return await message.channel.send({ embeds: [ticketEmbed], components: [row] });
    }

    // 4. !sync-views / !check-vt (Manual trigger tracker)
    if (command === 'sync-views' || command === 'check-vt') {
        const { runViewsTrackerCycle } = require('./viewsTracker');

        const statusMsg = await message.reply('⏳ **[TRACKER]** Memulai pengecekan dan sinkronisasi live views/likes seluruh VT di Google Sheets...');

        try {
            const res = await runViewsTrackerCycle(client);

            const resultEmbed = new EmbedBuilder()
                .setTitle('📊 Hasil Sinkronisasi Live Views & Likes')
                .setColor(res.totalUpdated > 0 ? '#57F287' : '#5865F2')
                .setDescription(
                    `Pengecekan live metrics TikTok selesai dalam **${res.elapsed || 0} detik**.\n\n` +
                    `• 🔍 **Total VT Dicek**: \`${res.totalChecked || 0}\` video\n` +
                    `• 📈 **Total VT Terupdate**: \`${res.totalUpdated || 0}\` baris baru\n` +
                    `• ⏭️ **Dilewati (Tidak berubah/error)**: \`${res.totalSkipped || 0}\` baris\n` +
                    `• 📋 **Tab Campaign Terdampak**: \`${(res.updatedTabs && res.updatedTabs.length) ? res.updatedTabs.join(', ') : 'Tidak ada'}\``
                )
                .setFooter({ text: 'Rune Viral 24/7 Auto Tracker' })
                .setTimestamp();

            return await statusMsg.edit({ content: '✅ **Sinkronisasi Selesai!**', embeds: [resultEmbed] });
        } catch (err) {
            console.error('[MANUAL SYNC ERROR]:', err);
            return await statusMsg.edit({ content: `❌ **Gagal menjalankan tracker:** \`${err.message}\`` });
        }
    }
}

module.exports = { handleMessageCommands };

