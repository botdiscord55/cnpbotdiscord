const { MessageFlagsBitField } = require('discord.js');

const REFRESH_MS = 10 * 60 * 1000;

function cards(client) {
    if (!client._plantillasCards) client._plantillasCards = new Map();
    return client._plantillasCards;
}

function track(client, message, build) {
    if (!client || !message || !build) return;
    cards(client).set(message.id, { channelId: message.channelId, build });

    if (!client._plantillasRefresh) {
        client._plantillasRefresh = setInterval(() => refreshAll(client), REFRESH_MS);
        if (client._plantillasRefresh.unref) client._plantillasRefresh.unref();
    }
}

async function refreshAll(client) {
    const map = cards(client);
    if (!map.size) return;

    for (const [id, entry] of map) {
        try {
            const channel = await client.channels.fetch(entry.channelId);
            const message = await channel.messages.fetch(id);
            const { components } = entry.build();
            await message.edit({ components, flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        } catch {
            map.delete(id);
        }
    }
}

module.exports = { track, refreshAll };
