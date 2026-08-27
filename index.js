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

// Owner allowed to use tracker control commands
const OWNER_ID = "855383662068891668";

// The account used by Autosender to send !stok
const STOCK_ACCOUNT_ID = "991975250004811776";

// Account that should be pinged when stock is available
const ALERT_USER_ID = "991975250004811776";

// Kole V4 bot ID
const KOLE_BOT_ID = "1154503721963769876";

// EXACT channel where the automation is running
const TRACKING_CHANNEL_ID = "1372075790799470673";

// How long to wait for Kole V4 to answer
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

// Automatically enabled when the bot starts
let trackerRunning = true;

let trackingChannel = null;

let waitingForResponse = false;

let lastStock = null;

let lastCheck = null;

let lastAlert = null;

// True after we have already pinged for the current
// positive-stock cycle.
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
        `Kole V4 ID: ${KOLE_BOT_ID}`
    );

    console.log(
        `Tracking channel: ${TRACKING_CHANNEL_ID}`
    );

    console.log("--------------------------------------");

    try {

        trackingChannel =
            await client.channels.fetch(
                TRACKING_CHANNEL_ID
            );

        if (!trackingChannel) {

            console.error(
                "❌ Tracking channel not found."
            );

            return;
        }

        console.log(
            `Channel loaded: ${
                trackingChannel.name ||
                TRACKING_CHANNEL_ID
            }`
        );

        console.log("");
        console.log(
            "🟢 TRACKER AUTOMATICALLY RUNNING"
        );

        console.log(
            "Waiting for Autosender to send !stok..."
        );

        console.log(
            "The tracker will NOT send !stok itself."
        );

        console.log(
            "======================================"
        );

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

client.on(
    "messageCreate",
    async (message) => {

        try {

            // ====================================================
            // WATCH THE AUTOMATED ACCOUNT
            // ====================================================

            if (
                trackerRunning &&
                message.author.id ===
                    STOCK_ACCOUNT_ID &&
                message.channel.id ===
                    TRACKING_CHANNEL_ID &&
                message.content
                    .trim()
                    .toLowerCase() === "!stok"
            ) {

                console.log("");
                console.log(
                    "📨 !stok detected from automated account."
                );

                await handleAutomatedStockCommand(
                    message
                );

                return;
            }


            // ====================================================
            // IGNORE BOTS FOR OWNER COMMANDS
            // ====================================================

            if (message.author.bot) {
                return;
            }


            // ====================================================
            // OWNER ONLY COMMANDS
            // ====================================================

            if (
                message.author.id !==
                OWNER_ID
            ) {
                return;
            }


            const command =
                message.content
                    .trim()
                    .toLowerCase();


            // ====================================================
            // !trackstart
            // ====================================================

            if (
                command === "!trackstart"
            ) {

                if (trackerRunning) {

                    await message.reply(
                        "🟢 **Tracker is already running.**\n\n" +
                        `Watching <@${STOCK_ACCOUNT_ID}> in ` +
                        `<#${TRACKING_CHANNEL_ID}>.`
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


                console.log(
                    "🟢 TRACKER STARTED"
                );

                return;
            }


            // ====================================================
            // !trackstop
            // ====================================================

            if (
                command === "!trackstop"
            ) {

                if (!trackerRunning) {

                    await message.reply(
                        "🔴 **Tracker is already stopped.**"
                    );

                    return;
                }


                stopTracker();


                await message.reply(
                    "🔴 **Kole V4 stock listener stopped.**"
                );

                return;
            }


            // ====================================================
            // !trackstatus
            // ====================================================

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
                        : `${formatStock(
                              lastStock
                          )}M`;


                const lastCheckText =
                    lastCheck
                        ? `<t:${Math.floor(
                              lastCheck.getTime() /
                                  1000
                          )}:R>`
                        : "Never";


                const alertText =
                    stockAlerted
                        ? "🔔 Alert already sent"
                        : "Waiting for stock";


                await message.reply(
                    "📡 **Kole V4 Stock Tracker**\n\n" +
                    `Status: ${status}\n` +
                    `Watching: <@${STOCK_ACCOUNT_ID}>\n` +
                    `Channel: <#${TRACKING_CHANNEL_ID}>\n` +
                    `Last stock: **${stockText}**\n` +
                    `Last check: ${lastCheckText}\n` +
                    `Alert state: ${alertText}`
                );

                return;
            }


            // ====================================================
            // !tracknow
            // ====================================================

            if (
                command === "!tracknow"
            ) {

                await message.reply(
                    "👀 **Tracker is listening.**\n\n" +
                    `Waiting for <@${STOCK_ACCOUNT_ID}> to send ` +
                    "`!stok` in <#" +
                    TRACKING_CHANNEL_ID +
                    ">.\n\n" +
                    "I will then read Kole V4's response."
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
// HANDLE !STOK FROM AUTOSENDER
// ============================================================

async function handleAutomatedStockCommand(
    commandMessage
) {

    // Make sure we are using the exact channel
    if (
        commandMessage.channel.id !==
        TRACKING_CHANNEL_ID
    ) {

        console.log(
            "Ignoring !stok from wrong channel."
        );

        return;
    }


    // Make sure channel object exists
    if (!trackingChannel) {

        trackingChannel =
            commandMessage.channel;
    }


    // Prevent overlapping checks
    if (waitingForResponse) {

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
        `🟡 !stok detected at: ${
            lastCheck.toLocaleString()
        }`
    );

    console.log(
        `Channel: ${TRACKING_CHANNEL_ID}`
    );

    console.log(
        `Message ID: ${commandMessage.id}`
    );

    console.log(
        "Waiting for Kole V4 response..."
    );

    console.log("--------------------------------------");


    try {

        // ========================================================
        // WAIT FOR KOLE V4
        // ========================================================

        const filter = (
            response
        ) => {

            // Must be Kole V4
            if (
                response.author.id !==
                KOLE_BOT_ID
            ) {

                return false;
            }


            // Read normal message + embeds
            const text =
                getMessageText(response);


            // Must contain "Mevcut Stok"
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


        // ========================================================
        // READ KOLE RESPONSE
        // ========================================================

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


        // ========================================================
        // PARSE STOCK
        // ========================================================

        const stock =
            parseStock(
                responseText
            );


        if (stock === null) {

            console.log(
                "❌ Could not find stock amount."
            );

            return;
        }


        lastStock = stock;


        console.log(
            `💰 Stock detected: ${formatStock(stock)}M`
        );


        // ========================================================
        // STOCK AVAILABLE
        // ========================================================

        if (stock > 0) {

            console.log(
                "🟢 STOCK AVAILABLE"
            );


            // -----------------------------------------------
            // FIRST POSITIVE RESULT
            // -----------------------------------------------

            if (!stockAlerted) {

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

                // -------------------------------------------
                // ALREADY ALERTED
                // -------------------------------------------

                console.log(
                    "🔕 Already alerted for this stock cycle."
                );

            }


            return;
        }


        // ========================================================
        // NO STOCK
        // ========================================================

        console.log(
            "🔴 NO STOCK"
        );

        console.log(
            "Sending response WITHOUT ping."
        );


        // IMPORTANT:
        // This sends a message even when stock is 0.
        //
        // allowedMentions.parse = []
        //
        // means nobody is pinged.

        await sendNoStockMessage(
            stock
        );


        // Reset alert cycle.
        //
        // Example:
        //
        // 0M
        // ↓
        // reset
        // ↓
        // 500M
        // ↓
        // ping again

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
                "❌ Stock checking error:",
                error
            );
        }

    } finally {

        waitingForResponse = false;
    }
}


// ============================================================
// GET TEXT FROM MESSAGE
// ============================================================

function getMessageText(
    message
) {

    let text =
        message.content || "";


    // Read embeds
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
// PARSE KOLE V4 STOCK
// ============================================================

function parseStock(
    text
) {

    /*
        Expected:

        Mevcut Stok: 0.0M OwO

        or:

        Mevcut Stok: 500.0M OwO

        or:

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
            match[1].replace(
                /,/g,
                ""
            )
        );


    if (
        !Number.isFinite(stock)
    ) {

        return null;
    }


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
// SEND STOCK AVAILABLE ALERT
// ============================================================

async function sendStockAlert(
    stock
) {

    if (!trackingChannel) {

        console.error(
            "❌ No tracking channel."
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

    if (!trackingChannel) {

        console.error(
            "❌ No tracking channel."
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

            // VERY IMPORTANT:
            // This prevents ANY ping.
            allowedMentions: {
                parse: []
            }
        }
    );
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
    console.log(
        "======================================"
    );

    console.log(
        "🔴 TRACKER STOPPED"
    );

    console.log(
        "======================================");
}


// ===============================
