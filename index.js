const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('ECPD Precinct System: ONLINE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Keep-alive server listening on port ${PORT}`);
});

require('dotenv').config();
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, 
    ChannelType, PermissionFlagsBits, AttachmentBuilder, REST, Routes, 
    ActivityType, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers
    ] 
});

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// ------------------------------------------------------------------
// CONFIGURATION & DATABASE
// ------------------------------------------------------------------
const OWNER_ID = '944834192838123601'; 
const LEVELS = { NONE: 0, MOD: 1, ADMIN: 2, DEV: 3, OWNER: 4 };

if (!fs.existsSync('./warns.json')) fs.writeFileSync('./warns.json', JSON.stringify({}));
let warns = JSON.parse(fs.readFileSync('./warns.json', 'utf8'));

function saveWarns() {
    fs.writeFileSync('./warns.json', JSON.stringify(warns, null, 2));
}

// ------------------------------------------------------------------
// HELPERS (Multi-Server & Permissions)
// ------------------------------------------------------------------
function getMemberLevel(member) {
    if (member.id === OWNER_ID) return LEVELS.OWNER;
    const roles = member.roles.cache;
    
    const check = (envVar) => process.env[envVar] ? process.env[envVar].split(';').includes(r => roles.has(r)) : false;

    if (roles.some(r => (process.env.DEV_ROLE_ID || "").split(';').includes(r.id))) return LEVELS.DEV;
    if (roles.some(r => (process.env.ADMIN_ROLE_ID || "").split(';').includes(r.id))) return LEVELS.ADMIN;
    if (roles.some(r => (process.env.MOD_ROLE_ID || "").split(';').includes(r.id))) return LEVELS.MOD;
    if (roles.some(r => (process.env.STAFF_ROLE_ID || "").split(';').includes(r.id))) return LEVELS.MOD;
    
    return LEVELS.NONE;
}

function getLocalLogChannel(guild) {
    const logIDs = (process.env.LOG_CHANNEL_ID || "").split(';');
    const found = guild.channels.cache.find(c => logIDs.includes(c.id));
    return found || guild.channels.cache.get(logIDs[0]);
}

function getLocalStaffId(guild) {
    const staffIDs = (process.env.STAFF_ROLE_ID || "").split(';');
    const found = guild.roles.cache.find(r => staffIDs.includes(r.id));
    return found ? found.id : null;
}

// ------------------------------------------------------------------
// BOT STARTUP
// ------------------------------------------------------------------
client.once('ready', async () => {
    client.user.setActivity('over Evergreen City', { type: ActivityType.Watching });
    const commands = [
        { name: 'addtoticket', description: 'Add a user to the ticket', options: [{ name: 'user', type: 6, description: 'User to add', required: true }] },
        { name: 'removefromticket', description: 'Remove a user from the ticket', options: [{ name: 'user', type: 6, description: 'User to remove', required: true }] },
        { name: 'renameticket', description: 'Rename the ticket channel', options: [{ name: 'name', type: 3, description: 'New name', required: true }] },
        { name: 'warn', description: 'Issue a warning', options: [{ name: 'user', type: 6, description: 'The user', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'history', description: 'View warning history', options: [{ name: 'user', type: 6, description: 'The user', required: true }] },
        { name: 'removewarn', description: 'Remove a specific warn', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'index', type: 4, description: 'Warn #', required: true }] },
        { name: 'clearwarns', description: 'Wipe all warns', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'ban', description: 'Ban a user', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] }
    ];
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ ECPD System Online: ${client.user.tag}`);
    } catch (err) { console.error(err); }
});

// ------------------------------------------------------------------
// MAIN INTERACTION HANDLER (Tickets & Moderation)
// ------------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    const userLevel = getMemberLevel(interaction.member);

    // --- SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {
        const target = interaction.options.getUser('user');

        if (interaction.commandName === 'warn') {
            if (userLevel < LEVELS.MOD) return interaction.reply({ content: "❌ Mod+ only.", ephemeral: true });
            const reason = interaction.options.getString('reason');
            if (!warns[target.id]) warns[target.id] = [];
            warns[target.id].push({ staff: interaction.user.tag, reason, date: new Date().toLocaleDateString() });
            saveWarns();
            return interaction.reply({ content: `⚠️ Warned **${target.tag}**. Total: ${warns[target.id].length}` });
        }

        if (interaction.commandName === 'history') {
            if (userLevel < LEVELS.MOD) return interaction.reply({ content: "❌ Mod+ only.", ephemeral: true });
            const userWarns = warns[target.id] || [];
            const embed = new EmbedBuilder().setTitle(`Record: ${target.tag}`).setColor(0x0047AB)
                .setDescription(userWarns.length ? userWarns.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') : "Clean record.");
            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'removewarn') {
            if (userLevel < LEVELS.ADMIN) return interaction.reply({ content: "❌ Admin+ only.", ephemeral: true });
            const idx = interaction.options.getInteger('index') - 1;
            if (!warns[target.id] || !warns[target.id][idx]) return interaction.reply({ content: "❌ Not found.", ephemeral: true });
            warns[target.id].splice(idx, 1);
            saveWarns();
            return interaction.reply({ content: "✅ Deleted." });
        }

        if (interaction.commandName === 'clearwarns') {
            if (userLevel < LEVELS.DEV) return interaction.reply({ content: "❌ Dev+ only.", ephemeral: true });
            warns[target.id] = [];
            saveWarns();
            return interaction.reply({ content: "Sweep complete. Records wiped." });
        }

        if (interaction.commandName === 'ban') {
            if (userLevel < LEVELS.ADMIN) return interaction.reply({ content: "❌ Admin+ only.", ephemeral: true });
            const member = interaction.options.getMember('user');
            if (!member || !member.bannable) return interaction.reply({ content: "❌ Cannot ban.", ephemeral: true });
            await member.ban({ reason: interaction.options.getString('reason') });
            return interaction.reply({ content: `🔨 Banned **${target.tag}**.` });
        }

        // Ticket Management Commands
        if (['addtoticket', 'removefromticket', 'renameticket'].includes(interaction.commandName)) {
            if (userLevel < LEVELS.MOD) return interaction.reply({ content: "❌ Mod+ only.", ephemeral: true });
            if (interaction.commandName === 'renameticket') {
                await interaction.channel.setName(interaction.options.getString('name'));
                return interaction.reply({ content: "✅ Channel renamed." });
            }
            const user = interaction.options.getUser('user');
            const perm = interaction.commandName === 'addtoticket';
            await interaction.channel.permissionOverwrites.edit(user, { ViewChannel: perm, SendMessages: perm });
            return interaction.reply({ content: `✅ User ${perm ? 'added' : 'removed'}.` });
        }
    }

    // --- TICKET SELECTION ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_type') {
        await interaction.deferReply({ ephemeral: true });
        const type = interaction.values[0];
        const localStaffId = getLocalStaffId(interaction.guild);
        const category = interaction.guild.channels.cache.find(c => c.name.toLowerCase() === "tickets" && c.type === ChannelType.GuildCategory);

        const ticketChannel = await interaction.guild.channels.create({
            name: `${type}-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: category ? category.id : null,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: localStaffId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ],
        });

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('ECPD Support')
            .setDescription(`The team will assist you shortly.`)
            .addFields({ name: 'Status', value: '⚪ Unclaimed', inline: true }, { name: 'OpenerID', value: interaction.user.id, inline: true })
            .setColor(0x0047AB);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('close_request').setLabel('Close').setStyle(ButtonStyle.Secondary)
        );

        await ticketChannel.send({ content: `<@&${localStaffId}>`, embeds: [welcomeEmbed], components: [row] });
        return interaction.editReply({ content: `Ticket opened: ${ticketChannel}` });
    }

    // --- BUTTONS ---
    if (interaction.isButton()) {
        const embed = interaction.message.embeds[0];
        if (!embed) return;
        const claimerID = embed.fields.find(f => f.name === 'ClaimerID')?.value;

        if (interaction.customId === 'claim_ticket') {
            if (userLevel < LEVELS.MOD) return interaction.reply({ content: "❌ Staff only.", ephemeral: true });
            const newEmbed = EmbedBuilder.from(embed).addFields({ name: 'ClaimerID', value: interaction.user.id, inline: true });
            newEmbed.spliceFields(0, 1, { name: 'Status', value: `🟢 Claimed by ${interaction.user.username}`, inline: true });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('close_request').setLabel('Close').setStyle(ButtonStyle.Danger)
            );
            return interaction.update({ embeds: [newEmbed], components: [row] });
        }

        if (interaction.customId === 'close_request') {
            if (claimerID !== interaction.user.id && userLevel < LEVELS.ADMIN) return interaction.reply({ content: "❌ Only the claimer or Admin can close.", ephemeral: true });
            const modal = new ModalBuilder().setCustomId('close_modal').setTitle('Close Ticket');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(true)));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'delete_ticket') {
            if (userLevel < LEVELS.MOD) return interaction.reply({ content: "❌ Staff only.", ephemeral: true });
            await interaction.reply("Archiving and deleting...");
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const log = messages.reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
            const logChannel = getLocalLogChannel(interaction.guild);
            if (logChannel) await logChannel.send({ content: `📑 Transcript: ${interaction.channel.name}`, files: [new AttachmentBuilder(Buffer.from(log), { name: `transcript.txt` })] });
            return setTimeout(() => interaction.channel.delete(), 2000);
        }
    }

    // --- MODAL SUBMISSION (Ticket Closing) ---
    if (interaction.isModalSubmit() && interaction.customId === 'close_modal') {
        const reason = interaction.fields.getTextInputValue('reason');
        const openerID = interaction.message.embeds[0].fields.find(f => f.name === 'OpenerID').value;
        await interaction.reply({ content: "Ticket processed." });
        
        try {
            const user = await client.users.fetch(openerID);
            await user.send(`✅ **Ticket Closed:** ${reason}`);
        } catch (e) {}

        await interaction.channel.permissionOverwrites.delete(openerID).catch(() => {});
        const archiveEmbed = new EmbedBuilder().setTitle('Ticket Archived').setDescription(`**Reason:** ${reason}`).setColor(0xFEE75C);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('delete_ticket').setLabel('Delete & Log').setStyle(ButtonStyle.Danger));
        return interaction.channel.send({ embeds: [archiveEmbed], components: [row] });
    }
});

// ------------------------------------------------------------------
// GLOBAL COMMANDS (Message Based)
// ------------------------------------------------------------------
client.on('messageCreate', async (m) => {
    if (m.author.bot) return;
    if (m.content === '!shutdown' && m.author.id === OWNER_ID) {
        await m.reply("🛑 System offline.");
        process.exit();
    }
    if (m.content === '!setup' && m.member.permissions.has(PermissionFlagsBits.Administrator)) {
        const embed = new EmbedBuilder().setTitle('ECPD Support').setDescription('Select below.').setColor(0x0047AB);
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_ticket_type').setPlaceholder('Choose...').addOptions([{ label: 'General', value: 'general', emoji: '❓' }, { label: 'IA', value: 'ia_report', emoji: '⚖️' }, { label: 'Appeals', value: 'appeal', emoji: '📝' }]));
        await m.channel.send({ embeds: [embed], components: [row] });
    }
});

client.login(process.env.TOKEN);