const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    MessageFlags 
} = require('discord.js');
const { 
    appendSubmissionToSheet, 
    updateSubmissionStatusInSheet, 
    getCampaignTargetDetails,
    getCampaignMetadata,
    isLinkSubmitted 
} = require('../utils/sheetsHelper');
const { createProgressBar } = require('../utils/progressBar');
const { fetchTikTokMetrics, extractMusicId } = require('../utils/tiktokScraper');
const { getUserProfile } = require('./profileHandler');

async function syncCampaignCardBudget(client, tabName) {
    try {
        const channelId = process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID;
        if (!channelId) return;

        const channel = client.channels.cache.get(channelId);
        if (!channel) return;

        const targetData = await getCampaignTargetDetails(tabName);
        if (!targetData) return;

        const messages = await channel.messages.fetch({ limit: 50 });
        const campaignMsg = messages.find(m => {
            if (m.author.id !== client.user.id || !m.components.length) return false;
            const btn = m.components[0]?.components[0];
            return btn && btn.customId === `submit_clip_btn_${tabName}`;
        });

        if (!campaignMsg || !campaignMsg.embeds.length) return;

        const oldEmbed = campaignMsg.embeds[0];
        const progressBarText = createProgressBar(targetData.approvedViews, targetData.targetViews);

        const updatedFields = oldEmbed.fields.map(f => {
            if (f.name.includes('Target Status') || f.name.includes('Funding Status')) {
                return { name: '🎯 Target Status', value: progressBarText, inline: false };
            }
            return f;
        });

        const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields(updatedFields);
        await campaignMsg.edit({ embeds: [updatedEmbed] });
    } catch (err) {}
}

function getSubmitModal(campaignTitle = 'Clip Campaign', tabName = 'Sheet1') {
    const modal = new ModalBuilder()
        .setCustomId(`modal_clipper_submit_${tabName}`)
        .setTitle(`Submit Clip: ${campaignTitle.substring(0, 20)}`);

    const tiktokLink = new TextInputBuilder()
        .setCustomId('sub_tiktok_url')
        .setLabel('TikTok Video Link')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://www.tiktok.com/@username/video/123456789')
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(tiktokLink));
    return modal;
}

async function handleClipperModalSubmit(interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('modal_clipper_submit_')) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    // Profile Check: Registered in users.json & Members Tab?
    const userProfile = getUserProfile(interaction.user.id);
    if (!userProfile) {
        return interaction.editReply({
            content: '⚠️ **Profile Required!** Please set up your profile first via `👤 Set / Edit Profile` (!setup-start).'
        });
    }

    const parts = interaction.customId.split('_');
    const tabName = parts.slice(3).join('_') || 'Sheet1';
    const tiktokUrl = interaction.fields.getTextInputValue('sub_tiktok_url').trim();

    // Check 1: Link Duplication in Campaign Sheet Tab
    const duplicate = await isLinkSubmitted(tabName, tiktokUrl);
    if (duplicate) {
        return interaction.editReply({
            content: '❌ **Submission Rejected!**\nThis link has already been submitted to this campaign.'
        });
    }

    // Extract Video Metadata via tiktokScraper.js
    const metrics = await fetchTikTokMetrics(tiktokUrl);

    // Edge Case: Scraper API Rate Limit / Failure Fail safe
    if (!metrics || !metrics.success || !metrics.createTime) {
        return interaction.editReply({
            content: '⚠️ **Verification Service Busy!**\nUnable to verify TikTok video metadata at this moment (Rate limit / Scraper error).\nPlease wait 5 minutes and try submitting again.'
        });
    }

    // Ambil metadata campaign dari Sheet (Start Date & Music ID)
    const campaignMeta = await getCampaignMetadata(tabName);

    // Check 2: Upload Date Check (VT Upload Timestamp >= Campaign Start Timestamp)
    if (campaignMeta && campaignMeta.startDateUnix > 0) {
        if (metrics.createTime < campaignMeta.startDateUnix) {
            return interaction.editReply({
                content: `❌ **Submission Rejected!**\nThis video was uploaded on <t:${metrics.createTime}:F>, which is before the campaign started (<t:${campaignMeta.startDateUnix}:F>).`
            });
        }
    }

    // Check 3: Sound / Music Track Check (Video Music ID == Campaign Music ID)
    if (campaignMeta && campaignMeta.musicId) {
        const reqMusicId = extractMusicId(campaignMeta.musicId);
        const detectedMusicId = metrics.musicInfo?.id ? String(metrics.musicInfo.id).trim() : '';
        const detectedTitle = metrics.musicInfo?.title || 'Unknown Sound';
        const detectedAuthor = metrics.musicInfo?.authorName || '';

        let isAudioMatch = false;

        // 1. Direct ID match
        if (reqMusicId && detectedMusicId && (detectedMusicId === reqMusicId || campaignMeta.musicId.includes(detectedMusicId))) {
            isAudioMatch = true;
        }
        // 2. Direct string match
        else if (detectedMusicId && detectedMusicId === campaignMeta.musicId.trim()) {
            isAudioMatch = true;
        }
        // 3. Fallback Mechanism: String fuzzy matching or URL substring matching
        else {
            const cleanReq = campaignMeta.musicId.toLowerCase();
            const cleanTitle = detectedTitle.toLowerCase();
            const cleanAuthor = detectedAuthor.toLowerCase();
            if (cleanTitle.includes(cleanReq) || cleanAuthor.includes(cleanReq) || (cleanReq.length > 5 && (cleanTitle.includes(cleanReq.slice(0, 10)) || cleanReq.includes(cleanTitle)))) {
                isAudioMatch = true;
            }
        }

        if (!isAudioMatch) {
            return interaction.editReply({
                content: `❌ **Submission Rejected!**\nIncorrect audio track detected.\n- **Required:** ${campaignMeta.musicId}\n- **Detected:** ${detectedTitle} (${detectedMusicId || 'No Sound ID'})`
            });
        }
    }

    const submitAdminChannel = interaction.guild.channels.cache.get(process.env.SUBMIT_ADMIN_CHANNEL_ID);
    if (!submitAdminChannel) {
        return interaction.editReply({ content: '⚠️ Admin channel `#submit` not found in .env!' });
    }

    const submissionId = `SUB-${Date.now().toString().slice(-6)}`;

    const cardDescription = 
        `👤 **Clipper** : ${interaction.user} (Account: \`${metrics.authorUsername}\`)\n` +
        `📈 **Metrics** : ${metrics.views.toLocaleString()} Views • ${metrics.likes.toLocaleString()} Likes\n` +
        `⚡ **Eng. Rate** : ${metrics.engagementScore}%\n` +
        `📅 **VT Upload Date** : <t:${metrics.createTime}:F> (<t:${metrics.createTime}:R>)\n` +
        `🎵 **Audio Detected** : \`${metrics.musicInfo?.title || 'Unknown'}\` (${metrics.musicInfo?.id || 'N/A'})\n` +
        `🔗 **Video Link** : [Watch TikTok](${tiktokUrl})\n\n` +
        `⏳ **Status** : \`Pending Review\``;

    const adminEmbed = new EmbedBuilder()
        .setTitle(`📥 SUBMISSION #${submissionId.replace('SUB-', '')} — ${tabName}`)
        .setColor('#FEE75C')
        .setDescription(cardDescription)
        .setTimestamp();

    const approveBtn = new ButtonBuilder()
        .setCustomId(`approve_sub_${interaction.user.id}_${submissionId}_${tabName}`)
        .setLabel('🟢 Approve')
        .setStyle(ButtonStyle.Success);

    const rejectBtn = new ButtonBuilder()
        .setCustomId(`reject_sub_${interaction.user.id}_${submissionId}_${tabName}`)
        .setLabel('🔴 Reject')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn);

    await submitAdminChannel.send({ embeds: [adminEmbed], components: [row] });

    // Format Baris Baru Sesuai Skema 13 Kolom (PRD Section 5.B)
    // Col A: Sub ID, Col B: User ID, Col C: User Tag, Col D: Platform, Col E: Link
    // Col F: Views, Col G: Likes, Col H: Payout Formula (=INDIRECT("F"&ROW())*B$4)
    // Col I: VT Post Date [NEW], Col J: Music Detected [NEW], Col K: Rejection Notes, Col L: Status, Col M: Submitted At
    const vtPostDateIso = new Date(metrics.createTime * 1000).toISOString();
    const musicDetectedStr = `${metrics.musicInfo?.id || 'N/A'} - ${metrics.musicInfo?.title || 'Unknown'}`;

    const rowData = [
        submissionId,                                          // Col A: Submission ID
        interaction.user.id,                                   // Col B: User Discord ID
        interaction.user.tag,                                  // Col C: User Discord Tag
        'TikTok',                                              // Col D: Platform
        tiktokUrl,                                             // Col E: TikTok Video Link
        metrics.views,                                         // Col F: Total Views
        metrics.likes,                                         // Col G: Total Likes
        `=INDIRECT("F"&ROW())*B$4`,                            // Col H: Payout Formula
        vtPostDateIso,                                         // Col I: VT Post Date [NEW]
        musicDetectedStr,                                      // Col J: Music Detected [NEW]
        '-',                                                   // Col K: Rejection Notes
        'PENDING',                                             // Col L: Status
        new Date().toISOString()                               // Col M: Submitted At
    ];

    await appendSubmissionToSheet(tabName, rowData);

    await interaction.editReply({
        content: `✅ **Clip Submitted Successfully!** (ID: \`${submissionId}\`)\n• **Upload Date**: <t:${metrics.createTime}:f>\n• **Audio**: ${metrics.musicInfo?.title || 'Verified'}\n• **Metrics**: ${metrics.views.toLocaleString()} Views • ${metrics.likes.toLocaleString()} Likes\nSent to admin review queue.`
    });
}

async function handleAdminApprovalInteraction(interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('approve_sub_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = interaction.customId.split('_');
        const clipperId = parts[2];
        const submissionId = parts[3];
        const tabName = parts.slice(4).join('_');

        const archiveChannel = interaction.guild.channels.cache.get(process.env.ARCHIVE_SUBMIT_CHANNEL_ID);
        const submitAdminChannel = interaction.guild.channels.cache.get(process.env.SUBMIT_ADMIN_CHANNEL_ID);

        try {
            const targetMsg = interaction.message || await submitAdminChannel.messages.fetch(interaction.message.id).catch(() => null);
            if (!targetMsg) return await interaction.editReply({ content: '⚠️ Message not found or deleted.' });

            const oldEmbed = targetMsg.embeds[0];

            const updatedDescription = oldEmbed.description.replace(
                /⏳ \*\*Status\*\* : .*/,
                `✅ **Status** : \`APPROVED by ${interaction.user.tag}\``
            );

            const approvedEmbed = EmbedBuilder.from(oldEmbed)
                .setColor('#57F287')
                .setDescription(updatedDescription);

            if (archiveChannel) {
                await archiveChannel.send({ embeds: [approvedEmbed] });
            }

            await targetMsg.delete().catch(() => {});

            // Update status ke APPROVED di Sheet
            await updateSubmissionStatusInSheet(tabName, submissionId, `APPROVED by ${interaction.user.tag}`, '-');
            await syncCampaignCardBudget(interaction.client, tabName);

            try {
                const clipperUser = await interaction.client.users.fetch(clipperId);
                await clipperUser.send(`🎉 **Congratulations!** Your submission (\`${submissionId}\`) for campaign **${tabName}** has been **APPROVED**!`);
            } catch (e) {}

            return await interaction.editReply({ content: `✅ Submission \`${submissionId}\` approved!` });

        } catch (err) {
            console.error(err);
            return await interaction.editReply({ content: '⚠️ Failed to process approval.' });
        }
    }

    if (interaction.customId.startsWith('reject_sub_')) {
        const parts = interaction.customId.split('_');
        const clipperId = parts[2];
        const submissionId = parts[3];
        const tabName = parts.slice(4).join('_');

        const modal = new ModalBuilder()
            .setCustomId(`modal_reject_reason_${clipperId}_${interaction.message.id}_${submissionId}_${tabName}`)
            .setTitle(`Reject Submission #${submissionId.replace('SUB-', '')}`);

        const reasonInput = new TextInputBuilder()
            .setCustomId('reject_reason')
            .setLabel('Reason for Rejection')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., Low engagement / View botting detected')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return await interaction.showModal(modal);
    }
}

async function handleModalProofAndRejectSubmit(interaction) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('modal_reject_reason_')) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parts = interaction.customId.split('_');
    const clipperId = parts[3];
    const targetMsgId = parts[4];
    const submissionId = parts[5];
    const tabName = parts.slice(6).join('_');
    const reason = interaction.fields.getTextInputValue('reject_reason');

    const archiveChannel = interaction.guild.channels.cache.get(process.env.ARCHIVE_SUBMIT_CHANNEL_ID);
    const submitAdminChannel = interaction.guild.channels.cache.get(process.env.SUBMIT_ADMIN_CHANNEL_ID);

    try {
        const targetMsg = await submitAdminChannel.messages.fetch(targetMsgId).catch(() => null);
        
        if (targetMsg) {
            const oldEmbed = targetMsg.embeds[0];

            const updatedDescription = oldEmbed.description.replace(
                /⏳ \*\*Status\*\* : .*/,
                `❌ **Status** : \`REJECTED by ${interaction.user.tag} (Reason: ${reason})\``
            );

            const rejectedEmbed = EmbedBuilder.from(oldEmbed)
                .setColor('#ED4245')
                .setDescription(updatedDescription);

            if (archiveChannel) {
                await archiveChannel.send({ embeds: [rejectedEmbed] });
            }

            await targetMsg.delete().catch(() => {});
        }

        // Update status ke REJECTED di Sheet
        await updateSubmissionStatusInSheet(tabName, submissionId, `REJECTED`, reason);

        try {
            const clipperUser = await interaction.client.users.fetch(clipperId);
            await clipperUser.send(`⚠️ **Submission Rejected!** Your submission (\`${submissionId}\`) for **${tabName}** was rejected.\n\n**Reason:** ${reason}`);
        } catch (e) {}

        return await interaction.editReply({ content: `❌ Submission \`${submissionId}\` rejected.` });

    } catch (err) {
        console.error(err);
        return await interaction.editReply({ content: '⚠️ Failed to process rejection.' });
    }
}

module.exports = { 
    getSubmitModal, 
    handleClipperModalSubmit, 
    handleAdminApprovalInteraction, 
    handleModalProofAndRejectSubmit,
    syncCampaignCardBudget
};
