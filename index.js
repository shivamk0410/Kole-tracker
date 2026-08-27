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

// Your Discord user ID
const OWNER_ID = "991975250004811776";

// Account that sends !stok
const STOCK_ACCOUNT_ID = "991975250004811776";

// User to ping when stock is available
const ALERT_USER_ID = "991975250004811776";

// Kole V4 bot
const KOLE_BOT_ID = "1154503721963769876";

// Tracking channel
const TRACKING_CHANNEL_ID = "1372075790799470673";

// Maximum time to wait for Kole V4
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

let trackerRunning = true;

let trackingChannel = null;

let waitingForResponse = false;

let lastStock = null;

let lastCheck = null;

let lastAlert = null;

// Prevent repeated pings while stock remains above 0
let stockAlerted = false;


// ============================================================
// BOT READY
// ============================================================

client.once("ready", async () => {

    console.log("");
    console.log("======================================");
    console.log("       KOLE V4 STOCK TRACKER");
    console.log("======================================");

    console.log(
        `Logged in as: ${client.user.tag}`
    );

    console.log(
        `Bot ID: ${client.user.id}`
    );

    console.log(
        `Watching account: ${STOCK_ACCOUNT_ID}`
    );

    console.log(
        `Alert user: ${ALERT_USER_ID}`
    );

    console.log(
        `Kole V4 ID: ${KOLE_BOT_ID}`
    );

    console.log(
        `Tracking channel: ${TRACKING_CHANNEL_ID}`
    );


    try {

        trackingChannel =
            await client.channels.fetch(
                TRACKING_CHANNEL_ID
            );

        console.log(
            "Channel loaded successfully."
        );

        console.log("");

        console.log(
            "🟢 TRACKER IS RUNNING"
        );

        console.log(
            "Waiting for automated !stok..."
        );

        console.log(
            "The tracker will NOT send !stok."
        );

        console.log(
            "======================================"
        );

    } catch (error) {

        console.error(
            "❌ Could not load tracking channel:",
            error
        );
    }
});


// ============================================================
// MESSAGE LISTENER
// ============================================================

client.on(
    "messageCreate",
    async (message) => {

        try {

            // ==================================================
            // DETECT !stok FROM AUTOMATED ACCOUNT
            // ==================================================

            if (
                trackerRunning &&
                message.author.id === STOCK_ACCOUNT_ID &&
                message.channel.id === TRACKING_CHANNEL_ID &&
                message.content.trim().toLowerCase() === "!stok"
            ) {

                console.log("");

                console.log(
                    "📨 !stok detected."
                );

                console.log(
                    `From account: ${message.author.id}`
                );

                await handleStockCommand(
                    message
                );

                return;
            }


            // ==================================================
            // IGNORE BOT MESSAGES FOR CONTROL COMMANDS
            // ==================================================

            if (message.author.bot) {
                return;
            }


            // ==================================================
            // OWNER ONLY
            // ==================================================

            if (
                message.author.id !== OWNER_ID
            ) {
                return;
            }


            const command =
                message.content
                    .trim()
                    .toLowerCase();


            // ==================================================
            // !trackstart
            // ==================================================

            if (
                command === "!trackstart"
            ) {

                trackerRunning = true;

                waitingForResponse = false;

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
                        "Could not fetch channel:",
                        error
                    );
                }


                await message.reply(
                    "🟢 **Kole V4 stock tracker started!**\n\n" +
                    "⏰ Checking whenever the automated account sends `!stok`.\n" +
                    `📍 Channel: <#${TRACKING_CHANNEL_ID}>\n` +
                    `👤 Watching: <@${STOCK_ACCOUNT_ID}>\n` +
                    `🔔 Alert: <@${ALERT_USER_ID}>`
                );


                console.log(
                    "🟢 TRACKER STARTED"
                );

                return;
            }


            // ==================================================
            // !trackstop
            // ==================================================

            if (
                command === "!trackstop"
            ) {

                trackerRunning = false;

                waitingForResponse = false;


                await message.reply(
                    "🔴 **Kole V4 stock tracker stopped.**"
                );


                console.log(
                    "🔴 TRACKER STOPPED"
                );

                return;
            }


            // ==================================================
            // !trackstatus
            // ==================================================

            if (
                command === "!trackstatus"
            ) {

                const status =
                    trackerRunning
                        ? "🟢 RUNNING"
                        : "🔴 STOPPED";


                const stockText =
                    lastStock === null
                        ? "No check yet"
                        : `${formatStock(lastStock)}M`;


                const lastCheckText =
                    lastCheck
                        ? `<t:${Math.floor(
                            lastCheck.getTime() / 1000
                        )}:R>`
                        : "Never";


                const alertText =
                    stockAlerted
                        ? "🔔 Alert already sent"
                        : "Waiting for stock";


                await message.reply(
                    "📡 **Kole V4 Stock Tracker**\n\n" +
                    `Status: ${status}\n` +
                    `Channel: <#${TRACKING_CHANNEL_ID}>\n` +
                    `Watching: <@${STOCK_ACCOUNT_ID}>\n` +
                    `Last stock: **${stockText}**\n` +
                    `Last check: ${lastCheckText}\n` +
                    `Alert: ${alertText}`
                );

                return;
            }


            // ==================================================
            // !tracknow
            // ==================================================

            if (
                command === "!tracknow"
            ) {

                await message.reply(
                    "👀 **Tracker is active.**\n\n" +
                    `Waiting for <@${STOCK_ACCOUNT_ID}> to send ` +
                    `\`!stok\` in <#${TRACKING_CHANNEL_ID}>.`
                );

                return;
            }

        } catch (error) {

            console.error(
                "❌ Message handler error:",
                error
            );
        }
    }
);


// ============================================================
// HANDLE !STOK
// ============================================================

async function handleStockCommand(
    commandMessage
) {

    if (
        waitingForResponse
    ) {

        console.log(
            "⏳ Already waiting for a Kole V4 response."
        );

        return;
    }


    waitingForResponse = true;

    lastCheck = new Date();


    console.log("");
    console.log("--------------------------------------");

    console.log(
        `!stok detected at ${lastCheck.toLocaleString()}`
    );

    console.log(
        "Waiting for Kole V4..."
    );

    console.log("--------------------------------------");


    try {

        // ====================================================
        // WAIT FOR KOLE V4 RESPONSE
        // ====================================================

        const filter = (
            response
        ) => {

            // Must be Kole V4
            if (
                response.author.id !== KOLE_BOT_ID
            ) {
                return false;
            }


            const text =
                getMessageText(
                    response
                );


            // Must contain Mevcut Stok
            return /mevcut\s+stok/i.test(
                text
            );
        };


        const collected =
            await commandMessage.channel.awaitMessages(
                {
                    filter,
                    max: 1,
                    time: RESPONSE_TIMEOUT,
                    errors: ["time"]
                }
            );


        const response =
            collected.first();


        if (!response) {

            console.log(
                "❌ Kole V4 did not respond."
            );

            return;
        }


        // ====================================================
        // READ RESPONSE
        // ====================================================

        const responseText =
            getMessageText(
                response
            );


        console.log("");

        console.log(
            "🤖 KOLE V4 RESPONSE:"
        );

        console.log(
            responseText
        );


        // ====================================================
        // PARSE STOCK
        // ====================================================

        const stock =
            parseStock(
                responseText
            );


        if (
            stock === null
        ) {

            console.log(
                "❌ Could not read stock amount."
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

        if (
            stock > 0
        ) {

            console.log(
                "🟢 STOCK AVAILABLE"
            );


            // Only ping once until stock goes back to 0
            if (
                !stockAlerted
            ) {

                await sendStockAlert(
                    stock
                );


                stockAlerted = true;

                lastAlert =
                    new Date();


                console.log(
                    "🔔 PING SENT!"
                );

            } else {

                console.log(
                    "🔕 Already alerted."
                );
            }


            return;
        }


        // ====================================================
        // NO STOCK
        // ====================================================

        console.log(
            "🔴 NO STOCK"
        );


        await sendNoStockMessage(
            stock
        );


        // Reset alert so the next stock availability
        // can trigger another ping
        stockAlerted = false;


    } catch (error) {

        if (
            error.code === "time"
        ) {

            console.log(
                "⏱️ Kole V4 did not respond within 15 seconds."
            );

        } else {

            console.error(
                "❌ Stock listener error:",
                error
            );
        }

    } finally {

        waitingForResponse = false;
    }
}


// ============================================================
// GET TEXT FROM DISCORD MESSAGE
// ============================================================

function getMessageText(
    message
) {

    let text =
        message.content || "";


    // ========================================================
    // EMBEDS
    // ========================================================

    for (
        const embed of message.embeds
    ) {

        if (
            embed.title
        ) {

            text +=
                "\n" +
                embed.title;
        }


        if (
            embed.description
        ) {

            text +=
                "\n" +
                embed.description;
        }


        if (
            embed.author?.name
        ) {

            text +=
                "\n" +
                embed.author.name;
        }


        if (
            embed.footer?.text
        ) {

            text +=
                "\n" +
                embed.footer.text;
        }


        if (
            embed.fields
        ) {

            for (
                const field of embed.fields
            ) {

                if (
                    field.name
                ) {

                    text +=
                        "\n" +
                        field.name;
                }


                if (
                    field.value
                ) {

                    text +=
                        "\n" +
                        field.value;
                }
            }
        }
    }


    return text;
}


// ============================================================
// PARSE STOCK
// ============================================================

function parseStock(
    text
) {

    /*
        Supports:

        Mevcut Stok: 0.0M OwO

        **Mevcut Stok:** 0.0M OwO

        **Mevcut Stok:** `0.0M` OwO

        Mevcut Stok: `500.0M` OwO

        **Mevcut Stok:** `1,461.0M` OwO
    */


    if (
        !text
    ) {

        return null;
    }


    // Normalize whitespace
    const normalized =
        text
            .replace(/\r/g, " ")
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();


    console.log(
        `🔎 Parsing normalized response: ${normalized}`
    );


    /*
        Important:

        The current Kole V4 response is:

        **Mevcut Stok:** `0.0M` OwO

        So we allow:
        - **
        - spaces
        - :
        - `
        - number
        - commas
        - M
    */

    const match =
        normalized.match(
            /mevcut\s+stok\s*\*{0,2}\s*:\s*\*{0,2}\s*`?\s*([\d.,]+)\s*M\s*`?/i
        );


    if (
        !match
    ) {

        console.log(
            "❌ Stock regex did not match."
        );

        return null;
    }


    const numberText =
        match[1]
            .replace(/,/g, "");


    const stock =
        Number(
            numberText
        );


    if (
        !Number.isFinite(stock)
    ) {

        return null;
    }


    console.log(
        `✅ Parsed stock successfully: ${stock}M`
    );


    return stock;
}


// ============================================================
// FORMAT STOCK
// ============================================================

function formatStock(
    stock
) {

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

async function sendStockAlert(
    stock
) {

    if (
        !trackingChannel
    ) {

        console.log(
            "❌ Tracking channel unavailable."
        );

        return;
    }


    const timestamp =
        Math.floor(
            Date.now() / 1000
        );


    const content =
        `🚨 <@${ALERT_USER_ID}> **STOCK AVAILABLE!** 🚨\n\n` +
        `💰 **Current Stock:** ` +
        `**${formatStock(stock)}M OwO**\n` +
        `⏰ **Detected:** ` +
        `<t:${timestamp}:F>`;


    await trackingChannel.send(
        {
            content,

            allowedMentions: {
                users: [
                    ALERT_USER_ID
                ]
            }
        }
    );
}


// ============================================================
// SEND NO STOCK MESSAGE
// ============================================================

async function sendNoStockMessage(
    stock
) {

    if (
        !trackingChannel
    ) {

        console.log(
            "❌ Tracking channel unavailable."
        );

        return;
    }


    const timestamp =
        Math.floor(
            Date.now() / 1000
        );


    const content =
        `🔴 **No Stock**\n` +
        `💰 **Current Stock:** ` +
        `**${formatStock(stock)}M OwO**\n` +
        `⏰ **Checked:** ` +
        `<t:${timestamp}:F>`;


    await trackingChannel.send(
        {
            content,

            // Absolutely no ping
            allowedMentions: {
                parse: []
            }
        }
    );
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

if (
    !TOKEN
) {

    console.error(
        "❌ DISCORD_TOKEN is missing."
    );

    process.exit(1);
}


client.login(
    TOKEN
);
