require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials
} = require("discord.js");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

// Your Discord ID
const OWNER_ID = "855383662068891668";

// Account to ping when stock is available
const ALERT_USER_ID = "991975250004811776";

// Kole V4 bot ID
const KOLE_BOT_ID = "1154503721963769876";

// 30 minutes
const CHECK_INTERVAL = 30 * 60 * 1000;

// Wait up to 15 seconds for Kole V4 to answer
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
    partials: [
        Partials.Channel
    ]
});

// ============================================================
// TRACKER STATE
// ============================================================

let trackerRunning = false;

let trackerInterval = null;

// Channel where !trackstart was used
let trackingChannel = null;

let waitingForResponse = false;

let lastStock = null;

let lastCheck = null;

let lastAlert = null;

// Prevent repeated alerts during the same stock cycle
let stockAlerted = false;

// ============================================================
// BOT READY
// ============================================================

client.once("ready", () => {

    console.log("======================================");
    console.log("      KOLE V4 STOCK TRACKER");
    console.log("======================================");

    console.log(`Logged in as: ${client.user.tag}`);
    console.log(`Bot ID: ${client.user.id}`);

    console.log("");
    console.log("Tracker: STOPPED");
    console.log("Use !trackstart to begin.");
    console.log("======================================");
});

// ============================================================
// COMMAND HANDLER
// ============================================================

client.on("messageCreate", async (message) => {

    // Ignore bots for our own commands.
    // IMPORTANT:
    // This does NOT affect the stock-response listener below.
    if (message.author.bot) {
        return;
    }

    // Only the owner can control the tracker.
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

        // Remember the channel where the command was used.
        trackingChannel = message.channel;

        trackerRunning = true;

        stockAlerted = false;

        lastStock = null;

        lastCheck = null;

        lastAlert = null;

        await message.reply(
            "🟢 **Kole V4 stock tracker started!**\n\n" +
            "⏰ Checking every **30 minutes**.\n" +
            "📍 Channel: <#" + message.channel.id + ">\n" +
            "🔔 Alert: <@" + ALERT_USER_ID + ">"
        );

        console.log("");
        console.log("======================================");
        console.log("TRACKER STARTED");
        console.log("======================================");

        console.log(
            `Channel: ${message.channel.name}`
        );

        console.log(
            `Channel ID: ${message.channel.id}`
        );

        console.log("Interval: 30 minutes");

        console.log("======================================");

        /*
            Start the 30-minute timer.

            We intentionally DO NOT check immediately.

            First automatic check:
            30 minutes after !trackstart.
        */

        trackerInterval = setInterval(async () => {

            try {

                await checkStock();

            } catch (error) {

                console.error(
                    "Scheduled check error:",
                    error
                );
            }

        }, CHECK_INTERVAL);

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
            "🔴 **Kole V4 stock tracker stopped.**"
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

        const lastCheckText =
            lastCheck
                ? `<t:${Math.floor(lastCheck.getTime() / 1000)}:R>`
                : "Never";

        const alertText =
            stockAlerted
                ? "🔔 Already alerted"
                : "Waiting for stock";

        const channelText =
            trackingChannel
                ? `<#${trackingChannel.id}>`
                : "Not selected";

        await message.reply(
            "📡 **Kole V4 Stock Tracker**\n\n" +
            `Status: ${status}\n` +
            `Channel: ${channelText}\n` +
            "Interval: **30 minutes**\n" +
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

        if (!trackingChannel) {

            await message.reply(
                "🔴 **Tracker has not been started yet.**\n" +
                "Use `!trackstart` first."
            );

            return;
        }

        await message.reply(
            "🔎 **Checking Kole V4 now...**"
        );

        await checkStock();

        return;
    }
});

// ============================================================
// CHECK STOCK
// ============================================================

async function checkStock() {

    if (!trackerRunning) {
        return;
    }

    if (!trackingChannel) {

        console.error(
            "No tracking channel selected."
        );

        return;
    }

    if (waitingForResponse) {

        console.log(
            "Previous stock check is still running."
        );

        return;
    }

    waitingForResponse = true;

    lastCheck = new Date();

    console.log("");
    console.log("--------------------------------------");
    console.log(
        `CHECK: ${lastCheck.toLocaleString()}`
    );
    console.log("--------------------------------------");

    try {

        // ====================================================
        // SEND !stok
        // ====================================================

        const commandMessage =
            await trackingChannel.send("!stok");

        console.log(
            `!stok sent: ${commandMessage.id}`
        );

        // ====================================================
        // WAIT FOR KOLE V4
        // ====================================================

        const filter = (message) => {

            // ONLY accept Kole V4
            if (message.author.id !== KOLE_BOT_ID) {
                return false;
            }

            const text = getMessageText(message);

            // Response must contain "Mevcut Stok"
            if (!/mevcut\s+stok/i.test(text)) {
                return false;
            }

            return true;
        };

        const collected =
            await trackingChannel.awaitMessages({
                filter,
                max: 1,
                time: RESPONSE_TIMEOUT,
                errors: ["time"]
            });

        const response = collected.first();

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
        console.log("");

        // ====================================================
        // PARSE STOCK
        // ====================================================

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

        // ====================================================
        // STOCK AVAILABLE
        // ====================================================

        if (stock > 0) {

            console.log(
                "🟢 STOCK AVAILABLE"
            );

            /*
                Only alert once.

                Example:

                1461M → no repeated ping
                1400M → no repeated ping
                1200M → no repeated ping

                When it reaches 0:

                0M → reset

                Next stock:

                500M → ping again
            */

            if (!stockAlerted) {

                await sendStockAlert(stock);

                stockAlerted = true;

                lastAlert = new Date();

                console.log(
                    "🔔 ALERT SENT!"
                );

            } else {

                console.log(
                    "Already alerted for this stock cycle."
                );
            }

            return;
        }

        // ====================================================
        // STOCK EMPTY
        // ====================================================

        console.log(
            "🔴 STOCK EMPTY"
        );

        /*
            Reset the alert.

            This allows the next stock drop
            to trigger a new notification.
        */

        stockAlerted = false;

    } catch (error) {

        if (error.code === "time") {

            console.log(
                "⏱️ Kole V4 did not respond within 15 seconds."
            );

        } else {

            console.error(
                "❌ Stock check error:",
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

    let text = message.content || "";

    // Check embeds too.
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

            for (const field of embed.fields) {

                if (field.name) {
                    text += "\n" + field.name;
                }

                if (field.value) {
                    text += "\n" + field.value;
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
        Kole V4 examples:

        Mevcut Stok: 0.0M OwO

        Mevcut Stok: 0.5M OwO

        Mevcut Stok: 1,461.0M OwO
    */

    const match = text.match(
        /Mevcut\s+Stok\s*:\s*([\d.,]+)\s*M/i
    );

    if (!match) {
        return null;
    }

    let numberText = match[1];

    // Remove commas.

    numberText =
        numberText.replace(/,/g, "");

    const stock =
        Number(numberText);

    if (!Number.isFinite(stock)) {
        return null;
    }

    return stock;
}

// ============================================================
// FORMAT STOCK
// ============================================================

function formatStock(stock) {

    return stock.toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
}

// ============================================================
// SEND ALERT
// ============================================================

async function sendStockAlert(stock) {

    if (!trackingChannel) {
        return;
    }

    const timestamp =
        Math.floor(Date.now() / 1000);

    const alertMessage =
        `🚨 <@${ALERT_USER_ID}> **STOCK AVAILABLE!** 🚨\n\n` +
        `💰 **Current Stock:** ${formatStock(stock)}M OwO\n` +
        `⏰ **Detected:** <t:${timestamp}:F>`;

    await trackingChannel.send({
        content: alertMessage,

        allowedMentions: {
            users: [ALERT_USER_ID]
        }
    });
}

// ============================================================
// STOP TRACKER
// ============================================================

function stopTracker() {

    trackerRunning = false;

    if (trackerInterval) {

        clearInterval(trackerInterval);

        trackerInterval = null;
    }

    waitingForResponse = false;

    trackingChannel = null;

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
