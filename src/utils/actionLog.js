const { EmbedBuilder, MessageFlagsBitField } = require('discord.js');
const { getPlantilla } = require('../database/plantillas');
const { getVeto, getVetoByUser } = require('../database/vetos');
const { textoMensaje } = require('./limpiarTest');
const { esTestMsg } = require('../database/testmsgs');

const COLORS = {
    ok: 0x57f287,
    error: 0xed4245,
    warning: 0xfee75c,
};

const ACTION_NAMES = {
    'reclamar_': 'reclamar',
    'modal_retirar_': 'retirar',
    'modal_denegar_': 'denegar la plantilla',
    'envio_liccond_': 'responder el formulario de licencias',
    'envio_licarmas_': 'responder el formulario de licencias',
    'envio_multas_': 'responder el formulario de licencias',
    'autorizar_': 'autorizar el veto',
    'rechazar_plantilla_': 'denegar el veto',
    'tvrr_': 'revocar el veto',
    'toggle_veto_cancel_': 'cancelar el cambio de veto',
    'quitar_veto_': 'quitar el veto',
    'modal_quitar_veto_': 'quitar el veto',
    'aceptar_oposicion|': 'aceptar la solicitud de oposición',
    'denegar_oposicion_': 'denegar la solicitud de oposición',
    'iniciar_oposicion_': 'iniciar la convocatoria',
    'finalizar_oposicion_': 'finalizar la convocatoria',
    'modal_cancelar_oposicion_': 'cancelar la oposición',
    'descargar_lista_': 'descargar la lista',
    'desactivar_unirse_': 'desactivar las inscripciones',
    'reactivar_unirse_': 'reactivar las inscripciones',
    'unirse_convocatoria_': 'unirse a la convocatoria',
    'modal_sugerencia_oposicion_': 'enviar una sugerencia',
    'plantillas_reg_': 'abrir los registros de plantillas',
    'plantillas_nav_': 'navegar por los registros de plantillas',
    'plantillas_back_': 'volver al resumen de plantillas',
    'plantillas_period_': 'filtrar los registros de plantillas',
    'plantillas_totalcsv_': 'exportar todas las plantillas (CSV)',
    'plantillas_totaljson_': 'exportar todas las plantillas (JSON)',
};

const SKIP_SUCCESS = new Set([
    'retirar_',
    'toggle_veto_revoke_',
    'cancelar_oposicion_',
    'quitar_veto_',
]);

function fechaManual() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `a las ${hh}:${mm}:${ss} del ${dd}/${mo}/${d.getFullYear()}`;
}

function tickEmoji(estado) {
    if (estado === 'error') return `<:${process.env.emoji_redtick}>`;
    if (estado === 'warning') return `<:${process.env.emoji_yellowtick}>`;
    return `<:${process.env.emoji_greentick}>`;
}

function chatNombre(interaction) {
    let sub = '';
    try {
        sub = interaction.options.getSubcommand(false) || '';
    } catch {}
    return `/${interaction.commandName}${sub ? ' ' + sub : ''}`;
}

function resolveActionNombre(interaction, key) {
    if (key === 'decision_') {
        const v = (interaction.values && interaction.values[0]) || '';
        if (v === 'aceptar') return 'aceptar la plantilla';
        if (v === 'denegar') return 'denegar la plantilla';
        if (v === 'cancelar') return 'cancelar la reclamación';
        return 'decidir sobre la plantilla';
    }
    if (ACTION_NAMES[key]) return ACTION_NAMES[key];
    return key.replace(/[_|]+$/, '');
}

function skipSuccess(key, interaction) {
    if (SKIP_SUCCESS.has(key)) return true;
    if (key === 'decision_' && interaction.values && interaction.values[0] === 'denegar') return true;
    return false;
}

function actionExtra(interaction, key, rawId) {
    try {
        if (!rawId) return '';

        if (key === 'reclamar_' || key === 'modal_retirar_' || key === 'decision_') {
            const p = getPlantilla(rawId);
            const owner = (p && p.userId) || rawId.split('_')[0];
            return owner ? `plantilla de <@${owner}>` : '';
        }

        if (key === 'modal_denegar_') {
            const p = getPlantilla(rawId);
            const owner = (p && p.userId) || rawId.split('_')[0];
            if (!owner) return '';
            let motivo = '';
            try { motivo = interaction.fields.getTextInputValue('motivo'); } catch {}
            if (!motivo && p) motivo = p.motivo || '';
            return motivo ? `plantilla de <@${owner}> — motivo: ${motivo}` : `plantilla de <@${owner}>`;
        }

        if (key === 'autorizar_' || key === 'rechazar_plantilla_') {
            if (rawId.startsWith('VETO-')) {
                const v = getVeto(rawId);
                if (v) return v.motivo ? `sobre <@${v.userId}> — motivo: ${v.motivo}` : `sobre <@${v.userId}>`;
            } else {
                const p = getPlantilla(rawId);
                if (p) return `plantilla de <@${p.userId}> — motivo: edad ooc insuficiente`;
            }
            return '';
        }

        if (key === 'quitar_veto_' || key === 'modal_quitar_veto_') {
            const userId = key === 'modal_quitar_veto_' ? rawId.split('_')[0] : rawId;
            const v = getVetoByUser(userId, { includeTest: true });
            const motivo = v && v[1] && v[1].motivo;
            return motivo ? `sobre <@${userId}> — motivo: ${motivo}` : `sobre <@${userId}>`;
        }

        if (key === 'tvrr_') {
            const vetoId = rawId.split('_').slice(1).join('_');
            const v = vetoId ? getVeto(vetoId) : null;
            if (v) return v.motivo ? `sobre <@${v.userId}> — motivo: ${v.motivo}` : `sobre <@${v.userId}>`;
        }
    } catch {}
    return '';
}

function esTestDeCustomId(customId) {
    try {
        if (!customId || typeof customId !== 'string') return false;

        if (customId.startsWith('quitar_veto_') || customId.startsWith('modal_quitar_veto_')) {
            const rest = customId.startsWith('modal_quitar_veto_')
                ? customId.slice('modal_quitar_veto_'.length)
                : customId.slice('quitar_veto_'.length);
            const userId = rest.split('_')[0];
            const v = getVetoByUser(userId, { includeTest: true });
            return !!(v && v[1] && v[1].test === true);
        }

        const vetoMatch = customId.match(/VETO-[A-Z0-9]+/);
        if (vetoMatch) {
            const v = getVeto(vetoMatch[0]);
            if (v) return v.test === true;
        }

        const PLANTILLA_PREFIXES = [
            'decision_', 'modal_denegar_', 'reclamar_', 'retirar_', 'modal_retirar_',
            'rechazar_plantilla_', 'autorizar_', 'tvrr_',
        ];
        for (const pref of PLANTILLA_PREFIXES) {
            if (customId.startsWith(pref)) {
                const raw = customId.slice(pref.length);
                const p = raw ? getPlantilla(raw) : null;
                return !!(p && p.test === true);
            }
        }

        const plantillaMatch = customId.match(/(\d{15,21}_\d{10,})/);
        if (plantillaMatch) {
            const p = getPlantilla(plantillaMatch[1]);
            if (p) return p.test === true;
        }
        return false;
    } catch {
        return false;
    }
}

function esTestDeCtx(ctx) {
    if (esTestDeCustomId(ctx && ctx.customId)) return true;
    try {
        const msg = ctx && ctx.message;
        if (msg) {
            if (esTestMsg(msg.id)) return true;
            const t = textoMensaje(msg);
            if (t.includes('🧪') || t.includes('(TEST)')) return true;
        }
    } catch {}
    return false;
}

function buildDescription({ tipo, estado, nombre, userId, extra = '', motivo = '' }) {
    const esAccion = tipo === 'accion';
    const sujeto = esAccion ? `La acción de \`${nombre}\`` : `El comando ${nombre}`;
    const quien = `el usuario <@${userId}> con id \`${userId}\``;
    const cuando = fechaManual();

    if (estado === 'warning') {
        return `${sujeto} ha sido ${esAccion ? 'rechazada' : 'rechazado'}: **${motivo}** — ejecutado por ${quien} ${cuando}.`;
    }
    if (estado === 'error') {
        return `${sujeto} ha fallado al ser ${esAccion ? 'realizada' : 'ejecutado'} por ${quien} ${cuando}.`;
    }
    return `${sujeto} ha sido ${esAccion ? 'realizada' : 'ejecutado'} por ${quien} ${cuando}${extra ? ` — ${extra}` : ''}.`;
}

async function logAction(ctx, opts = {}) {
    try {
        const {
            tipo = 'comando',
            estado = 'ok',
            nombre = '',
            extra = '',
            motivo = '',
            userId: optUserId,
            userTag: optUserTag,
        } = opts;

        if (ctx && typeof ctx === 'object') ctx.__logged = true;

        const user = (ctx && ctx.user) || (ctx && ctx.author) || null;
        const userId = optUserId || (user && user.id);
        const userTag = optUserTag || (user && user.tag);
        const client = ctx && ctx.client;

        if (!client || !userId || !process.env.canallogs) return;

        const tick = tickEmoji(estado);
        const titulo = `${tipo === 'accion' ? 'Log de acción' : 'Log de comando'} — ${tick}`;
        const descripcion = buildDescription({ tipo, estado, nombre, userId, extra, motivo });

        console.log(`[LOG:${estado}] ${tipo === 'accion' ? 'accion' : 'comando'} «${nombre}» → #logs-bot`);

        const embed = new EmbedBuilder()
            .setColor(COLORS[estado] || COLORS.ok)
            .setTitle(titulo)
            .setDescription(descripcion)
            .setFooter({ text: `${userTag || 'Desconocido'} · ID: ${userId}` });

        const channel = await client.channels.fetch(process.env.canallogs);
        const silencioso = esTestDeCtx(ctx);
        await channel.send({
            embeds: [embed],
            ...(silencioso ? { flags: MessageFlagsBitField.Flags.SuppressNotifications } : {}),
        });
    } catch (e) {
        console.error('[actionLog]', e.message);
    }
}

module.exports = {
    logAction,
    chatNombre,
    resolveActionNombre,
    skipSuccess,
    actionExtra,
    ACTION_NAMES,
};
