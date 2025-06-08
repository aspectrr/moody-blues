import {
  Client,
  Events,
  TextChannel,
  Message,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { createIssue } from "../db/queries.js";
import { analyzeUserQuery } from "../llm/analyzer.js";
import { IssueStatus, NewIssue } from "../types/issues.js";
import { startIssueInvestigation } from "../testing/investigator.js";
import { formatError } from "../utils/error.js";

// Track active help sessions
const activeHelpSessions = new Map<
  string,
  { userId: string; messageId: string }
>();

/**
 * Sets up the Discord bot and event handlers
 */
export async function setupBot(client: Client): Promise<void> {
  // Set up event handlers
  client.once(Events.ClientReady, onReady);
  client.on(Events.MessageCreate, onMessageCreate);
  client.on(Events.InteractionCreate, onInteractionCreate);

  return Promise.resolve();
}

/**
 * Handler for when the client is ready
 */
async function onReady(client: Client): Promise<void> {
  console.log(`Logged in as ${client.user?.tag}`);

  try {
    // Find the help channel
    const helpChannelId = process.env.DISCORD_HELP_CHANNEL_ID;
    if (!helpChannelId) {
      throw new Error("Help channel ID not configured");
    }

    const helpChannel = (await client.channels.fetch(
      helpChannelId,
    )) as TextChannel;
    if (!helpChannel) {
      throw new Error(`Could not find help channel with ID ${helpChannelId}`);
    }

    console.log(`Monitoring help channel: #${helpChannel.name}`);
  } catch (error) {
    console.error(
      "Error setting up help channel monitoring:",
      formatError(error),
    );
  }
}

/**
 * Handler for new messages
 */
async function onMessageCreate(message: Message): Promise<void> {
  // Ignore bot messages to prevent loops
  if (message.author.bot) return;

  try {
    const helpChannelId = process.env.DISCORD_HELP_CHANNEL_ID;

    // Only process messages in the help channel
    if (message.channelId === helpChannelId) {
      await handleHelpChannelMessage(message);
    }
  } catch (error) {
    console.error("Error handling message:", formatError(error));
  }
}

/**
 * Process a message in the help channel
 */
async function handleHelpChannelMessage(message: Message): Promise<void> {
  // Don't respond to messages from users already in an active session
  const userId = message.author.id;
  if (
    Array.from(activeHelpSessions.values()).some(
      (session) => session.userId === userId,
    )
  ) {
    return;
  }

  try {
    // Initial automatic response to help request
    const initialResponse = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Help Request Received")
          .setDescription(
            "I can help investigate this issue. Would you like me to start analyzing your problem?",
          )
          .setColor("#0099ff"),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("begin_investigation")
            .setLabel("Start Investigation")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("cancel_investigation")
            .setLabel("No Thanks")
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });

    // Track this help session
    activeHelpSessions.set(initialResponse.id, {
      userId: message.author.id,
      messageId: message.id,
    });

    // Clear the session if no response after 30 minutes
    setTimeout(
      () => {
        if (activeHelpSessions.has(initialResponse.id)) {
          activeHelpSessions.delete(initialResponse.id);
        }
      },
      30 * 60 * 1000,
    );
  } catch (error) {
    console.error("Error handling help message:", formatError(error));
  }
}

/**
 * Handler for interactions (buttons, select menus, etc.)
 */
async function onInteractionCreate(interaction: any): Promise<void> {
  // Handle button interactions
  if (interaction.isButton()) {
    try {
      const session = activeHelpSessions.get(interaction.message.id);

      // Make sure this is a valid session
      if (!session) {
        await interaction.reply({
          content:
            "This investigation session has expired. Please start a new help request.",
          ephemeral: true,
        });
        return;
      }

      // Process the button press
      switch (interaction.customId) {
        case "begin_investigation":
          await beginInvestigation(interaction, session);
          break;

        case "cancel_investigation":
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("Investigation Cancelled")
                .setDescription(
                  "No problem! Feel free to ask again if you need help later.",
                )
                .setColor("#888888"),
            ],
            components: [],
          });
          activeHelpSessions.delete(interaction.message.id);
          break;

        default:
          await interaction.reply({
            content: "Unknown button interaction",
            ephemeral: true,
          });
      }
    } catch (error) {
      console.error("Error handling button interaction:", formatError(error));
      await interaction
        .reply({
          content: "Sorry, something went wrong processing your request.",
          ephemeral: true,
        })
        .catch(console.error);
    }
  }
}

/**
 * Begin the investigation process
 */
async function beginInvestigation(
  interaction: any,
  session: { userId: string; messageId: string },
): Promise<void> {
  try {
    // Update the message to show we're starting
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("Investigation Started")
          .setDescription("I'm analyzing your issue. This may take a moment...")
          .setColor("#0099ff"),
      ],
      components: [],
    });

    // Get the original help message
    const channel = interaction.channel;
    const originalMessage = await channel.messages.fetch(session.messageId);

    if (!originalMessage) {
      throw new Error("Could not find original help message");
    }

    // Analyze the user's query
    const analysis = await analyzeUserQuery(originalMessage.content);

    // Create a new issue in the database
    const newIssue: NewIssue = {
      userId: originalMessage.author.id,
      username: originalMessage.author.username,
      originalQuery: originalMessage.content,
      analysisResult: analysis,
      status: IssueStatus.IN_PROGRESS,
      originMessageId: originalMessage.id,
      originChannelId: originalMessage.channelId,
      originTimestamp: originalMessage.createdTimestamp,
    };

    const issue = await createIssue(newIssue);

    // Start the investigation process
    await startIssueInvestigation(issue, originalMessage, interaction.message);

    // Clear the active session
    activeHelpSessions.delete(interaction.message.id);
  } catch (error) {
    console.error("Error beginning investigation:", formatError(error));

    // Update the message with the error
    await interaction.message
      .edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("Investigation Error")
            .setDescription(
              "Sorry, I encountered an error while starting the investigation. A maintainer will be notified.",
            )
            .setColor("#ff0000"),
        ],
        components: [],
      })
      .catch(console.error);

    // Clear the active session
    activeHelpSessions.delete(interaction.message.id);
  }
}
