const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits, 
    MessageFlags 
} = require('discord.js');

async function handleTicketCreate(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'btn_open_ticket') return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const userId = interaction.user.id;

    // 1. Strict check: User cannot open more than 1 active ticket
    const existingTicket = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && 
        c.topic === `Ticket-Owner:${userId}`
    );

    if (existingTicket) {
        return interaction.editReply({ 
            content: `⚠️ **Access Denied!** You already have an active ticket in ${existingTicket}. Please resolve your issue there before opening a new ticket!` 
        });
    }

    try {
        // 2. Category Handling (Find or create 'TICKETS' category)
        let categoryId = process.env.TICKET_CATEGORY_ID;
        let category = categoryId ? guild.channels.cache.get(categoryId) : null;

        if (!category) {
            category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toUpperCase() === 'TICKETS');
        }

        if (!category) {
            category = await guild.channels.create({
                name: 'TICKETS',
                type: ChannelType.GuildCategory
            });
        }

        const ticketChannelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

        // 3. Permission Overwrites Configuration
        const permissionOverwrites = [
            {
                id: guild.id, // @everyone
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: userId, // Ticket Owner
                allow: [
                    PermissionFlagsBits.ViewChannel, 
                    PermissionFlagsBits.SendMessages, 
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: interaction.client.user.id, // Bot Self Access
                allow: [
                    PermissionFlagsBits.ViewChannel, 
                    PermissionFlagsBits.SendMessages, 
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ];

        const adminRole = guild.roles.cache.find(r => 
            r.id !== guild.id && (r.permissions.has(PermissionFlagsBits.Administrator) || r.permissions.has(PermissionFlagsBits.ManageMessages))
        );

        if (adminRole) {
            permissionOverwrites.push({
                id: adminRole.id,
                allow: [
                    PermissionFlagsBits.ViewChannel, 
                    PermissionFlagsBits.SendMessages, 
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            });
        }

        // 4. Create Private Channel Under Category
        const ticketChannel = await guild.channels.create({
            name: ticketChannelName,
            type: ChannelType.GuildText,
            parent: category ? category.id : undefined,
            topic: `Ticket-Owner:${userId}`,
            permissionOverwrites
        });

        // 5. Send Welcome Message & Close Button
        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`📩 Support Ticket — ${interaction.user.tag}`)
            .setDescription(`Hello ${interaction.user}, welcome to your private support channel.\n\nPlease state your question or issue below. Staff will respond shortly. Once your issue is resolved, click the **Close Ticket** button below.`)
            .setColor('#5865F2')
            .setTimestamp();

        const closeBtn = new ButtonBuilder()
            .setCustomId('btn_close_ticket')
            .setLabel('🔒 Close Ticket')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(closeBtn);

        await ticketChannel.send({ content: `${interaction.user} | Staff Notification`, embeds: [welcomeEmbed], components: [row] });

        return await interaction.editReply({ content: `✅ Ticket successfully created in ${ticketChannel}!` });
    } catch (err) {
        console.error('[TICKET ERROR DETAILS]:', err);
        return await interaction.editReply({ content: '⚠️ Failed to create ticket channel. Please check bot permissions on the server.' });
    }
}

async function handleTicketClose(interaction) {
    if (!interaction.isButton() || interaction.customId !== 'btn_close_ticket') return;

    try {
        await interaction.reply({ content: '🔒 Closing and deleting this ticket channel in 5 seconds...' });

        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (e) {
                console.error('[TICKET CLOSE ERROR]:', e.message);
            }
        }, 5000);
    } catch (err) {
        console.error('[TICKET REPLY ERROR]:', err.message);
    }
}

module.exports = {
    handleTicketCreate,
    handleTicketClose
};
