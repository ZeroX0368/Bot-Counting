const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Data storage
let blacklistedUsers = new Set();
let blacklistedServers = new Set();
let countingChannels = new Map(); // channelId -> { count: number, lastUser: userId }
let stickyMessages = new Map(); // channelId -> { message: string, messageId: string, isActive: boolean }
let afkUsers = new Map(); // userId -> { guildId: string, reason: string, originalNick: string }

const startTime = Date.now();

// Load data
function loadData() {
    try {
        if (fs.existsSync('data.json')) {
            const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
            blacklistedUsers = new Set(data.blacklistedUsers || []);
            blacklistedServers = new Set(data.blacklistedServers || []);
            countingChannels = new Map(data.countingChannels || []);
            stickyMessages = new Map(data.stickyMessages || []);
            afkUsers = new Map(data.afkUsers || []);
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Save data
function saveData() {
    try {
        const data = {
            blacklistedUsers: Array.from(blacklistedUsers),
            blacklistedServers: Array.from(blacklistedServers),
            countingChannels: Array.from(countingChannels),
            stickyMessages: Array.from(stickyMessages),
            afkUsers: Array.from(afkUsers)
        };
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

client.once('ready', async () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
    loadData();

    // Register slash commands
    const commands = [
        // Blacklist commands
        new SlashCommandBuilder()
            .setName('blacklist')
            .setDescription('Manage blacklisted users and servers')
            .addSubcommandGroup(group =>
                group
                    .setName('user')
                    .setDescription('Manage blacklisted users')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('add')
                            .setDescription('Add a user to blacklist')
                            .addUserOption(option =>
                                option.setName('user')
                                    .setDescription('User to blacklist')
                                    .setRequired(false))
                            .addStringOption(option =>
                                option.setName('userid')
                                    .setDescription('User ID to blacklist')
                                    .setRequired(false)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('remove')
                            .setDescription('Remove a user from blacklist')
                            .addUserOption(option =>
                                option.setName('user')
                                    .setDescription('User to remove from blacklist')
                                    .setRequired(false))
                            .addStringOption(option =>
                                option.setName('userid')
                                    .setDescription('User ID to remove from blacklist')
                                    .setRequired(false)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('list')
                            .setDescription('List all blacklisted users')))
            .addSubcommandGroup(group =>
                group
                    .setName('server')
                    .setDescription('Manage blacklisted servers')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('add')
                            .setDescription('Add a server to blacklist')
                            .addStringOption(option =>
                                option.setName('serverid')
                                    .setDescription('Server ID to blacklist')
                                    .setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('remove')
                            .setDescription('Remove a server from blacklist')
                            .addStringOption(option =>
                                option.setName('serverid')
                                    .setDescription('Server ID to remove from blacklist')
                                    .setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('list')
                            .setDescription('List all blacklisted servers'))),

        // Bot info commands
        new SlashCommandBuilder()
            .setName('bot')
            .setDescription('Bot information and utilities')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('info')
                    .setDescription('Display bot information'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('help')
                    .setDescription('Show bot help'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('uptime')
                    .setDescription('Show bot uptime'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ping')
                    .setDescription('Check bot latency'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('feedback')
                    .setDescription('Send feedback')
                    .addStringOption(option =>
                        option.setName('message')
                            .setDescription('Your feedback message')
                            .setRequired(true))),

        // Info commands
        new SlashCommandBuilder()
            .setName('info')
            .setDescription('Get information about users or server')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('user')
                    .setDescription('Get information about a user')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to get information about')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('server')
                    .setDescription('Get information about the server'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('avatar')
                    .setDescription('Get user avatar')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to get avatar of')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('banner')
                    .setDescription('Get user banner')
                    .addUserOption(option =>
                        option.setName('user')
                            .setDescription('User to get banner of')
                            .setRequired(false))),

        // Channel counting commands
        new SlashCommandBuilder()
            .setName('channel')
            .setDescription('Channel management')
            .addSubcommandGroup(group =>
                group
                    .setName('counting')
                    .setDescription('Manage counting channels')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('set')
                            .setDescription('Set a counting channel')
                            .addChannelOption(option =>
                                option.setName('channel')
                                    .setDescription('Channel to set for counting')
                                    .setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('remove')
                            .setDescription('Remove a counting channel')
                            .addChannelOption(option =>
                                option.setName('channel')
                                    .setDescription('Channel to remove from counting')
                                    .setRequired(true))))
            .addSubcommandGroup(group =>
                group
                    .setName('stick')
                    .setDescription('Manage sticky messages')
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('setup')
                            .setDescription('Setup a sticky message in the channel')
                            .addStringOption(option =>
                                option.setName('message')
                                    .setDescription('Message to stick')
                                    .setRequired(true)))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('stop')
                            .setDescription('Stop the sticky message in current channel'))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('start')
                            .setDescription('Restart the sticky message in current channel'))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('remove')
                            .setDescription('Remove the sticky message from current channel'))
                    .addSubcommand(subcommand =>
                        subcommand
                            .setName('get')
                            .setDescription('Show all sticky messages in this server'))),

        // AFK commands
        new SlashCommandBuilder()
            .setName('afk')
            .setDescription('AFK system commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('set')
                    .setDescription('Set yourself as AFK')
                    .addStringOption(option =>
                        option.setName('reason')
                            .setDescription('Reason for being AFK')
                            .setRequired(false)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all AFK users in this server'))
    ];

    try {
        console.log('Started refreshing application (/) commands.');
        await client.application.commands.set(commands);
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // Check if command is used in a guild (server)
    if (!interaction.guild) {
        const embed = new EmbedBuilder()
            .setColor(config.errorcolor)
            .setDescription('❌ Commands only work in servers.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Check if user is blacklisted
    if (blacklistedUsers.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ You are blacklisted from using this bot.', ephemeral: true });
    }

    // Check if server is blacklisted
    if (blacklistedServers.has(interaction.guildId)) {
        return interaction.reply({ content: '❌ This server is blacklisted from using this bot.', ephemeral: true });
    }

    try {
        if (commandName === 'blacklist') {
            await handleBlacklistCommand(interaction);
        } else if (commandName === 'bot') {
            await handleBotCommand(interaction);
        } else if (commandName === 'info') {
            await handleInfoCommand(interaction);
        } else if (commandName === 'channel') {
            await handleChannelCommand(interaction);
        } else if (commandName === 'afk') {
            await handleAfkCommand(interaction);
        }
    } catch (error) {
        console.error('Error handling command:', error);
        const embed = new EmbedBuilder()
            .setColor(config.errorcolor)
            .setDescription('❌ An error occurred while executing the command.');

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
});

async function handleBlacklistCommand(interaction) {
    // Owner only check
    if (interaction.user.id !== config.ownerid) {
        const embed = new EmbedBuilder()
            .setColor(config.errorcolor)
            .setDescription('❌ This command is only available to the bot owner.');
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup === 'user') {
        if (subcommand === 'add') {
            const user = interaction.options.getUser('user');
            const userid = interaction.options.getString('userid');
            const targetId = user?.id || userid;

            if (!targetId) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ Please provide either a user or user ID.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            blacklistedUsers.add(targetId);
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription(`✅ User <@${targetId}> has been blacklisted.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'remove') {
            const user = interaction.options.getUser('user');
            const userid = interaction.options.getString('userid');
            const targetId = user?.id || userid;

            if (!targetId) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ Please provide either a user or user ID.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            blacklistedUsers.delete(targetId);
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription(`✅ User <@${targetId}> has been removed from blacklist.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'list') {
            const userList = Array.from(blacklistedUsers);
            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setTitle('Blacklisted Users')
                .setDescription(userList.length > 0 ? userList.map(id => `<@${id}> (${id})`).join('\n') : 'No blacklisted users.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } else if (subcommandGroup === 'server') {
        if (subcommand === 'add') {
            const serverid = interaction.options.getString('serverid');
            blacklistedServers.add(serverid);
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription(`✅ Server \`${serverid}\` has been blacklisted.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'remove') {
            const serverid = interaction.options.getString('serverid');
            blacklistedServers.delete(serverid);
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription(`✅ Server \`${serverid}\` has been removed from blacklist.`);
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'list') {
            const serverList = Array.from(blacklistedServers);
            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setTitle('Blacklisted Servers')
                .setDescription(serverList.length > 0 ? serverList.map(id => `\`${id}\``).join('\n') : 'No blacklisted servers.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

async function handleInfoCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'user') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!member) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ User not found in this server.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const joinedTimestamp = Math.floor(member.joinedTimestamp / 1000);
        const createdTimestamp = Math.floor(targetUser.createdTimestamp / 1000);
        const daysSinceJoin = Math.floor((Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24));
        const daysSinceCreation = Math.floor((Date.now() - targetUser.createdTimestamp) / (1000 * 60 * 60 * 24));

        const roles = member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => role.toString())
            .slice(0, 10);

        const badges = [];
        if (targetUser.flags) {
            const userFlags = targetUser.flags.toArray();
            if (userFlags.includes('Staff')) badges.push('Discord Staff');
            if (userFlags.includes('Partner')) badges.push('Discord Partner');
            if (userFlags.includes('Hypesquad')) badges.push('HypeSquad Events');
            if (userFlags.includes('BugHunterLevel1')) badges.push('Bug Hunter Level 1');
            if (userFlags.includes('BugHunterLevel2')) badges.push('Bug Hunter Level 2');
            if (userFlags.includes('HypesquadOnlineHouse1')) badges.push('HypeSquad Bravery');
            if (userFlags.includes('HypesquadOnlineHouse2')) badges.push('HypeSquad Brilliance');
            if (userFlags.includes('HypesquadOnlineHouse3')) badges.push('HypeSquad Balance');
            if (userFlags.includes('PremiumEarlySupporter')) badges.push('Early Nitro Supporter');
            if (userFlags.includes('VerifiedDeveloper')) badges.push('Verified Bot Developer');
            if (userFlags.includes('CertifiedModerator')) badges.push('Discord Certified Moderator');
            if (userFlags.includes('VerifiedBot')) badges.push('Verified Bot');
        }

        const description = [
            `**User ID:** \`\`${targetUser.id}\`\``,
            `**Nickname:** ${member.nickname || targetUser.username}`,
            `**Join Date:** <t:${joinedTimestamp}:R>, *${daysSinceJoin}* days`,
            `**Creation Date:** <t:${createdTimestamp}:R>, *${daysSinceCreation}* days`,
            `**Badges:** ${badges.length > 0 ? badges.join(', ') : 'None'}`,
            `**Tag:** <@${targetUser.id}>`,
            `**Nitro Boosting:** ${member.premiumSince ? `Since <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : 'Member not boosting.'}`,
            `**Number of Roles:** ${roles.length}`,
            `**Roles:**\n${roles.length > 0 ? roles.join(' ') : 'No roles'}`
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setDescription(description)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'server') {
        const guild = interaction.guild;
        const owner = await guild.fetchOwner();
        const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);
        const daysSinceCreation = Math.floor((Date.now() - guild.createdTimestamp) / (1000 * 60 * 60 * 24));

        const textChannels = guild.channels.cache.filter(channel => channel.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2).size;

        const description = [
            `**Server ID:** \`\`${guild.id}\`\``,
            `**Creation Date:** <t:${createdTimestamp}:D> *(${daysSinceCreation} days ago)*`,
            `**Members:** ${guild.memberCount}`,
            `**Owner:** <@${owner.id}>`,
            `**Nitro Boosting:** Tier ${guild.premiumTier}`,
            `**Number of Roles:** ${guild.roles.cache.size}`,
            `**Text Channels:** ${textChannels}`,
            `**Voice Channels:** ${voiceChannels}`
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setDescription(description)
            .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'avatar') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        const avatarHash = targetUser.avatar;
        if (!avatarHash) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ This user does not have a custom avatar.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const baseUrl = `https://cdn.discordapp.com/avatars/${targetUser.id}/${avatarHash}`;
        const pngUrl = `${baseUrl}.png?size=4096`;
        const jpgUrl = `${baseUrl}.jpg?size=4096`;
        const webpUrl = `${baseUrl}.webp?size=4096`;

        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle(`Avatar for ${targetUser.username}`)
            .setDescription(`[png](${pngUrl}) | [jpg](${jpgUrl}) | [webp](${webpUrl})`)
            .setImage(pngUrl)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'banner') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        // Fetch the full user to get banner info
        const fullUser = await client.users.fetch(targetUser.id, { force: true });
        
        if (!fullUser.banner) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ This user does not have a custom banner.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const bannerUrl = fullUser.bannerURL({ size: 4096 });
        const baseUrl = `https://cdn.discordapp.com/banners/${targetUser.id}/${fullUser.banner}`;
        const pngUrl = `${baseUrl}.png?size=4096`;
        const jpgUrl = `${baseUrl}.jpg?size=4096`;
        const webpUrl = `${baseUrl}.webp?size=4096`;

        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle(`Banner for ${targetUser.username}`)
            .setDescription(`[png](${pngUrl}) | [jpg](${jpgUrl}) | [webp](${webpUrl})`)
            .setImage(bannerUrl)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}

async function handleBotCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'info') {
        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle('Bot Information')
            .addFields(
                { name: 'Bot Name', value: client.user.username, inline: true },
                { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
                { name: 'Users', value: client.users.cache.size.toString(), inline: true },
                { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Node.js', value: process.version, inline: true },
                { name: 'Discord.js', value: require('discord.js').version, inline: true }
            )
            .setThumbnail(client.user.displayAvatarURL())
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'help') {
        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle('Bot Help')
            .setDescription('Available commands:')
            .addFields(
                { name: '🚫 Blacklist Commands (Owner Only)', value: '`/blacklist user add/remove/list`\n`/blacklist server add/remove/list`', inline: false },
                { name: '🤖 Bot Commands', value: '`/bot info` - Bot information\n`/bot help` - This help menu\n`/bot uptime` - Bot uptime\n`/bot ping` - Bot latency\n`/bot feedback` - Send feedback', inline: false },
                { name: 'ℹ️ Info Commands', value: '`/info user` - User information\n`/info server` - Server information\n`/info avatar` - Get user avatar\n`/info banner` - Get user banner', inline: false },
                { name: '🔢 Counting Commands', value: '`/channel counting set` - Set counting channel\n`/channel counting remove` - Remove counting channel', inline: false },
                { name: '📌 Sticky Message Commands', value: '`/channel stick setup` - Setup sticky message\n`/channel stick stop/start` - Stop/start sticky\n`/channel stick remove` - Remove sticky\n`/channel stick get` - Show all stickies', inline: false },
                { name: '😴 AFK Commands', value: '`/afk set` - Set yourself as AFK\n`/afk list` - List all AFK users', inline: false }
            );
        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'uptime') {
        const uptime = Date.now() - startTime;
        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor(uptime / 3600000) % 24;
        const minutes = Math.floor(uptime / 60000) % 60;
        const seconds = Math.floor(uptime / 1000) % 60;

        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle('Bot Uptime')
            .setDescription(`${days}d ${hours}h ${minutes}m ${seconds}s`);
        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'ping') {
        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle('Bot Latency')
            .addFields(
                { name: 'WebSocket Ping', value: `${client.ws.ping}ms`, inline: true },
                { name: 'API Latency', value: `${Date.now() - interaction.createdTimestamp}ms`, inline: true }
            );
        await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'feedback') {
        const message = interaction.options.getString('message');

        try {
            const feedbackChannel = client.channels.cache.get(config.FeedbackChannelId);
            if (feedbackChannel) {
                const feedbackEmbed = new EmbedBuilder()
                    .setColor(config.successcolor)
                    .setTitle('New Feedback')
                    .addFields(
                        { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                        { name: 'Server', value: `${interaction.guild.name} (${interaction.guild.id})`, inline: false },
                        { name: 'Message', value: message, inline: false }
                    )
                    .setTimestamp();

                await feedbackChannel.send({ embeds: [feedbackEmbed] });

                const embed = new EmbedBuilder()
                    .setColor(config.successcolor)
                    .setDescription('✅ Feedback sent successfully!');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ Feedback channel not configured.');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ Failed to send feedback.');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
}

async function handleChannelCommand(interaction) {
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup === 'stick') {
        // Check permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ You need the "Manage Messages" permission to use this command.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (subcommand === 'setup') {
            const message = interaction.options.getString('message');
            const channelId = interaction.channel.id;

            try {
                const formattedMessage = `__**Stickied Message:**__\n${message}`;
                const sentMessage = await interaction.channel.send(formattedMessage);
                stickyMessages.set(channelId, {
                    message: message,
                    messageId: sentMessage.id,
                    isActive: true
                });
                saveData();

                const embed = new EmbedBuilder()
                    .setColor(config.successcolor)
                    .setDescription('✅ Sticky message has been set up successfully!');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ Failed to set up sticky message.');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

        } else if (subcommand === 'stop') {
            const channelId = interaction.channel.id;
            const stickyData = stickyMessages.get(channelId);

            if (!stickyData) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ No sticky message found in this channel.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            stickyData.isActive = false;
            stickyMessages.set(channelId, stickyData);
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription('✅ Sticky message has been stopped.');
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'start') {
            const channelId = interaction.channel.id;
            const stickyData = stickyMessages.get(channelId);

            if (!stickyData) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ No sticky message found in this channel.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (stickyData.isActive) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ Sticky message is already active.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            try {
                const formattedMessage = `__**Stickied Message:**__\n${stickyData.message}`;
                const sentMessage = await interaction.channel.send(formattedMessage);
                stickyData.messageId = sentMessage.id;
                stickyData.isActive = true;
                stickyMessages.set(channelId, stickyData);
                saveData();

                const embed = new EmbedBuilder()
                    .setColor(config.successcolor)
                    .setDescription('✅ Sticky message has been restarted.');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ Failed to restart sticky message.');
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }

        } else if (subcommand === 'remove') {
            const channelId = interaction.channel.id;
            const stickyData = stickyMessages.get(channelId);

            if (!stickyData) {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription('❌ No sticky message found in this channel.');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            try {
                if (stickyData.messageId) {
                    const message = await interaction.channel.messages.fetch(stickyData.messageId);
                    await message.delete();
                }
            } catch (error) {
                // Message might already be deleted
            }

            stickyMessages.delete(channelId);
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription('✅ Sticky message has been removed.');
            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'get') {
            const guildChannels = interaction.guild.channels.cache;
            const guildStickies = [];

            for (const [channelId, stickyData] of stickyMessages) {
                const channel = guildChannels.get(channelId);
                if (channel) {
                    guildStickies.push({
                        channel: channel.toString(),
                        message: stickyData.message.substring(0, 50) + (stickyData.message.length > 50 ? '...' : ''),
                        status: stickyData.isActive ? '🟢 Active' : '🔴 Stopped'
                    });
                }
            }

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setTitle('Sticky Messages in Server')
                .setDescription(guildStickies.length > 0 ? 
                    guildStickies.map(sticky => 
                        `${sticky.channel} - ${sticky.status}\n\`${sticky.message}\``
                    ).join('\n\n') : 
                    'No sticky messages found in this server.'
                );
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

    } else if (subcommandGroup === 'counting') {
        // Check permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ You need the "Manage Channels" permission to use this command.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');

        if (subcommand === 'set') {
            countingChannels.set(channel.id, { count: 0, lastUser: null });
            saveData();

            const embed = new EmbedBuilder()
                .setColor(config.successcolor)
                .setDescription(`✅ ${channel} has been set as a counting channel.\n\nUsers will take turns counting starting from 1. Each user must wait for another user to count before counting again.`);
            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
            if (countingChannels.has(channel.id)) {
                countingChannels.delete(channel.id);
                saveData();

                const embed = new EmbedBuilder()
                    .setColor(config.successcolor)
                    .setDescription(`✅ ${channel} has been removed from counting channels.`);
                await interaction.reply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor(config.errorcolor)
                    .setDescription(`❌ ${channel} is not a counting channel.`);
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
}

async function handleAfkCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set') {
        const reason = interaction.options.getString('reason') || 'Not specified';
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // Check if user is already AFK
        if (afkUsers.has(userId)) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ You\'re already AFK!');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Get current nickname
        const member = interaction.member;
        const originalNick = member.displayName;

        // Store AFK data
        afkUsers.set(userId, {
            guildId: guildId,
            reason: reason,
            originalNick: originalNick
        });
        saveData();

        // Set AFK nickname
        try {
            if (!member.displayName.includes('[AFK] ')) {
                await member.setNickname(`[AFK] ${member.displayName}`);
            }
        } catch (error) {
            // Handle permission errors silently
        }

        // Send confirmation
        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setDescription('✅ Your AFK has been set up successfully');
        await interaction.reply({ embeds: [embed] });

        // Send public AFK message
        const publicEmbed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setDescription(`${interaction.user} is now AFK! **Reason:** ${reason}`);
        await interaction.followUp({ embeds: [publicEmbed] });

    } else if (subcommand === 'list') {
        const guildAfkUsers = [];
        
        for (const [userId, afkData] of afkUsers) {
            if (afkData.guildId === interaction.guild.id) {
                guildAfkUsers.push(`<@${userId}> - **Reason:** ${afkData.reason}`);
            }
        }

        if (guildAfkUsers.length < 1) {
            const embed = new EmbedBuilder()
                .setColor(config.errorcolor)
                .setDescription('❌ No AFK users found in this server!');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setTitle(`😴・AFK users - ${interaction.guild.name}`)
            .setDescription(guildAfkUsers.join('\n'))
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
}

// Handle counting in channels
client.on('messageCreate', async message => {
    if (message.author.bot || !countingChannels.has(message.channel.id)) return;

    // Check if user is blacklisted
    if (blacklistedUsers.has(message.author.id)) return;

    // Check if server is blacklisted
    if (blacklistedServers.has(message.guild?.id)) return;

    const countingData = countingChannels.get(message.channel.id);
    const expectedCount = countingData.count + 1;
    const messageNumber = parseInt(message.content.trim());

    // Check if the message is a valid number and matches expected count
    if (messageNumber === expectedCount && message.author.id !== countingData.lastUser) {
        // Correct count and different user
        countingData.count = expectedCount;
        countingData.lastUser = message.author.id;
        countingChannels.set(message.channel.id, countingData);
        saveData();

        // Add checkmark reaction
        await message.react('✅');
    } else {
        // Wrong count or same user counting twice
        countingData.count = 0;
        countingData.lastUser = null;
        countingChannels.set(message.channel.id, countingData);
        saveData();

        // Add X reaction and reset message
        await message.react('❌');
        await message.channel.send(`❌ **Count reset!** ${message.author} ruined it at **${countingData.count || 0}**. The next number is **1**.`);
    }
});

// Handle AFK return detection
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Check if user is blacklisted
    if (blacklistedUsers.has(message.author.id)) return;

    // Check if server is blacklisted
    if (blacklistedServers.has(message.guild?.id)) return;

    // Handle AFK return
    if (afkUsers.has(message.author.id)) {
        const afkData = afkUsers.get(message.author.id);
        
        // Remove from AFK
        afkUsers.delete(message.author.id);
        saveData();

        // Restore original nickname
        try {
            const member = message.guild.members.cache.get(message.author.id);
            if (member && member.displayName.includes('[AFK] ')) {
                await member.setNickname(afkData.originalNick);
            }
        } catch (error) {
            // Handle permission errors silently
        }

        // Send welcome back message
        const embed = new EmbedBuilder()
            .setColor(config.successcolor)
            .setDescription(`👋 Welcome back ${message.author}! Your AFK status has been removed.`);
        
        const welcomeMessage = await message.channel.send({ embeds: [embed] });
        
        // Delete the welcome message after 5 seconds
        setTimeout(async () => {
            try {
                await welcomeMessage.delete();
            } catch (error) {
                // Message might already be deleted
            }
        }, 5000);
    }

    // Check for mentions of AFK users
    if (message.mentions.users.size > 0) {
        for (const [userId, user] of message.mentions.users) {
            if (afkUsers.has(userId)) {
                const afkData = afkUsers.get(userId);
                if (afkData.guildId === message.guild.id) {
                    const embed = new EmbedBuilder()
                        .setColor('#ffcc00')
                        .setDescription(`😴 ${user} is currently AFK: **${afkData.reason}**`);
                    
                    const afkMessage = await message.channel.send({ embeds: [embed] });
                    
                    // Delete the AFK notification after 5 seconds
                    setTimeout(async () => {
                        try {
                            await afkMessage.delete();
                        } catch (error) {
                            // Message might already be deleted
                        }
                    }, 5000);
                    break; // Only show one AFK message per message
                }
            }
        }
    }
});

// Handle sticky messages - keep at the end
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Check if user is blacklisted
    if (blacklistedUsers.has(message.author.id)) return;

    // Check if server is blacklisted
    if (blacklistedServers.has(message.guild?.id)) return;

    const stickyData = stickyMessages.get(message.channel.id);
    if (!stickyData || !stickyData.isActive) return;

    try {
        // Delete the old sticky message
        if (stickyData.messageId) {
            const oldMessage = await message.channel.messages.fetch(stickyData.messageId);
            await oldMessage.delete();
        }

        // Send new sticky message
        const formattedMessage = `__**Stickied Message:**__\n${stickyData.message}`;
        const newMessage = await message.channel.send(formattedMessage);
        stickyData.messageId = newMessage.id;
        stickyMessages.set(message.channel.id, stickyData);
        saveData();
    } catch (error) {
        console.error('Error handling sticky message:', error);
    }
});

client.login(config.token);
