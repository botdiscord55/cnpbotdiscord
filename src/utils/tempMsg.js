const TTL_MS = 3 * 60 * 1000;

const timers = new Map();

function programarBorrado(message, ttlMs = TTL_MS) {
    if (!message || !message.id || !message.channelId) return;
    const key = `${message.channelId}:${message.id}`;
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
        timers.delete(key);
        try {
            await message.delete();
        } catch {}
    }, ttlMs);
    if (typeof t.unref === 'function') t.unref();
    timers.set(key, t);
}

function cancelarBorrado(channelId, messageId) {
    const key = `${channelId}:${messageId}`;
    const prev = timers.get(key);
    if (prev) {
        clearTimeout(prev);
        timers.delete(key);
    }
}

module.exports = { programarBorrado, cancelarBorrado, TTL_MS };
