const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, Collection } = require('discord.js');
const express = require('express');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- KEEP ALIVE SERVER ---
const app = express();
app.get('/', (req, res) => res.send('ECPD Bot is Online!'));
app.listen(10000, () => console.log('🚀 Keep-alive server listening on port 10000'));

// --- COOLDOWN TRACKER ---
const eventCooldowns = new Collection();

// --- COMMAND DEFINITIONS ---
const commands = [
    // Giveaway Command
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Start a giveaway')
        .addStringOption(opt => opt.setName('prize').setDescription('What is being given away?').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true)),

    // Event Command
    new SlashCommandBuilder()
        .setName('event')
        .setDescription('Post an ECPD Event (HQ Only)')
        .addStringOption(opt => opt.setName('name').setDescription('Event Name').setRequired(true))
        .addStringOption(opt => opt.setName('host').setDescription('Host Name').setRequired(true))
        .addStringOption(opt => opt.setName('cohost').setDescription('Co-Hosts (N/A if none)').setRequired(true))
        .addStringOption(opt => opt.setName('helpers').setDescription('Helpers (N/A if none)').setRequired(true))
        .addStringOption(opt => opt.setName('rewards').setDescription('Possible Rewards').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Event Description').setRequired(true))
].map(command => command.toJSON());

// --- DEPLOY COMMANDS ---
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`✅ ECPD System Online: ${client.user.tag}`);
    
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error(error);
    }
});

// --- INTERACTION HANDLING ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options, user, member } = interaction;

    // 1. EVENT COMMAND
    if (commandName === 'event') {
        const HQ_ROLE_ID = '1485259419192135829'; // <--- PUT YOUR HQ ROLE ID HERE
        
        if (!member.roles.cache.has(HQ_ROLE_ID)) {
            return interaction.reply({ content: "❌ Only HQ ranks can host events.", ephemeral: true });
        }

        // Cooldown Check (30 Minutes)
        const now = Date.now();
        const cooldownAmount = 30 * 60 * 1000;
        if (eventCooldowns.has(user.id)) {
            const expirationTime = eventCooldowns.get(user.id) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = Math.round((expirationTime - now) / 60000);
                return interaction.reply({ content: `⏳ Please wait ${timeLeft} more minutes before hosting another event.`, ephemeral: true });
            }
        }

        // Get Options
        const eName = options.getString('name');
        const eHost = options.getString('host');
        const eCohost = options.getString('cohost');
        const eHelpers = options.getString('helpers');
        const eRewards = options.getString('rewards');
        const eDesc = options.getString('description');

        const eventEmbed = new EmbedBuilder()
            .setTitle('📢 ECPD OFFICIAL EVENT')
            .setColor(0x00AAFF)
            .addFields(
                { name: '📌 Event Name', value: eName },
                { name: '👤 Host', value: eHost, inline: true },
                { name: '👥 Co-Hosts', value: eCohost, inline: true },
                { name: '🛠️ Helpers', value: eHelpers, inline: true },
                { name: '🎁 Possible Rewards', value: eRewards },
                { name: '📝 Description', value: eDesc }
            )
            .setFooter({ text: `Hosted by ${user.tag}` })
            .setTimestamp();

        const announcementChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID); // Or set a specific ID
        if (announcementChannel) {
            announcementChannel.send({ content: "@everyone", embeds: [eventEmbed] });
            eventCooldowns.set(user.id, now);
            await interaction.reply({ content: "✅ Event posted to announcements!", ephemeral: true });
        } else {
            await interaction.reply({ content: "❌ Announcement channel not found.", ephemeral: true });
        }
    }

    // 2. GIVEAWAY COMMAND (Simple Version)
    if (commandName === 'giveaway') {
        const prize = options.getString('prize');
        const duration = options.getInteger('duration');

        const giveawayEmbed = new EmbedBuilder()
            .setTitle('🎉 NEW GIVEAWAY!')
            .setDescription(`**Prize:** ${prize}\n**Ends in:** ${duration} minutes\n**Hosted by:** ${user}`)
            .setColor(0xFFA500)
            .setTimestamp();

        const message = await interaction.reply({ embeds: [giveawayEmbed], fetchReply: true });
        await message.react('🎉');

        setTimeout(async () => {
            const updatedMessage = await interaction.channel.messages.fetch(message.id);
            const reaction = updatedMessage.reactions.cache.get('🎉');
            const users = await reaction.users.fetch();
            const winner = users.filter(u => !u.bot).random();

            if (winner) {
                interaction.channel.send(`🎊 Congratulations ${winner}! You won the **${prize}**!`);
            } else {
                interaction.channel.send("❌ No one entered the giveaway.");
            }
        }, duration * 60000);
    }
});

client.login(process.env.TOKEN);