const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function getAdminPanelEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('⚙️ Rune ft - Campaign Management Dashboard')
        .setDescription(
            'Welcome to the Campaign Control Center!\nUse the buttons below to create, edit, or close clipping campaigns directly.'
        )
        .setColor('#5865F2')
        .setFooter({ text: 'Rune ft Admin System' })
        .setTimestamp();

    const addBtn = new ButtonBuilder()
        .setCustomId('admin_add_campaign_btn')
        .setLabel('➕ Add Campaign')
        .setStyle(ButtonStyle.Success);

    const editBtn = new ButtonBuilder()
        .setCustomId('admin_edit_campaign_btn')
        .setLabel('✏️ Edit Campaign')
        .setStyle(ButtonStyle.Primary);

    const closeBtn = new ButtonBuilder()
        .setCustomId('admin_close_campaign_btn')
        .setLabel('⛔ Close Campaign')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(addBtn, editBtn, closeBtn);

    return { embeds: [embed], components: [row] };
}

function getSubmitPanelEmbed() {
    const embed = new EmbedBuilder()
        .setTitle('🎬 Submit Your Clip Campaign')
        .setDescription(
            'Ready to submit your video clip?\n\n' +
            '**Requirements before submitting:**\n' +
            '1. Make sure your TikTok account is connected to your Discord Profile.\n' +
            '2. Prepare your analytics screenshot link (Imgur/Discord).\n' +
            '3. Have your payment details ready (Crypto/E-Wallet/PayPal).\n\n' +
            'Click the button below to open the submission form!'
        )
        .setColor('#57F287');

    const submitBtn = new ButtonBuilder()
        .setCustomId('open_submit_modal')
        .setLabel('📤 Submit Video Clip')
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(submitBtn);

    return { embeds: [embed], components: [row] };
}

module.exports = { getAdminPanelEmbed, getSubmitPanelEmbed };
