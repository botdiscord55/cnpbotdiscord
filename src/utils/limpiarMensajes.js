async function limpiarMensajes(client, channelId, cantidad) {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.messages) throw new Error('No se encontró el canal.');

    let borrados = 0;
    let fallidos = 0;
    let lastId = null;

    while (borrados + fallidos < cantidad) {
        const batch = await channel.messages.fetch(lastId ? { limit: 100, before: lastId } : { limit: 100 });
        if (!batch || !batch.size) break;
        for (const msg of batch.values()) {
            if (borrados + fallidos >= cantidad) break;
            try {
                await msg.delete();
                borrados++;
            } catch {
                fallidos++;
            }
        }
        if (batch.size < 100) break;
        lastId = batch.last().id;
    }

    return { borrados, fallidos, solicitados: cantidad };
}

function parsearEnlaceMensaje(texto) {
    const m = /^https:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/(\d{15,21})\/(\d{15,21})\/(\d{15,21})\/?$/.exec(String(texto).trim());
    if (!m) return null;
    return { guildId: m[1], channelId: m[2], messageId: m[3] };
}

async function borrarEn(client, channelId, messageId) {
    try {
        const channel = await client.channels.fetch(channelId);
        const msg = await channel.messages.fetch(messageId);
        await msg.delete();
        return { ok: true, channelId, messageId };
    } catch (e) {
        return { ok: false, channelId, messageId, error: e.message };
    }
}

function canalesConocidos() {
    return [
        process.env.canalregistro_plantillaenviar,
        process.env.canalregistros_vetos,
        process.env.canallogs,
    ].filter(Boolean);
}

async function limpiarMensaje(client, args) {
    const tokens = args.map(a => String(a).trim()).filter(Boolean);
    if (!tokens.length) {
        return { ok: false, error: 'usa un enlace de mensaje, <id_canal> <id_mensaje> o solo el id del mensaje' };
    }

    const enlace = parsearEnlaceMensaje(tokens.join(' '));
    if (enlace) {
        return borrarEn(client, enlace.channelId, enlace.messageId);
    }

    if (tokens.length >= 2 && /^\d{15,21}$/.test(tokens[0]) && /^\d{15,21}$/.test(tokens[1])) {
        return borrarEn(client, tokens[0], tokens[1]);
    }

    if (tokens.length === 1 && /^\d{15,21}$/.test(tokens[0])) {
        for (const cid of canalesConocidos()) {
            try {
                const r = await borrarEn(client, cid, tokens[0]);
                if (r.ok) return { ...r, origen: 'buscado' };
            } catch {}
        }
        return {
            ok: false,
            error: 'mensaje no encontrado en los canales conocidos; usa el enlace completo (https://discord.com/channels/<servidor>/<canal>/<mensaje>)',
        };
    }

    return { ok: false, error: 'usa un enlace de mensaje, <id_canal> <id_mensaje> o solo el id del mensaje' };
}

module.exports = { limpiarMensajes, limpiarMensaje, parsearEnlaceMensaje };
