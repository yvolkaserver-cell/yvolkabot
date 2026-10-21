require('dotenv').config({ path: __dirname + '/.env' });
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require('discord.js');

// Handlers & Helpers
const { handleGuildMemberAddWelcome } = require('./handlers/welcomeHandler');
const { handleMessageCommands } = require('./handlers/commandHandler');
const { handleAdminPanelInteractions } = require('./handlers/adminHandler');
const { createProgressBar } = require('./utils/progressBar');
const { createCampaignSpreadsheet, parseTargetViews } = require('./utils/sheetsHelper');
const { handleDashboardInteraction, getProfileModal, handleProfileModalSubmit, getUserProfile } = require('./handlers/profileHandler');
const { handleTicketCreate, handleTicketClose } = require('./handlers/ticketHandler');
const { 
    getSubmitModal, 
    handleClipperModalSubmit, 
    handleAdminApprovalInteraction, 
    handleModalProofAndRejectSubmit
} = require('./handlers/submitHandler');
const {
    initInviteTracker,
    handleInviteCreate,
    handleInviteDelete,
    handleGuildMemberAdd
} = require('./handlers/inviteHandler');
const { startViewsTracker } = require('./handlers/viewsTracker');

// Deklarasi Client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites
    ]
});

client.once('ready', async () => {
    console.log(`✅ Bot successfully logged in as ${client.user.tag}`);
    await initInviteTracker(client);
    startViewsTracker(client);
});

client.on('guildMemberAdd', async (member) => {
    await handleGuildMemberAddWelcome(member);
    await handleGuildMemberAdd(member);
});

client.on('inviteCreate', handleInviteCreate);
client.on('inviteDelete', handleInviteDelete);

// EVENT LISTENER PREFIX COMMANDS (!setup-admin, !setup-start, !setup-ticket)
client.on('messageCreate', async (message) => {
    await handleMessageCommands(message, client);
});

// EVENT LISTENER UTAMA UNTUK INTERAKSI DISCORD
client.on('interactionCreate', async (interaction) => {
    const id = interaction.customId;

    try {
        // 1. ROUTING INTERAKSI TOMBOL (BUTTONS)
        if (interaction.isButton()) {
            console.log(`[BUTTON CLICKED] Custom ID: ${id} \vert{} User:${interaction.user.tag}`);

            if (id === 'btn_open_profile_setup') {
                const profile = getUserProfile(interaction.user.id) || {};
                return await interaction.showModal(getProfileModal(profile));
            }

            if (id === 'btn_open_my_dashboard' || id === 'my_dashboard_btn' || id.includes('dashboard')) {
                return await handleDashboardInteraction(interaction);
            }

            if (id === 'btn_open_ticket' && typeof handleTicketCreate === 'function') {
                return await handleTicketCreate(interaction);
            }
            if (id === 'btn_close_ticket' && typeof handleTicketClose === 'function') {
                return await handleTicketClose(interaction);
            }

            if (id.startsWith('submit_clip_btn_')) {
                const tabName = id.replace('submit_clip_btn_', '') || 'Sheet1';
                const campaignTitle = interaction.message?.embeds[0]?.title?.replace('📌 ', '') || 'Campaign';
                if (typeof getSubmitModal === 'function') {
                    return await interaction.showModal(getSubmitModal(campaignTitle, tabName));
                }
            }

            if ((id.startsWith('approve_sub_') || id.startsWith('reject_sub_')) && typeof handleAdminApprovalInteraction === 'function') {
                return await handleAdminApprovalInteraction(interaction);
            }

            if (id.startsWith('admin_') && typeof handleAdminPanelInteractions === 'function') {
                return await handleAdminPanelInteractions(interaction);
            }
        }

        // 2. ROUTING INTERAKSI SELECT MENU
        if (interaction.isStringSelectMenu()) {
            if (id.startsWith('admin_') && typeof handleAdminPanelInteractions === 'function') {
                return await handleAdminPanelInteractions(interaction);
            }
        }

        // 3. ROUTING INTERAKSI FORM (MODAL SUBMIT)
        if (interaction.isModalSubmit()) {
            if (id === 'modal_clipper_profile') {
                return await handleProfileModalSubmit(interaction);
            }

            if (id === 'modal_add_campaign') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const title = interaction.fields.getTextInputValue('camp_title');
                const targetViewsRaw = interaction.fields.getTextInputValue('camp_target_views');
                const payRate = interaction.fields.getTextInputValue('camp_budget');
                const imageUrl = interaction.fields.getTextInputValue('camp_image');
                const req = interaction.fields.getTextInputValue('camp_req');

                const activeChannel = interaction.guild.channels.cache.get(process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID);
                if (!activeChannel) return await interaction.editReply({ content: '⚠️ Active campaigns channel not found!' });

                let sheetData = { spreadsheetId: '', spreadsheetUrl: '', tabName: '' };
                try {
                    sheetData = await createCampaignSpreadsheet(title, targetViewsRaw, payRate);
                } catch (err) {
                    console.error('[CAMPAIGN CREATION ERROR]:', err);
                    return await interaction.editReply({ content: `⚠️ Failed to create Google Sheet tab: \`${err.message}\`` });
                }

                if (!sheetData || !sheetData.spreadsheetUrl) {
                    return await interaction.editReply({ content: `⚠️ Failed to create Google Sheet tab! Check Google Sheet configuration and Service Account permissions.` });
                }

                const defaultImage = 'https://cdn-icons-png.flaticon.com/512/3874/3874058.png';
                const finalImage = imageUrl.trim().startsWith('http') ? imageUrl.trim() : defaultImage;
                const numericTarget = parseTargetViews(targetViewsRaw);

                const progressBarText = createProgressBar(0, numericTarget);

                const campaignEmbed = new EmbedBuilder()
                    .setTitle(`📌 ${title}`)
                    .setColor('#5865F2')
                    .setThumbnail(finalImage)
                    .addFields(
                        { name: '🎯 Target Views', value: `\`\`${numericTarget.toLocaleString()} Views\`\``, inline: true },
                        { name: '💵 Pay Rate', value: `\`\`$${payRate}\`\``, inline: true },
                        { name: '💳 Payment Methods', value: '• Crypto (USDT)\n• Local E-Wallet', inline: true },
                        { name: '📋 Requirements & Assets', value: req, inline: false },
                        { name: '🎯 Target Status', value: progressBarText, inline: false }
                    )
                    .setFooter({ text: `Posted by Admin: ${interaction.user.tag}` })
                    .setTimestamp();

                const submitBtn = new ButtonBuilder()
                    .setCustomId(`submit_clip_btn_${sheetData.tabName}`)
                    .setLabel('📥 Submit Clip')
                    .setStyle(ButtonStyle.Success);

                const dashboardBtn = new ButtonBuilder()
                    .setCustomId('btn_open_my_dashboard')
                    .setLabel('📊 My Dashboard')
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder().addComponents(submitBtn, dashboardBtn);
                await activeChannel.send({ embeds: [campaignEmbed], components: [row] });

                const sheetInfoMsg = sheetData.spreadsheetUrl ? `\n📊 **Google Sheet (Admin Only):** [Open Sheet](${sheetData.spreadsheetUrl})` : '';
                return await interaction.editReply({ content: `✅ Campaign **${title}** published with Target Views: **${numericTarget.toLocaleString()}**!${sheetInfoMsg}` });
            }

            if (id.startsWith('modal_clipper_submit_') && typeof handleClipperModalSubmit === 'function') {
                return await handleClipperModalSubmit(interaction);
            }

            if (id.startsWith('modal_reject_reason_') && typeof handleModalProofAndRejectSubmit === 'function') {
                return await handleModalProofAndRejectSubmit(interaction);
            }
        }
    } catch (error) {
        console.error('[INTERACTION ERROR]:', error);
        const errorMsg = '⚠️ An error occurred while processing this interaction.';
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMsg }).catch(() => {});
        } else if (!interaction.replied) {
            await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN);
