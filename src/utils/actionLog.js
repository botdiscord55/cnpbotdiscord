const { EmbedBuilder, MessageFlagsBitField } = require('discord.js');
const { getPlantilla } = require('../database/plantillas');
const { getVeto, getVetoByUser } = require('../database/vetos');
const { textoMensaje } = require('./limpiarTest');
const { esTestMsg } = require('../database/testmsgs');

// Color del embed = categoría del log (para agrupar de un vistazo en #logs-bot).
// El estado (ok/warning/error) se muestra con el emoji del título, no con el color.
const CATEGORIAS = {
    plantillas: { label: 'Plantillas', color: 0x5865f2 },
    vetos: { label: 'Vetos', color: 0xe67e22 },
    oposiciones: { label: 'Oposiciones', color: 0x9b59b6 },
    comandos: { label: 'Comandos', color: 0x95a5a6 },
};

const ESTADO_EMOJI = {
    ok: '✅',
    warning: '⚠️',
    error: '❌',
};

function categoriaDe(nombre) {
    const n = String(nombre || '').toLowerCase();
    if (/veto|evasi|evad|tramitar|\bck\b/.test(n)) return 'vetos';
    if (/plantilla|reclam|retirar|licencia|formulario/.test(n)) return 'plantillas';
    if (/opos|convocatoria|inscripc|sugerencia|resultado|lista/.test(n)) return 'oposiciones';
    return 'comandos';
}

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
    'evadur_': 'elegir la duración del veto de evasión',
    'evamod_': 'elegir la duración personalizada del veto de evasión',
    'evadenegar_': 'no vetar la evasión',
};

const SKIP_SUCCESS = new Set([
    'retirar_',
    'toggle_veto_revoke_',
    'cancelar_oposicion_',
    'quitar_veto_',
]);

// Descripción compacta: solo lo relevante, en líneas cortas (sin la frase larga
// con la fecha escrita a mano; la fecha ahora es el timestamp nativo del embed).
function buildDescription({ estado, extra = '', motivo = '' }) {
    const lineas = [];
    if (motivo) lineas.push(`**Motivo:** ${motivo}`);
    if (extra) lineas.push(`**Detalle:** ${extra}`);
    if (estado === 'error' && !motivo) lineas.push('**Error:** fallo inesperado al ejecutarse; revisa la consola del servidor.');
    return lineas.length ? lineas.join('\n') : null;
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
    if (key === 'evadur_') {
        const v = (interaction.values && interaction.values[0]) || '';
        return v === 'custom' ? 'elegir una duración personalizada del veto de evasión' : `vetar la evasión durante ${v}`;
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

        if (key === 'evadur_' || key === 'evamod_' || key === 'evadenegar_') {
            const userId = String(rawId || '').replace(/^test_/, '');
            return /^\d{15,21}$/.test(userId) ? `sobre <@${userId}>` : '';
        }
    } catch {}
    return '';
}

function esTestDeCustomId(customId) {
    try {
        if (!customId || typeof customId !== 'string') return false;

        const EVASION_PREFIXES = ['evadur_', 'evamod_', 'evadenegar_'];
        for (const pref of EVASION_PREFIXES) {
            if (customId.startsWith(pref)) return customId.slice(pref.length).startsWith('test_');
        }

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

        const cat = CATEGORIAS[categoriaDe(nombre)] || CATEGORIAS.comandos;
        const emoji = ESTADO_EMOJI[estado] || ESTADO_EMOJI.ok;
        const descripcion = buildDescription({ estado, extra, motivo });

        console.log(`[LOG:${estado}] ${tipo === 'accion' ? 'accion' : 'comando'} «${nombre}» → #logs-bot`);

        // Título = emoji de estado + nombre de la acción/comando (ya no el tipo genérico).
        const embed = new EmbedBuilder()
            .setColor(cat.color)
            .setTitle(`${emoji} ${nombre || (tipo === 'accion' ? 'Acción' : 'Comando')}`)
            .setFooter({ text: `${cat.label} · ${userTag || 'Desconocido'} · ID: ${userId}` })
            .setTimestamp();

        if (descripcion) embed.setDescription(descripcion);

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
