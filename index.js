const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection, PermissionFlagsBits, ChannelType } = require('discord.js');
const express = require('express');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- CONFIG (Update these IDs!) ---
const GIVEAWAY_CHANNEL_ID = '1487295456387137567';
const HQ_ROLE_ID = '1485259419192135829'; 
const SUPPORT_TEAM_ROLE_ID = '1487335311292895262'; // <--- Pings this role
const CATEGORY_ID = '1487341154084323338'; // <--- Tickets go here

const giveawayEntries = new Map(); 
const eventCooldowns = new Collection();

// --- KEEP ALIVE ---
const app = express();
app.get('/', (req, res) => res.send('ECPD Bot Online!'));
app.listen(10000);

// --- COMMANDS ---
const commands = [
    new SlashCommandBuilder().setName('setup-tickets').setDescription('Setup the ticket system message'),
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Start a button giveaway')
        .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Minutes').setRequired(true)),
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a winner')
        .addStringOption(opt => opt.setName('messageid').setDescription('Message ID').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('Extra text').setRequired(true)),
    new SlashCommandBuilder()
        .setName('event')
        .setDescription('Post an ECPD Event')
        .addStringOption(opt => opt.setName('name').setDescription('Event Name').setRequired(true))
        .addStringOption(opt => opt.setName('host').setDescription('Host Name').setRequired(true))
        .addStringOption(opt => opt.setName('cohost').setDescription('Co-Hosts').setRequired(true))
        .addStringOption(opt => opt.setName('helpers').setDescription('Helpers').setRequired(true))
        .addStringOption(opt => opt.setName('rewards').setDescription('Rewards').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ ECPD Online: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    
    // --- BUTTON HANDLING ---
    if (interaction.isButton()) {
        
        // 1. GIVEAWAY BUTTONS
        if (interaction.customId === 'enter_g' || interaction.customId === 'leave_g') {
            const entrySet = giveawayEntries.get(interaction.message.id);
            if (!entrySet) return interaction.reply({ content: "❌ Giveaway data not found.", ephemeral: true });

            if (interaction.customId === 'enter_g') {
                if (entrySet.has(interaction.user.id)) return interaction.reply({ content: "✅ Already in!", ephemeral: true });
                entrySet.add(interaction.user.id);
                return interaction.reply({ content: "🎉 Entered!", ephemeral: true });
            }
            if (interaction.customId === 'leave_g') {
                entrySet.delete(interaction.user.id);
                return interaction.reply({ content: "👋 Left.", ephemeral: true });
            }
        }

        // 2. TICKET OPEN BUTTON
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

            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 Ticket Opened')
                .setDescription(`Hello ${interaction.user}, the **Support Team** will be with you shortly.\n\nClick the button below to close this ticket.`)
                .setColor(0x00FF00);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
            );

            await channel.send({ content: `<@&${SUPPORT_TEAM_ROLE_ID}>`, embeds: [ticketEmbed], components: [row] });
            return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
        }

        // 3. TICKET CLOSE BUTTON
        if (interaction.customId === 'close_ticket') {
            await interaction.reply("🔒 Closing ticket in 5 seconds...");
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;

    // --- SETUP TICKETS COMMAND ---
    if (commandName === 'setup-tickets') {
        const embed = new EmbedBuilder()
            .setTitle('📩 ECPD Support')
            .setDescription('Click the button below to open a ticket and speak with the Support Team.')
            .setColor(0x00AAFF);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
        );
        await interaction.reply({ embeds: [embed], components: [row] });
    }

    // (Giveaway, Roll, and Event code remains the same as previous)
    // [I have kept your Giveaway and Event logic from the previous update here]
    if (commandName === 'giveaway') {
        const prize = options.getString('prize');
        let duration = options.getInteger('duration');
        const giveawayChannel = client.channels.cache.get(GIVEAWAY_CHANNEL_ID);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('enter_g').setLabel('Enter').setStyle(ButtonStyle.Success).setEmoji('🎉'),
            new ButtonBuilder().setCustomId('leave_g').setLabel('Leave').setStyle(ButtonStyle.Danger)
        );
        const getEmbed = (m) => new EmbedBuilder().setTitle('🎁 ECPD GIVEAWAY').setDescription(`**Prize:** ${prize}\n**Time:** ${m}m\n**Host:** ${user}`).setColor(0x00FF00);
        const msg = await giveawayChannel.send({ embeds: [getEmbed(duration)], components: [row] });
        giveawayEntries.set(msg.id, new Set());
        interaction.reply({ content: "✅ Started!", ephemeral: true });
        const timer = setInterval(async () => {
            duration--;
            if (duration <= 0) {
                clearInterval(timer);
                await msg.edit({ embeds: [getEmbed(0).setTitle('🔴 ENDED')], components: [] });
                giveawayChannel.send(`🔔 ${user}, giveaway for **${prize}** ended! Use \`/roll messageid: ${msg.id}\``);
            } else { await msg.edit({ embeds: [getEmbed(duration)] }).catch(() => clearInterval(timer)); }
        }, 60000);
    }

    if (commandName === 'roll') {
        const entrySet = giveawayEntries.get(options.getString('messageid'));
        if (!entrySet || entrySet.size === 0) return interaction.reply({ content: "❌ No entries.", ephemeral: true });
        const winnerId = Array.from(entrySet)[Math.floor(Math.random() * entrySet.size)];
        await interaction.reply(`🎲 **Winner:** <@${winnerId}>\n**Note:** ${options.getString('text')}`);
    }
});

client.login(process.env.TOKEN);