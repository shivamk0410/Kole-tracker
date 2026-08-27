# Kole V4 Stock Tracker

A Discord bot that checks Kole V4 stock every 30 minutes.

## Commands

!trackstart
Starts the tracker in the channel where the command is used.

!trackstop
Stops the tracker.

!trackstatus
Shows tracker status.

!tracknow
Immediately checks Kole V4 stock.

## How it works

When !trackstart is used:

1. The bot remembers that channel.
2. Every 30 minutes it sends !stok.
3. It waits for Kole V4.
4. It checks the "Mevcut Stok" value.
5. If stock is greater than 0, it mentions the configured user.
6. It does not repeatedly mention the user while stock remains available.
7. When stock reaches 0, the alert is reset.
8. The next stock availability triggers another mention.

## Requirements

Node.js 18.17 or newer.

The Discord bot requires:

- View Channel
- Send Messages
- Read Message History

Message Content Intent must also be enabled.

## Install

npm install

## Start

npm start
