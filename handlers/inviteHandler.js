const { Collection, EmbedBuilder } = require('discord.js');
const { logInviteToSheet } = require('../utils/sheetsHelper');

const invitesCache = new Map();

async function initInviteTracker(client) {
    for (const guild of client.guilds.cache.values()) {
        try {
            const firstInvites = await guild.invites.fetch();
            const codeUsesMap = new Collection();
            firstInvites.forEach((inv) => codeUsesMap.set(inv.code, inv.uses));
            invitesCache.set(guild.id, codeUsesMap);
        } catch (err) {
            console.log(`[INVITE TRACKER] Warning: Bot lacks 'Manage Server' permission in ${guild.name}`);
        }
    }
}

async function handleInviteCreate(invite) {
    try {
        if (!invite.guild) return;
        const guildInvites = invitesCache.get(invite.guild.id) || new Collection();
        guildInvites.set(invite.code, invite.uses || 0);
        invitesCache.set(invite.guild.id, guildInvites);
    } catch (err) {}
}

async function handleInviteDelete(invite) {
    try {
        if (!invite.guild) return;
        const guildInvites = invitesCache.get(invite.guild.id);
        if (guildInvites) {
            guildInvites.delete(invite.code);
        }
    } catch (err) {}
}

async function handleGuildMemberAdd(member) {
    const guild = member.guild;
    const cachedInvites = invitesCache.get(guild.id) || new Collection();

    try {
        const newInvites = await guild.invites.fetch();
        
        const usedInvite = newInvites.find((inv) => {
            const prevUses = cachedInvites.get(inv.code) || 0;
            return inv.uses > prevUses;
        });

        const codeUsesMap = new Collection();
        newInvites.forEach((inv) => codeUsesMap.set(inv.code, inv.uses));
        invitesCache.set(guild.id, codeUsesMap);

        let inviterUser = null;
        let totalUses = 0;

        if (usedInvite && usedInvite.inviter) {
            inviterUser = usedInvite.inviter;
            totalUses = usedInvite.uses;
        }

        const payload = {
            memberId: member.user.id,
            memberTag: member.user.tag,
            inviterId: inviterUser ? inviterUser.id : null,
            inviterTag: inviterUser ? inviterUser.tag : null,
            code: usedInvite ? usedInvite.code : null
        };

        // Simpan ke Google Sheets (Otomatis Update/Overwrite jika Member ID sudah ada)
        await logInviteToSheet(payload);

        // Kirim Log ke Channel Discord
        const logChannelId = process.env.INVITE_LOG_CHANNEL_ID || process.env.WELCOME_CHANNEL_ID;
        if (logChannelId) {
            const logChannel = guild.channels.cache.get(logChannelId);
            if (logChannel) {
                const embed = new EmbedBuilder()
                    .setTitle('📥 New Member Joined')
                    .setColor('#57F287')
                    .setDescription(
                        `👤 **Member**: ${member.user} (\`${member.user.tag}\`)\n` +
                        `📩 **Invited By**: ${inviterUser ? `${inviterUser} (\`${inviterUser.tag}\`)` : '`Unknown / Direct Link / Vanity`'}\n` +
                        `🎟️ **Invite Code**: \`${usedInvite ? usedInvite.code : 'N/A'}\` (${totalUses} uses)`
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    } catch (err) {
        console.error('[INVITE TRACKER ERROR]:', err.message);
    }
}

module.exports = {
    initInviteTracker,
    handleInviteCreate,
    handleInviteDelete,
    handleGuildMemberAdd
};
