require("dotenv").config();

const { Client, GatewayIntentBits, Partials } = require("discord.js");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

// Owner of tracker commands
const OWNER_ID = "855383662068891668";

// Account used by Autosender to send !stok
const STOCK_ACCOUNT_ID = "991975250004811776";

// Account to ping when stock is available
const ALERT_USER_ID = "991975250004811776";

// Kole V4 bot
const KOLE_BOT_ID = "1154503721963769876";

// Channel where Autosender sends !stok
const TRACKING_CHANNEL_ID = "1372075790799470673";

// Wait up to 15 seconds for Kole V4 to respond
const RESPONSE_TIMEOUT = 15 * 1000;

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// ============================================================
// TRACKER STATE
// ============================================================

let trackerRunning = true;
let trackingChannel = null;

let waitingForResponse = false;

let lastStock = null;
let lastCheck = null;
let lastAlert = null;

// Prevent repeated pings while stock remains available
let stockAlerted = false;

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {
    console.log("======================================");
    console.log("      KOLE V4 STOCK TRACKER");
    console.log("======================================");

    console.log(`Logged in as: ${client.user.tag}`);
    console.log(`Bot ID: ${client.user.id}`);
    console.log(`Watching account: ${STOCK_ACCOUNT_ID}`);
    console.log(`Kole V4 ID: ${KOLE_BOT_ID}`);
    console.log(`Tracking channel: ${TRACKING_CHANNEL_ID}`);

    try {
        trackingChannel = await client.channels.fetch(
            TRACKING_CHANNEL_ID
        );

        if (!trackingChannel) {
            console.error("❌ Tracking channel could not be found.");
            return;
        }

        console.log(
            `Channel loaded: ${trackingChannel.name || TRACKING_CHANNEL_ID}`
        );

        console.log("");
        console.log("🟢 Tracker automatically started.");
        console.log("Waiting for Autosender !stok...");
        console.log("======================================");

    } catch (error) {
        console.error(
            "❌ Failed to load tracking channel:",
            error
        );
    }
});

// ============================================================
// MESSAGE LISTENER
// ============================================================

client.on("messageCreate", async (message) => {
    try {

        // ========================================================
        // WATCH AUTOSENDER ACCOUNT
        // ========================================================

        if (
            trackerRunning &&
            message.author.id === STOCK_ACCOUNT_ID &&
            message.channel.id === TRACKING_CHANNEL_ID &&
            message.content.trim().toLowerCase() === "!stok"
        ) {

            await handleAutomatedStockCommand(message);

            return;
        }

        // ========================================================
        // IGNORE BOTS FOR CONTROL COMMANDS
        // ========================================================

        if (message.author.bot) {
            return;
        }

        // ========================================================
        // OWNER ONLY
        // ========================================================

        if (message.author.id !== OWNER_ID) {
            return;
        }

        const command = message.content
            .trim()
            .toLowerCase();

        // ========================================================
        // !trackstart
        // ========================================================

        if (command === "!trackstart") {

            if (trackerRunning) {
                await message.reply(
                    "🟡 **Tracker is already running.**"
                );
                return;
            }

            trackerRunning = true;

            stockAlerted = false;
            lastStock = null;
            lastCheck = null;
            lastAlert = null;

            try {
                trackingChannel =
                    await client.channels.fetch(
                        TRACKING_CHANNEL_ID
                    );
            } catch (error) {
                console.error(
                    "Could not fetch tracking channel:",
                    error
                );
            }

            await message.reply(
                "🟢 **Kole V4 stock listener started!**\n\n" +
                `👤 Watching: <@${STOCK_ACCOUNT_ID}>\n` +
                `📨 Waiting for \`!stok\`\n` +
                `🔔 Alert: <@${ALERT_USER_ID}>\n` +
                `📍 Channel: <#${TRACKING_CHANNEL_ID}>`
            );

            console.log("======================================");
            console.log("TRACKER STARTED");
            console.log(
                `Channel: ${TRACKING_CHANNEL_ID}`
            );
            console.log(
                `Watching account: ${STOCK_ACCOUNT_ID}`
            );
            console.log("======================================");

            return;
        }

        // ========================================================
        // !trackstop
        // ========================================================

        if (command === "!trackstop") {

            if (!trackerRunning) {
                await message.reply(
                    "🟡 **Tracker is not running.**"
                );
                return;
            }

            stopTracker();

            await message.reply(
                "🔴 **Kole V4 stock listener stopped.**"
            );

            return;
        }

        // ========================================================
        // !trackstatus
        // ========================================================

        if (command === "!trackstatus") {

            const status = trackerRunning
                ? "🟢 RUNNING"
                : "🔴 STOPPED";

            const stockText =
                lastStock === null
                    ? "No check yet"
                    : `${formatStock(lastStock)}M`;

            const lastCheckText = lastCheck
                ? `<t:${Math.floor(
                      lastCheck.getTime() / 1000
                  )}:R>`
                : "Never";

            const alertText = stockAlerted
                ? "🔔 Already alerted"
                : "Waiting for stock";

            await message.reply(
                "📡 **Kole V4 Stock Tracker**\n\n" +
                `Status: ${status}\n` +
                `Watching: <@${STOCK_ACCOUNT_ID}>\n` +
                `Channel: <#${TRACKING_CHANNEL_ID}>\n` +
                `Last stock: **${stockText}**\n` +
                `Last check: ${lastCheckText}\n` +
                `Current cycle: ${alertText}`
            );

            return;
        }

        // ========================================================
        // !tracknow
        // ========================================================

        if (command === "!tracknow") {

            await message.reply(
                "👀 **Listener is ready.**\n" +
                `Waiting for <@${STOCK_ACCOUNT_ID}> to send ` +
                "`!stok` in <#" +
                TRACKING_CHANNEL_ID +
                ">."
            );

            return;
        }

    } catch (error) {

        console.error(
            "Message handler error:",
            error
        );
    }
});

// ============================================================
// HANDLE !STOK FROM AUTOSENDER
// ============================================================

async function handleAutomatedStockCommand(
    commandMessage
) {

    if (!trackingChannel) {
        trackingChannel =
            commandMessage.channel;
    }

    // Make absolutely sure this is the correct channel
    if (
        commandMessage.channel.id !==
        TRACKING_CHANNEL_ID
    ) {
        console.log(
            `Ignoring !stok from channel ` +
            `${commandMessage.channel.id}`
        );

        return;
    }

    // Don't process another request while waiting
    if (waitingForResponse) {

        console.log(
            "Previous stock response is still being processed."
        );

        return;
    }

    waitingForResponse = true;
    lastCheck = new Date();

    console.log("");
    console.log("--------------------------------------");
    console.log(
        `AUTOMATED !stok DETECTED: ` +
        `${lastCheck.toLocaleString()}`
    );
    console.log(
        `Channel: ${commandMessage.channel.id}`
    );
    console.log(
        `Message ID: ${commandMessage.id}`
    );
    console.log("Waiting for Kole V4...");
    console.log("--------------------------------------");

    try {

        // ========================================================
        // FIND KOLE V4 RESPONSE
        // ========================================================

        const filter = (response) => {

            // Must be Kole V4
            if (
                response.author.id !==
                KOLE_BOT_ID
            ) {
                return false;
            }

            // Must contain "Mevcut Stok"
            const text =
                getMessageText(response);

            return /mevcut\s+stok/i.test(text);
        };

        const collected =
            await commandMessage.channel.awaitMessages({
                filter,
                max: 1,
                time: RESPONSE_TIMEOUT,
                errors: ["time"]
            });

        const response =
            collected.first();

        if (!response) {

            console.log(
                "❌ No Kole V4 response."
            );

            return;
        }

        const responseText =
            getMessageText(response);

        console.log("");
        console.log("KOLE V4 RESPONSE:");
        console.log(responseText);

        // ========================================================
        // PARSE STOCK
        // ========================================================

        const stock =
            parseStock(responseText);

        if (stock === null) {

            console.log(
                "❌ Could not parse stock amount."
            );

            return;
        }

        lastStock = stock;

        console.log(
            `💰 STOCK: ${formatStock(stock)}M`
        );

        // ========================================================
        // STOCK AVAILABLE
        // ========================================================

        if (stock > 0) {

            console.log(
                "🟢 STOCK AVAILABLE"
            );

            // Ping only once per stock cycle
            if (!stockAlerted) {

                await sendStockAlert(
                    stock
                );

                stockAlerted = true;

                lastAlert = new Date();

                console.log(
                    "🔔 ALERT SENT!"
                );

            } else {

                console.log(
                    "Already alerted for this stock cycle."
                );

                // Still show the stock, but DON'T ping
                await sendStockStatus(
                    stock,
                    false
                );
            }

            return;
        }

        // ========================================================
        // STOCK EMPTY
        // ========================================================

        console.log(
            "🔴 STOCK EMPTY - no ping."
        );

        // Tell the channel that stock is empty
        await sendStockStatus(
            stock,
            false
        );

        // Reset alert cycle
        stockAlerted = false;

    } catch (error) {

        if (error.code === "time") {

            console.log(
                "⏱️ Kole V4 did not respond " +
                "within 15 seconds."
            );

        } else {

            console.error(
                "❌ Stock response error:",
                error
            );
        }

    } finally {

        waitingForResponse = false;
    }
}

// ============================================================
// GET MESSAGE TEXT
// ============================================================

function getMessageText(message) {

    let text =
        message.content || "";

    // Read embed information too
    for (const embed of message.embeds) {

        if (embed.title) {
            text += "\n" + embed.title;
        }

        if (embed.description) {
            text += "\n" + embed.description;
        }

        if (embed.author?.name) {
            text += "\n" + embed.author.name;
        }

        if (embed.footer?.text) {
            text += "\n" + embed.footer.text;
        }

        if (embed.fields) {

            for (
                const field of embed.fields
            ) {

                if (field.name) {
                    text +=
                        "\n" + field.name;
                }

                if (field.value) {
                    text +=
                        "\n" + field.value;
                }
            }
        }
    }

    return text;
}

// ============================================================
// PARSE STOCK
// ============================================================

function parseStock(text) {

    /*
        Examples:

        Mevcut Stok: 0.0M OwO
        Mevcut Stok: 0.5M OwO
        Mevcut Stok: 500.0M OwO
        Mevcut Stok: 1,461.0M OwO
    */

    const match =
        text.match(
            /Mevcut\s+Stok\s*:\s*([\d.,]+)\s*M/i
        );

    if (!match) {
        return null;
    }

    const stock =
        Number(
            match[1].replace(/,/g, "")
        );

    if (!Number.isFinite(stock)) {
        return null;
    }

    return stock;
}

// ============================================================
// FORMAT STOCK
// ============================================================

function formatStock(stock) {

    return stock.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1
        }
    );
}

// ============================================================
// SEND STOCK ALERT
// ============================================================

async function sendStockAlert(stock) {

    if (!trackingChannel) {
        return;
    }

    const timestamp =
        Math.floor(
            Date.now() / 1000
        );

    const alertMessage =
        `🚨 <@${ALERT_USER_ID}> **STOCK AVAILABLE!** 🚨\n\n` +
        `💰 **Current Stock:** ` +
        `${formatStock(stock)}M OwO\n` +
        `⏰ **Detected:** ` +
        `<t:${timestamp}:F>`;

    await trackingChannel.send({

        content: alertMessage,

        allowedMentions: {
            users: [ALERT_USER_ID]
        }
    });
}

// ============================================================
// SEND STOCK STATUS WITHOUT PING
// ============================================================

async function sendStockStatus(
    stock,
    ping = false
) {

    if (!trackingChannel) {
        return;
    }

    const timestamp =
        Math.floor(
            Date.now() / 1000
        );

    let message;

    if (stock > 0) {

        message =
            `🟢 **Stock Available**\n` +
            `💰 Current Stock: ` +
            `**${formatStock(stock)}M OwO**\n` +
            `⏰ <t:${timestamp}:F>`;

    } else {

        message =
            `🔴 **No Stock**\n` +
            `💰 Current Stock: ` +
            `**${formatStock(stock)}M OwO**\n` +
            `⏰ <t:${timestamp}:F>`;
    }

    await trackingChannel.send({

        content: message,

        allowedMentions: ping
            ? {
                  users: [ALERT_USER_ID]
              }
            : {
                  parse: []
              }
    });
}

// ============================================================
// STOP TRACKER
// ============================================================

function stopTracker() {

    trackerRunning = false;

    waitingForResponse = false;

    trackingChannel = null;

    stockAlerted = false;

    console.log("");
    console.log("======================================");
    console.log("TRACKER STOPPED");
    console.log("======================================");
}

// ============================================================
// ERROR HANDLING
// ============================================================

process.on(
    "unhandledRejection",
    (error) => {

        console.error(
            "Unhandled promise rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    (error) => {

        console.error(
            "Uncaught exception:",
            error
        );
    }
);

// ============================================================
// LOGIN
// ============================================================

if (!TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
}

client.login(TOKEN);
