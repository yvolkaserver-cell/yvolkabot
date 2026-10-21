const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { syncMemberToSheet, rewardInviterForVerification, getMemberProfileFromSheet } = require('../utils/sheetsHelper');

const USERS_FILE = path.join(__dirname, '../data/users.json');

// Membaca data pengguna dari penyimpanan lokal
function getUsersData() {
    if (!fs.existsSync(USERS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

// Menyimpan data pengguna ke file lokal
function saveUsersData(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Membuat form modal untuk Set / Edit Profile
function getProfileModal(existingProfile = {}) {
    const modal = new ModalBuilder()
        .setCustomId('modal_clipper_profile')
        .setTitle('👤 Set / Edit Clipper Profile');

    const accountsInput = new TextInputBuilder()
        .setCustomId('prof_accounts')
        .setLabel('TikTok / IG Username (Max 3, comma separated)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('@user1, @user2, @user3')
        .setValue(existingProfile.accounts ? (Array.isArray(existingProfile.accounts) ? existingProfile.accounts.join(', ') : existingProfile.accounts) : '')
        .setRequired(true);

    const paymentInput = new TextInputBuilder()
        .setCustomId('prof_payment')
        .setLabel('Payment Details (E-Wallet / Bank / Crypto)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('DANA 0812345678 / BCA 12345 / USDT TRC20...')
        .setValue(existingProfile.paymentDetails || '')
        .setRequired(true);

    modal.addComponents(
        new ActionRowBuilder().addComponents(accountsInput),
        new ActionRowBuilder().addComponents(paymentInput)
    );

    return modal;
}

// Memproses Submit Modal Profile
async function handleProfileModalSubmit(interaction) {
    if (!interaction.isModalSubmit() || interaction.customId !== 'modal_clipper_profile') return;

    // WAJIB: Defer reply langsung di awal agar tidak timeout 3 detik
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
        const rawAccounts = interaction.fields.getTextInputValue('prof_accounts');
        const paymentDetails = interaction.fields.getTextInputValue('prof_payment');

        const accountsArray = rawAccounts.split(',')
            .map(a => a.trim())
            .filter(a => a.length > 0)
            .slice(0, 3);

        if (accountsArray.length === 0) {
            return await interaction.editReply({ content: '⚠️ Please enter at least 1 valid TikTok / IG username.' });
        }

        const users = getUsersData();
        users[interaction.user.id] = {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            accounts: accountsArray,
            paymentDetails,
            updatedAt: new Date().toISOString()
        };

        saveUsersData(users);

        // 1. Sync data member ke Google Sheets tab 'Members'
        try {
            await syncMemberToSheet(users[interaction.user.id]);
        } catch (e) {
            console.error('[PROFILE SYNC ERROR]:', e.message);
        }

        // 2. AUTO ASSIGN ROLE CAMPAIGN / VERIFIED ROLE (AMBIL MEMBER DENGAN AKURAT)
        let roleAssigned = false;
        try {
            const roleId = process.env.CAMPAIGN_ROLE_ID || process.env.VERIFIED_ROLE_ID;
            
            if (roleId && interaction.guild) {
                // Fetch member langsung dari server agar tidak undefined/null
                const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

                if (member) {
                    await member.roles.add(roleId);
                    roleAssigned = true;
                    console.log(`[ROLE SUCCESS] Assigned Role ${roleId} to${interaction.user.tag}`);
                } else {
                    console.error(`[ROLE ERROR] Could not fetch member object for ${interaction.user.id}`);
                }
            } else {
                console.warn('[ROLE WARN] CAMPAIGN_ROLE_ID or VERIFIED_ROLE_ID not set in .env');
            }
        } catch (roleErr) {
            console.error('[ROLE ASSIGN ERROR]:', roleErr.message);
        }

        // 3. Pemicu Reward $0.10 ke Inviter jika Lolos Filter Anti-Exploit
        try {
            if (typeof rewardInviterForVerification === 'function') {
                const memberObj = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                await rewardInviterForVerification(memberObj, users[interaction.user.id]);
            }
        } catch (invErr) {
            console.error('[REWARD INVITE ERROR]:', invErr.message);
        }

        const roleMsg = roleAssigned ? `\n🎉 *You have been granted access & creator role!*` : ``;

        return await interaction.editReply({
            content: `✅ **Profile Successfully Saved!**\n\n📌 **Registered Accounts (Max 3):** ${accountsArray.join(', ')}\n💳 **Payment Method:** \`${paymentDetails}\`${roleMsg}`
        });

    } catch (err) {
        console.error('[PROFILE MODAL SUBMIT ERROR]:', err);
        return await interaction.editReply({ content: `⚠️ Error saving profile: \`${err.message}\`` }).catch(() => {});
    }
}

// Mengambil profile user dari data lokal
function getUserProfile(userId) {
    const users = getUsersData();
    return users[userId] || null;
}

// Menangani Klik Tombol My Dashboard
async function handleDashboardInteraction(interaction) {
    if (!interaction.isButton()) return;

    const btnId = interaction.customId;
    if (btnId !== 'btn_open_my_dashboard' && btnId !== 'my_dashboard_btn' && !btnId.includes('dashboard')) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
        console.log(`[DASHBOARD DEBUG] Fetching profile for User ID: ${interaction.user.id}`);

        const localUser = getUserProfile(interaction.user.id);
        let sheetProfile = null;

        try {
            sheetProfile = await getMemberProfileFromSheet(interaction.user.id);
            console.log(`[DASHBOARD DEBUG] Sheet Profile Result:`, sheetProfile);
        } catch (e) {
            console.error('[DASHBOARD SHEET FETCH ERROR]:', e.message);
        }

        const accountsDisplay = sheetProfile?.accounts || (localUser?.accounts ? (Array.isArray(localUser.accounts) ? localUser.accounts.join(', ') : localUser.accounts) : 'Not Set');
        const paymentDisplay = sheetProfile?.paymentDetails || localUser?.paymentDetails || 'Not Set';
        const totalSubmits = sheetProfile?.totalSubmits || 0;
        const totalViews = sheetProfile?.totalViews || 0;
        const totalEarnings = sheetProfile?.totalEarnings || 0;

        const dashboardEmbed = new EmbedBuilder()
            .setTitle(`📊 DASHBOARD — ${interaction.user.username}`)
            .setColor('#5865F2')
            .setThumbnail(interaction.user.displayAvatarURL())
            .setDescription(
                `👤 **USER PROFILE**\n` +
                `• **Discord Tag**: \`${interaction.user.tag}\`\n` +
                `• **Registered Accounts**: \`${accountsDisplay}\`\n` +
                `• **Payment Details**: \`${paymentDisplay}\`\n\n` +
                `📈 **CAMPAIGN STATS**\n` +
                `• **Total Submissions**: \`${totalSubmits}\` Clips\n` +
                `• **Total Approved Views**: \`${totalViews.toLocaleString()}\` Views\n` +
                `• **Estimated Earnings**: \`$${totalEarnings.toFixed(2)}\` USD`
            )
            .setFooter({ text: `Rune Viral Clipper System` })
            .setTimestamp();

        return await interaction.editReply({ embeds: [dashboardEmbed] });

    } catch (err) {
        console.error('[DASHBOARD HANDLER ERROR]:', err);
        return await interaction.editReply({
            content: `⚠️ Failed to load Dashboard: \`${err.message}\``
        }).catch(() => {});
    }
}

module.exports = {
    getProfileModal,
    handleProfileModalSubmit,
    getUserProfile,
    handleDashboardInteraction
};
