const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');
const { loadDB, updateOposicion, getOposicion } = require('../database/oposiciones');

const GRACIA_MS = 6 * 60 * 60 * 1000;
const SIN_FECHA_MS = 7 * 24 * 60 * 60 * 1000;
const INTERVALO_MS = 30 * 60 * 1000;
const PRIMERA_REVISION_MS = 60 * 1000;

let intervalo = null;
let barriendo = false;

function fechaProgramada(op) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(op.fecha || '').trim());
    const h = /^(\d{1,2}):(\d{2})$/.exec(String(op.hora || '').trim());
    if (!m || !h) return null;
    const dt = new Date(+m[3], +m[2] - 1, +m[1], +h[1], +h[2], 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
}

function vencimiento(op, ahora = Date.now()) {
    if (op.estado === 'en_curso') {
        let inicio = Date.parse(op.fechaInicio);
        if (isNaN(inicio)) inicio = Date.parse(op.fechaCreacion);
        if (!isNaN(inicio) && ahora - inicio > GRACIA_MS) {
            return {
                motivoBD: 'Cancelada automáticamente - 6 horas en curso sin finalizar',
                aviso: `La oposición **${op.code}** ha sido cancelada automáticamente tras superar las 6 horas de duración.`,
            };
        }
        return null;
    }
    if (op.estado === 'pendiente') {
        const programada = fechaProgramada(op);
        if (programada) {
            if (ahora - programada.getTime() > GRACIA_MS) {
                return {
                    motivoBD: 'Cancelada automáticamente - convocatoria no iniciada (fecha/hora pasados)',
                    aviso: `La convocatoria **${op.code}** (prevista para el ${op.fecha} a las ${op.hora}) no se inició y ha sido cancelada automáticamente.`,
                };
            }
            return null;
        }
        const creada = Date.parse(op.fechaCreacion);
        if (!isNaN(creada) && ahora - creada > SIN_FECHA_MS) {
            return {
                motivoBD: 'Cancelada automáticamente - convocatoria caducada (7 días sin fecha)',
                aviso: `La convocatoria **${op.code}** ha sido cancelada automáticamente (7 días sin fecha confirmada).`,
            };
        }
        return null;
    }
    return null;
}

async function avisar(client, titulo, texto, acento) {
    try {
        const canal = await client.channels.fetch(process.env.canaloposicion_pendiente);
        const container = new ContainerBuilder()
            .setAccentColor(acento)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} ${titulo}`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(texto));
        await canal.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        return true;
    } catch {
        return false;
    }
}

async function limpiarCanal(client) {
    try {
        const canal = await client.channels.fetch(process.env.canaloposicion_pendiente);
        let lastId;
        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            const messages = await canal.messages.fetch(options);
            if (messages.size === 0) break;
            for (const [, msg] of messages) {
                try { await msg.delete(); } catch {}
            }
            lastId = messages.last().id;
            if (messages.size < 100) break;
        }
        return true;
    } catch {
        return false;
    }
}

async function cerrarVencidas(client) {
    if (barriendo) return { cerradas: [], ocupado: true };
    barriendo = true;
    const cerradas = [];
    try {
        const db = loadDB();
        for (const op of Object.values(db)) {
            const v = vencimiento(op);
            if (!v) continue;
            updateOposicion(op.code, {
                estado: 'cancelada',
                fechaFin: new Date().toISOString(),
                motivoCancelacion: v.motivoBD,
            });
            const enviado = await avisar(client, 'OPOSICIÓN CANCELADA', v.aviso, 0xed4245);
            cerradas.push(op.code);
            console.log(`[Oposiciones] 🔒 ${op.code} cerrada automáticamente (${v.motivoBD})${enviado ? '' : ' · aviso al canal no enviado'}.`);
        }
    } finally {
        barriendo = false;
    }
    return { cerradas, ocupado: false };
}

async function cerrarOposicionManual(client, code) {
    const op = getOposicion(code);
    if (!op) return { error: `No existe ninguna oposición con el código ${code}.` };
    if (op.estado === 'finalizada') return { error: `La oposición ${code} ya está finalizada.` };
    if (op.estado === 'cancelada') {
        return { error: `La oposición ${code} ya está cancelada${op.motivoCancelacion ? ` (${op.motivoCancelacion})` : ''}.` };
    }

    const ahora = new Date();
    const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()}`;
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (op.estado === 'en_curso') {
        updateOposicion(code, {
            estado: 'finalizada',
            fecha,
            hora,
            fechaFin: ahora.toISOString(),
        });
        await limpiarCanal(client);
        await avisar(
            client,
            'CONVOCATORIA FINALIZADA',
            `La convocatoria del **${fecha}** ha finalizado a las **${hora}**. (Cerrada desde la consola.)`,
            0x2b2d31
        );
        return { ok: true, estado: 'finalizada' };
    }

    updateOposicion(code, {
        estado: 'cancelada',
        fechaFin: ahora.toISOString(),
        motivoCancelacion: 'Cerrada manualmente desde consola (convocatoria no iniciada)',
    });
    await limpiarCanal(client);
    await avisar(client, 'OPOSICIÓN CANCELADA', `La convocatoria **${code}** ha sido cerrada desde la consola (convocatoria no iniciada).`, 0xed4245);
    return { ok: true, estado: 'cancelada' };
}

function iniciarSweepOposiciones(client) {
    if (intervalo) clearInterval(intervalo);
    console.log('[Oposiciones] Cierre automático activo: primera revisión a los 60 s y después cada 30 min (o escribe "cerraroposiciones").');
    const revisar = () => cerrarVencidas(client).catch(e => console.log(`[Oposiciones] ⚠ Error al cerrar vencidas: ${e.message}`));
    const primero = setTimeout(revisar, PRIMERA_REVISION_MS);
    if (primero.unref) primero.unref();
    intervalo = setInterval(revisar, INTERVALO_MS);
    if (intervalo.unref) intervalo.unref();
}

module.exports = { cerrarVencidas, cerrarOposicionManual, iniciarSweepOposiciones };
