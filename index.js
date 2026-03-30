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

// --- CONFIG (UPDATE THESE) ---
const GIVEAWAY_CHANNEL_ID = '1487295456387137567';
const EVENT_CHANNEL_ID = '1488192668914941952'; 
const LOG_CHANNEL_ID = '1488193057131069542'; // Logs all bot actions here
const PD_ROLE_ID = '1485259419011780686';             
const SUPPORT_TEAM_ROLE_ID = '1487335311292895262'; 
const HQ_ROLE_ID = '1485259419192135829'; 
const CATEGORY_ID = '1487341154084323338'; 

const giveawayEntries = new Map();
const ticketClaimers = new Map();
const eventCooldowns = new Collection();

// --- KEEP ALIVE ---
const app = express();
app.get('/', (req, res) => res.send('ECPD Online'));
app.listen(10000);

// --- COMMAND REGISTRATION ---
const commands = [
    new SlashCommandBuilder().setName('setup-tickets').setDescription('Setup ticket message'),
    new SlashCommandBuilder().setName('giveaway').setDescription('Start giveaway').addStringOption(o => o.setName('prize').setRequired(true).setDescription('Prize')).addIntegerOption(o => o.setName('duration').setRequired(true).setDescription('Mins')),
    new SlashCommandBuilder().setName('roll').setDescription('Roll winner').addStringOption(o => o.setName('messageid').setRequired(true).setDescription('ID')).addStringOption(o => o.setName('text').setRequired(true).setDescription('Text')),
    new SlashCommandBuilder().setName('event').setDescription('Post Event').addStringOption(o => o.setName('name').setRequired(true).setDescription('Name')).addStringOption(o => o.setName('host').setRequired(true).setDescription('Host')).addStringOption(o => o.setName('cohost').setRequired(true).setDescription('Co-Host')).addStringOption(o => o.setName('helpers').setRequired(true).setDescription('Helpers')).addStringOption(o => o.setName('rewards').setRequired(true).setDescription('Rewards')).addStringOption(o => o.setName('description').setRequired(true).setDescription('Desc'))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ ECPD Online: ${client.user.tag}`);
});

// --- HELPER: LOGGING FUNCTION ---
async function logAction(title, description, color = 0x5865F2) {
    const logChan = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChan) return;
    const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
    logChan.send({ embeds: [embed] });
}

// --- PREFIX COMMANDS (!d) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!d')) return;

    // Format: !d (number) (@User) (Word)
    const args = message.content.split(' ');
    if (args.length < 4) return;

    const amount = parseInt(args[1]);
    const targetUser = message.mentions.users.first();
    const filterWord = args[3].toLowerCase();

    if (isNaN(amount) || !targetUser) return message.reply("Usage: `!d (number) (@User) (Word)`");

    await message.delete(); // Delete the command message

    const messages = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = messages.filter(m => 
        m.author.id === targetUser.id && 
        m.content.toLowerCase().includes(filterWord)
    ).first(amount);

    if (toDelete.length > 0) {
        await message.channel.bulkDelete(toDelete);
        logAction('🗑️ Purge Command Used', `**Admin:** ${message.author}\n**Target:** ${targetUser}\n**Word:** ${filterWord}\n**Count:** ${toDelete.length}`, 0xFFA500);
    }
});

// --- INTERACTION HANDLING ---
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const claimerId = ticketClaimers.get(interaction.channel.id);

        if (interaction.customId === 'open_ticket') {
            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: SUPPORT_TEAM_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                ],
            });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success));
            await channel.send({ content: `<@&${SUPPORT_TEAM_ROLE_ID}>`, embeds: [new EmbedBuilder().setTitle('🎫 New Ticket').setDescription('Wait for Support.').setColor(0x00FF00)], components: [row] });
            logAction('🎫 Ticket Opened', `User: ${interaction.user}\nChannel: ${channel}`, 0x00FF00);
            return interaction.reply({ content: `Ticket: ${channel}`, ephemeral: true });
        }

        if (interaction.customId === 'claim_ticket') {
            ticketClaimers.set(interaction.channel.id, interaction.user.id);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Unclaim').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger)
            );
            logAction('🔒 Ticket Claimed', `User: ${interaction.user}\nChannel: ${interaction.channel.name}`);
            return interaction.update({ content: `✅ Ticket claimed by ${interaction.user}`, components: [row] });
        }

        if (interaction.customId === 'unclaim_ticket') {
            if (interaction.user.id !== claimerId) return interaction.reply({ content: "❌ Only the claimer can unclaim.", ephemeral: true });
            ticketClaimers.delete(interaction.channel.id);
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Success));
            logAction('🔓 Ticket Unclaimed', `User: ${interaction.user}\nChannel: ${interaction.channel.name}`, 0xFFFF00);
            return interaction.update({ content: "⚠️ Ticket is now unclaimed.", components: [row] });
        }

        if (interaction.customId === 'close_ticket') {
            if (interaction.user.id !== claimerId) return interaction.reply({ content: "❌ Only the claimer can close.", ephemeral: true });
            logAction('📁 Ticket Closed', `User: ${interaction.user}\nChannel: ${interaction.channel.name}`, 0xFF0000);
            await interaction.reply("🔒 Closing in 5s...");
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }

        if (interaction.customId === 'enter_g' || interaction.customId === 'leave_g') {
            const entrySet = giveawayEntries.get(interaction.message.id);
            if (!entrySet) return interaction.reply({ content: "❌ Error", ephemeral: true });
            interaction.customId === 'enter_g' ? entrySet.add(interaction.user.id) : entrySet.delete(interaction.user.id);
            return interaction.reply({ content: interaction.customId === 'enter_g' ? "🎉 Entered!" : "👋 Left.", ephemeral: true });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;

    if (commandName === 'event') {
        if (!member.roles.cache.has(HQ_ROLE_ID)) return interaction.reply({ content: "HQ Only", ephemeral: true });
        const now = Date.now();
        if (eventCooldowns.has(user.id) && (now - eventCooldowns.get(user.id) < 30 * 60000)) return interaction.reply({ content: "30m Cooldown!", ephemeral: true });

        const embed = new EmbedBuilder().setTitle('📢 ECPD EVENT').addFields(
            { name: 'Event', value: options.getString('name') },
            { name: 'Host', value: options.getString('host'), inline: true },
            { name: 'Co-Host', value: options.getString('cohost'), inline: true },
            { name: 'Rewards', value: options.getString('rewards') },
            { name: 'Description', value: options.getString('description') }
        ).setColor(0x00AAFF);

        const eventChan = client.channels.cache.get(EVENT_CHANNEL_ID);
        if (eventChan) {
            eventChan.send({ content: `<@&${PD_ROLE_ID}>`, embeds: [embed] });
            eventCooldowns.set(user.id, now);
            logAction('📢 Event Posted', `Host: ${user}\nEvent: ${options.getString('name')}`);
            return interaction.reply({ content: "✅ Event Posted!", ephemeral: true });
        }
    }

    // [GIVEAWAY AND ROLL REMAIN THE SAME]
    if (commandName === 'giveaway') {
        const prize = options.getString('prize');
        let duration = options.getInteger('duration');
        const chan = client.channels.cache.get(GIVEAWAY_CHANNEL_ID);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('enter_g').setLabel('Enter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('leave_g').setLabel('Leave').setStyle(ButtonStyle.Danger));
        const getEmbed = (d) => new EmbedBuilder().setTitle('🎁 GIVEAWAY').setDescription(`**Prize:** ${prize}\n**Mins:** ${d}`).setColor(0x00FF00);
        const msg = await chan.send({ embeds: [getEmbed(duration)], components: [row] });
        giveawayEntries.set(msg.id, new Set());
        interaction.reply({ content: "Started!", ephemeral: true });
        logAction('🎁 Giveaway Started', `Host: ${user}\nPrize: ${prize}`);
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
        logAction('🎲 Giveaway Rolled', `Rolled by: ${user}\nWinner: <@${win}>`);
    }
});

client.login(process.env.TOKEN);