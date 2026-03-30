const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, PermissionFlagsBits, ChannelType } = require('discord.js');
const express = require('express');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// --- CONFIG (PASTE YOUR ACTUAL IDS HERE) ---
const CONFIG = {
    GIVEAWAY_CHAN: '1487295456387137567',
    EVENT_CHAN: '1488192668914941952',
    LOG_CHAN: '1488193057131069542',
    PD_ROLE: '1485259419011780686',
    SUPPORT_ROLE: '1487335311292895262', // ONLY THIS ROLE WILL BE PINGED
    HQ_ROLE: '1485259419192135829',
    CATEGORY: '1487341154084323338'
};

const giveawayEntries = new Map();
const ticketClaimers = new Map();
const eventCooldowns = new Collection();

// --- KEEP ALIVE ---
const app = express();
app.get('/', (req, res) => res.send('ECPD Online'));
app.listen(10000);

// --- LOGGING HELPER ---
async function logAction(title, description, color = 0x5865F2) {
    const logChan = client.channels.cache.get(CONFIG.LOG_CHAN);
    if (!logChan) return;
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    logChan.send({ embeds: [embed] });
}

// --- MESSAGE LOGS (DELETE/EDIT) ---
client.on('messageDelete', async (message) => {
    if (message.author?.bot || !message.content) return;
    logAction('🗑️ Message Deleted', `**Author:** ${message.author}\n**Channel:** ${message.channel}\n**Content:** ${message.content}`, 0xFF0000);
});

client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
    logAction('📝 Message Edited', `**Author:** ${oldMsg.author}\n**Channel:** ${oldMsg.channel}\n**Before:** ${oldMsg.content}\n**After:** ${newMsg.content}`, 0xFFFF00);
});

// --- COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('setup-tickets').setDescription('Setup ticket message'),
    new SlashCommandBuilder().setName('giveaway').setDescription('Start giveaway').addStringOption(o => o.setName('prize').setRequired(true).setDescription('Prize')).addIntegerOption(o => o.setName('duration').setRequired(true).setDescription('Mins')),
    new SlashCommandBuilder().setName('roll').setDescription('Roll winner').addStringOption(o => o.setName('messageid').setRequired(true).setDescription('ID')).addStringOption(o => o.setName('text').setRequired(true).setDescription('Text')),
    new SlashCommandBuilder().setName('event').setDescription('Post Event').addStringOption(o => o.setName('name').setRequired(true)).addStringOption(o => o.setName('host').setRequired(true)).addStringOption(o => o.setName('cohost').setRequired(true)).addStringOption(o => o.setName('helpers').setRequired(true)).addStringOption(o => o.setName('rewards').setRequired(true)).addStringOption(o => o.setName('description').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ ECPD Online: ${client.user.tag}`);
});

// --- PREFIX COMMANDS (!d) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!d')) return;
    const args = message.content.split(' ');
    if (args.length < 4) return;
    const amount = parseInt(args[1]);
    const targetUser = message.mentions.users.first();
    const filterWord = args[3].toLowerCase();
    if (isNaN(amount) || !targetUser) return;

    const messages = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = messages.filter(m => m.author.id === targetUser.id && m.content.toLowerCase().includes(filterWord)).first(amount);
    if (toDelete.length > 0) {
        await message.channel.bulkDelete(toDelete);
        logAction('🗑️ Purge Used', `Admin: ${message.author}\nTarget: ${targetUser}\nWord: ${filterWord}`, 0xFFA500);
    }
});

// --- INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const claimerId = ticketClaimers.get(interaction.channel.id);

        if (interaction.customId === 'open_ticket') {
            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: CONFIG.CATEGORY,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: CONFIG.SUPPORT_ROLE, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                ],
            });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success));
            const embed = new EmbedBuilder()
                .setTitle('🎫 ECPD Support Ticket')
                .setDescription(`Hello ${interaction.user}, the **Support Team** will be with you shortly.\n\n⚠️ **Lying to our Support Team WILL result in punishment.**`)
                .setColor(0x00FF00);
            
            await channel.send({ content: `<@&${CONFIG.SUPPORT_ROLE}>`, embeds: [embed], components: [row] });
            return interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
        }

        if (interaction.customId === 'claim_ticket') {
            ticketClaimers.set(interaction.channel.id, interaction.user.id);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
            );
            return interaction.update({ content: `✅ Ticket claimed by ${interaction.user}`, components: [row] });
        }

        if (interaction.customId === 'unclaim_ticket') {
            if (interaction.user.id !== claimerId) return interaction.reply({ content: "❌ You didn't claim this.", ephemeral: true });
            ticketClaimers.delete(interaction.channel.id);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success));
            return interaction.update({ content: "⚠️ Ticket unclaimed.", components: [row] });
        }

        if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== claimerId) return interaction.reply({ content: "❌ You didn't claim this.", ephemeral: true });
            await interaction.reply("🔒 Closing in 5s...");
            logAction('📁 Ticket Closed', `By: ${interaction.user}\nChannel: ${interaction.channel.name}`, 0xFF0000);
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }

        if (interaction.customId === 'enter_g' || interaction.customId === 'leave_g') {
            const entrySet = giveawayEntries.get(interaction.message.id);
            if (!entrySet) return interaction.reply({ content: "❌ Data lost.", ephemeral: true });
            interaction.customId === 'enter_g' ? entrySet.add(interaction.user.id) : entrySet.delete(interaction.user.id);
            return interaction.reply({ content: interaction.customId === 'enter_g' ? "🎉 Entered!" : "👋 Left.", ephemeral: true });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;

    if (commandName === 'event') {
        if (!member.roles.cache.has(CONFIG.HQ_ROLE)) return interaction.reply({ content: "HQ Only", ephemeral: true });
        const now = Date.now();
        if (eventCooldowns.has(user.id) && (now - eventCooldowns.get(user.id) < 30 * 60000)) return interaction.reply({ content: "30m Cooldown!", ephemeral: true });

        const embed = new EmbedBuilder().setTitle('📢 ECPD EVENT').addFields(
            { name: 'Event', value: options.getString('name') },
            { name: 'Host', value: options.getString('host'), inline: true },
            { name: 'Co-Host', value: options.getString('cohost'), inline: true },
            { name: 'Helpers', value: options.getString('helpers'), inline: true },
            { name: 'Rewards', value: options.getString('rewards') },
            { name: 'Description', value: options.getString('description') }
        ).setColor(0x00AAFF);

        const eventChan = client.channels.cache.get(CONFIG.EVENT_CHAN);
        if (eventChan) {
            eventChan.send({ content: `<@&${CONFIG.PD_ROLE}>`, embeds: [embed] });
            eventCooldowns.set(user.id, now);
            logAction('📢 Event Posted', `By: ${user}`);
            return interaction.reply({ content: "✅ Posted!", ephemeral: true });
        }
    }

    if (commandName === 'giveaway') {
        const prize = options.getString('prize');
        let duration = options.getInteger('duration');
        const chan = client.channels.cache.get(CONFIG.GIVEAWAY_CHAN);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('enter_g').setLabel('Enter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('leave_g').setLabel('Leave').setStyle(ButtonStyle.Danger));
        const getEmbed = (d) => new EmbedBuilder().setTitle('🎁 GIVEAWAY').setDescription(`**Prize:** ${prize}\n**Mins:** ${d}`).setColor(0x00FF00);
        const msg = await chan.send({ embeds: [getEmbed(duration)], components: [row] });
        giveawayEntries.set(msg.id, new Set());
        interaction.reply({ content: "Started!", ephemeral: true });
        const t = setInterval(async () => {
            duration--;
            if (duration <= 0) { clearInterval(t); await msg.edit({ embeds: [getEmbed(0).setTitle('🔴 ENDED')], components: [] }); }
            else { await msg.edit({ embeds: [getEmbed(duration)] }).catch(() => clearInterval(t)); }
        }, 60000);
    }

    if (commandName === 'roll') {
        const set = giveawayEntries.get(options.getString('messageid'));
        if (!set || set.size === 0) return interaction.reply("No entries.");
        const win = Array.from(set)[Math.floor(Math.random() * set.size)];
        interaction.reply(`🎲 **Winner:** <@${win}>\n${options.getString('text')}`);
    }

    if (commandName === 'setup-tickets') {
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary));
        interaction.reply({ embeds: [new EmbedBuilder().setTitle('Support').setDescription('Click to open.')], components: [row] });
    }
});

client.login(process.env.TOKEN);