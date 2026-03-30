const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');
const express = require('express');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- CONFIG ---
const GIVEAWAY_CHANNEL_ID = '1487295456387137567';
const HQ_ROLE_ID = '1485259419192135829'; // <--- Update this!

// Store entries: { messageId: Set(userIds) }
const giveawayEntries = new Map(); 
const eventCooldowns = new Collection();

// --- KEEP ALIVE ---
const app = express();
app.get('/', (req, res) => res.send('ECPD Bot Online!'));
app.listen(10000);

// --- COMMANDS ---
const commands = [
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Start a button giveaway')
        .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Minutes').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll a winner for a specific giveaway')
        .addStringOption(opt => opt.setName('messageid').setDescription('The Message ID of the giveaway').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('Extra text to include').setRequired(true)),

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
    // 1. BUTTON HANDLING (Enter/Leave)
    if (interaction.isButton()) {
        const entrySet = giveawayEntries.get(interaction.message.id);
        if (!entrySet) return interaction.reply({ content: "❌ Giveaway data not found.", ephemeral: true });

        if (interaction.customId === 'enter_g') {
            if (entrySet.has(interaction.user.id)) return interaction.reply({ content: "✅ You are already in this giveaway!", ephemeral: true });
            entrySet.add(interaction.user.id);
            return interaction.reply({ content: "🎉 You have entered the giveaway!", ephemeral: true });
        }

        if (interaction.customId === 'leave_g') {
            if (!entrySet.has(interaction.user.id)) return interaction.reply({ content: "❌ You weren't in this giveaway.", ephemeral: true });
            entrySet.delete(interaction.user.id);
            return interaction.reply({ content: "👋 You have left the giveaway.", ephemeral: true });
        }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user, member } = interaction;

    // 2. GIVEAWAY COMMAND
    if (commandName === 'giveaway') {
        const prize = options.getString('prize');
        let duration = options.getInteger('duration');
        const endTime = Date.now() + (duration * 60000);
        const giveawayChannel = client.channels.cache.get(GIVEAWAY_CHANNEL_ID);

        if (!giveawayChannel) return interaction.reply({ content: "❌ Giveaway channel not found!", ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('enter_g').setLabel('Enter').setStyle(ButtonStyle.Success).setEmoji('🎉'),
            new ButtonBuilder().setCustomId('leave_g').setLabel('Leave').setStyle(ButtonStyle.Danger)
        );

        const getEmbed = (minsLeft) => new EmbedBuilder()
            .setTitle('🎁 ECPD GIVEAWAY')
            .setDescription(`**Prize:** ${prize}\n**Time Remaining:** ${minsLeft} minutes\n**Hosted by:** ${user}`)
            .setColor(0x00FF00).setTimestamp();

        const msg = await giveawayChannel.send({ embeds: [getEmbed(duration)], components: [row] });
        giveawayEntries.set(msg.id, new Set());
        await interaction.reply({ content: `✅ Giveaway started in <#${GIVEAWAY_CHANNEL_ID}>`, ephemeral: true });

        // Countdown Timer (Every minute)
        const timer = setInterval(async () => {
            duration--;
            if (duration <= 0) {
                clearInterval(timer);
                const finalEmbed = EmbedBuilder.from(getEmbed(0)).setTitle('🔴 GIVEAWAY ENDED').setColor(0xFF0000);
                await msg.edit({ embeds: [finalEmbed], components: [] });
                giveawayChannel.send(`🔔 **Giveaway Ended!** ${user}, your giveaway for **${prize}** is ready to be rolled! Use \`/roll messageid: ${msg.id}\``);
            } else {
                await msg.edit({ embeds: [getEmbed(duration)] }).catch(() => clearInterval(timer));
            }
        }, 60000);
    }

    // 3. ROLL COMMAND
    if (commandName === 'roll') {
        const msgId = options.getString('messageid');
        const extraText = options.getString('text');
        const entrySet = giveawayEntries.get(msgId);

        if (!entrySet || entrySet.size === 0) return interaction.reply({ content: "❌ No valid entries found for this ID.", ephemeral: true });

        const participants = Array.from(entrySet);
        const winnerId = participants[Math.floor(Math.random() * participants.length)];
        
        await interaction.reply({ 
            content: `🎲 **Rolling...**\n\n**Winner:** <@${winnerId}>\n**Note:** ${extraText}`
        });
    }

    // 4. EVENT COMMAND (HQ Only)
    if (commandName === 'event') {
        if (!member.roles.cache.has(HQ_ROLE_ID)) return interaction.reply({ content: "❌ HQ Only.", ephemeral: true });
        
        const now = Date.now();
        if (eventCooldowns.has(user.id) && (now - eventCooldowns.get(user.id) < 30 * 60000)) {
            return interaction.reply({ content: "⏳ 30m cooldown!", ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📢 ECPD EVENT')
            .addFields(
                { name: 'Event', value: options.getString('name') },
                { name: 'Host', value: options.getString('host'), inline: true },
                { name: 'Co-Host', value: options.getString('cohost'), inline: true },
                { name: 'Helpers', value: options.getString('helpers'), inline: true },
                { name: 'Rewards', value: options.getString('rewards') },
                { name: 'Description', value: options.getString('description') }
            ).setColor(0x00AAFF);

        const logChan = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
        if (logChan) {
            logChan.send({ content: "@everyone", embeds: [embed] });
            eventCooldowns.set(user.id, now);
            interaction.reply({ content: "✅ Sent!", ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);