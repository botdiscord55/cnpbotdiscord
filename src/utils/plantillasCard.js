const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const { getPlantillasByUser, getAllPlantillas } = require('../database/plantillas');
const { getAllReclamaciones } = require('../database/reclamaciones');

const POR_PAGINA = 5;

const NOTA_BORRADO = '-# ⏱ Se eliminará automáticamente a los 3 minutos tras la última interacción con los botones.';

const ESTADO_META = {
    aceptada: { label: 'Aceptada', plural: 'Aceptadas', emoji: () => process.env.emoji_greentick },
    denegada: { label: 'Denegada', plural: 'Denegadas', emoji: () => process.env.emoji_redtick },
    pendiente: { label: 'Pendiente', plural: 'Pendientes', emoji: () => process.env.emoji_yellowtick },
    reclamada: { label: 'Reclamada', plural: 'Reclamadas', emoji: () => process.env.emoji_yellowtick },
    retirada: { label: 'Retirada', plural: 'Retiradas', emoji: () => process.env.emoji_greytick },
};

const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function claveMes(iso) {
    const d = new Date(iso || 0);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function labelMes(clave) {
    const [y, m] = clave.split('-');
    return `${MESES_NOMBRE[parseInt(m, 10) - 1]} ${y}`;
}

function periodosDe(plantillas) {
    const mapa = new Map();
    for (const p of plantillas) {
        const clave = claveMes(p.fechaCreacion);
        if (!clave) continue;
        mapa.set(clave, (mapa.get(clave) || 0) + 1);
    }
    const meses = [...mapa.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 24)
        .map(([clave, n]) => ({ value: clave, label: `${labelMes(clave)} (${n})` }));
    return [...meses, { value: 'total', label: 'Todo el tiempo' }];
}

function filtrarPeriodo(plantillas, period) {
    if (period === 'total' || !/^\d{4}-\d{2}$/.test(period)) return plantillas;
    return plantillas.filter(p => claveMes(p.fechaCreacion) === period);
}

const ORDEN_ESTADOS = ['aceptada', 'denegada', 'pendiente', 'reclamada', 'retirada'];

function formatFecha(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return '—';
    }
}

function fechaDe(p) {
    return p.fechaAceptacion || p.fechaDenegacion || p.fechaRetirada || p.fechaCreacion;
}

function quienPor(p) {
    if (p.estado === 'aceptada' && p.aceptadaPor) return ` · por <@${p.aceptadaPor}>`;
    if (p.estado === 'denegada' && p.denegadaPor) return ` · por <@${p.denegadaPor}>`;
    if (p.estado === 'retirada' && p.retiradaPor) return ` · por <@${p.retiradaPor}>`;
    if (p.estado === 'reclamada' && p.reclamadaPor) return ` · en manos de <@${p.reclamadaPor}>`;
    return '';
}

function truncate(text, max) {
    if (!text) return '';
    const clean = String(text).replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function actorId(ctx) {
    const user = (ctx && (ctx.user || ctx.author)) || null;
    return user ? user.id : null;
}

async function esAgenteCnp(ctx) {
    const id = actorId(ctx);
    if (!id) return false;
    if (id === process.env.duenio_delbot) return true;

    const rolAgente = process.env.rolagente_cnp;
    if (!rolAgente) return false;

    try {
        const member = ctx.member || (ctx.guild && await ctx.guild.members.fetch(id));
        return !!(member && member.roles.cache.has(rolAgente));
    } catch {
        return false;
    }
}

async function esInstructor(ctx) {
    const id = actorId(ctx);
    if (!id) return false;
    if (id === process.env.duenio_delbot) return true;

    const roles = `${process.env.rolaceptar_plantillas || ''},${process.env.rolinstructores || ''}`
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);
    if (!roles.length) return false;

    try {
        const member = ctx.member || (ctx.guild && await ctx.guild.members.fetch(id));
        return !!(member && roles.some(r => member.roles.cache.has(r)));
    } catch {
        return false;
    }
}

function resumenCounts(counts) {
    const partes = [`<:${process.env.emoji_greentick}> Aceptadas **${counts.aceptada || 0}**`];
    if (counts.denegada) partes.push(`<:${process.env.emoji_redtick}> Denegadas **${counts.denegada}**`);
    if (counts.pendiente) partes.push(`<:${process.env.emoji_yellowtick}> Pendientes **${counts.pendiente}**`);
    if (counts.reclamada) partes.push(`Reclamadas **${counts.reclamada}**`);
    if (counts.retirada) partes.push(`<:${process.env.emoji_greytick}> Retiradas **${counts.retirada}**`);
    return partes.join(' — ');
}

function buildPlantillasCard(targetUserId, opts = {}) {
    const plantillas = getPlantillasByUser(targetUserId);

    if (!plantillas.length) {
        const container = new ContainerBuilder()
            .setAccentColor(0xfee75c)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} PLANTILLAS DE <@${targetUserId}>`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> <@${targetUserId}> no tiene ninguna plantilla registrada.`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(NOTA_BORRADO)
            );
        return { container, plantillas, counts: null };
    }

    const counts = { aceptada: 0, denegada: 0, pendiente: 0, reclamada: 0, retirada: 0 };
    for (const p of plantillas) {
        if (counts[p.estado] === undefined) counts[p.estado] = 0;
        counts[p.estado]++;
    }

    const color = counts.denegada > counts.aceptada ? 0xed4245 : counts.aceptada > 0 ? 0x57f287 : 0xfee75c;

    const ultimos = plantillas.slice(0, 3);
    const registroLines = ultimos.map((p, i) => {
        const meta = ESTADO_META[p.estado] || { plural: p.estado, emoji: () => process.env.emoji_greytick };
        return `${i + 1}. <:${meta.emoji()}> **${meta.plural}** — ${formatFecha(fechaDe(p))}${quienPor(p)}`;
    });

    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} PLANTILLAS DE <@${targetUserId}>`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Usuario:** <@${targetUserId}> (\`${targetUserId}\`)\n` +
                `${resumenCounts(counts)}\n` +
                `-# Total de plantillas aceptadas: **${counts.aceptada || 0}**`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**REGISTRO**\n` +
                `-# Los ${ultimos.length} registros más recientes${plantillas.length > ultimos.length ? ` de ${plantillas.length} en total` : ''}:\n` +
                registroLines.join('\n')
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(NOTA_BORRADO)
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`plantillas_reg_${targetUserId}`)
                    .setLabel('Ver registros')
                    .setStyle(ButtonStyle.Primary)
            )
        );

    return { container, plantillas, counts };
}

function filtrarPeriodo(plantillas, period) {
    const def = PERIODOS.find(p => p.value === period) || PERIODOS[PERIODOS.length - 1];
    if (!def.dias) return plantillas;
    const limite = Date.now() - def.dias * 86400000;
    return plantillas.filter(p => new Date(p.fechaCreacion || 0).getTime() >= limite);
}

function agruparPorEstado(plantillas) {
    const grupos = [];
    for (const estado of ORDEN_ESTADOS) {
        const items = plantillas.filter(p => (p.estado || '') === estado);
        if (items.length) grupos.push({ estado, items });
    }
    const conocidos = new Set(ORDEN_ESTADOS);
    const otros = plantillas.filter(p => !conocidos.has(p.estado));
    if (otros.length) grupos.push({ estado: 'otros', items: otros });
    return grupos;
}

function buildRegistrosCard(targetUserId, periodRaw, pageRaw) {
    const todas = getPlantillasByUser(targetUserId);
    const periodos = periodosDe(todas);
    const period = periodos.some(p => p.value === periodRaw) ? periodRaw : 'total';
    const labelPeriodo = period === 'total' ? 'Todo el tiempo' : labelMes(period);
    const filtradas = filtrarPeriodo(todas, period);

    const grupos = agruparPorEstado(filtradas);
    const ordenadas = grupos.flatMap(g => g.items);
    const totals = Object.fromEntries(grupos.map(g => [g.estado, g.items.length]));

    const pages = Math.max(1, Math.ceil(ordenadas.length / POR_PAGINA));
    const page = Math.min(Math.max(0, Number(pageRaw) || 0), pages - 1);
    const slice = ordenadas.slice(page * POR_PAGINA, (page + 1) * POR_PAGINA);

    const lines = [];
    let actual = null;
    for (const p of slice) {
        if (p.estado !== actual) {
            const meta = ESTADO_META[p.estado] || { plural: p.estado, emoji: () => process.env.emoji_greytick };
            lines.push(`**<:${meta.emoji()}> ${meta.plural} (${totals[p.estado]})**`);
            actual = p.estado;
        }
        lines.push(`> ${formatFecha(fechaDe(p))}${quienPor(p)}`);
        if (p.estado === 'denegada' && p.motivo) lines.push(`> -# ${truncate(p.motivo, 90)}`);
    }

    const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} PLANTILLAS DE <@${targetUserId}>`)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Historial completo de plantillas enviadas por <@${targetUserId}>`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                lines.length ? lines.join('\n') : `> <:${process.env.emoji_greytick}> Sin registros en: **${labelPeriodo}**.`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# Página **${page + 1}/${pages}** · ${filtradas.length} registros — ${labelPeriodo}`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(NOTA_BORRADO)
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`plantillas_period_${targetUserId}`)
                    .setPlaceholder('Filtrar por periodo')
                    .addOptions(periodos.map(p => ({ label: p.label, value: p.value, default: p.value === period })))
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`plantillas_nav_${targetUserId}_${period}_${page - 1}`)
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page <= 0),
                new ButtonBuilder()
                    .setCustomId(`plantillas_nav_${targetUserId}_${period}_${page + 1}`)
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= pages - 1),
                new ButtonBuilder()
                    .setCustomId(`plantillas_back_${targetUserId}`)
                    .setLabel('Volver')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return { container, plantillas: filtradas, page, pages };
}

function statsVertotal() {
    const todas = getAllPlantillas();
    const reales = todas.filter(p => p.test !== true);
    const tests = todas.length - reales.length;

    const counts = { aceptada: 0, denegada: 0, pendiente: 0, reclamada: 0, retirada: 0 };
    for (const p of reales) {
        if (counts[p.estado] === undefined) counts[p.estado] = 0;
        counts[p.estado]++;
    }

    const recs = getAllReclamaciones();
    const recCounts = { reclamada: 0, aceptada: 0, denegada: 0, retirada: 0, cancelada: 0 };
    const porInstr = new Map();
    for (const r of recs) {
        if (recCounts[r.estado] === undefined) recCounts[r.estado] = 0;
        recCounts[r.estado]++;
        const k = String(r.reclamadaPor);
        porInstr.set(k, (porInstr.get(k) || 0) + 1);
    }
    const topInstr = [...porInstr.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const ahora = Date.now();
    const semana = reales.filter(p => new Date(p.fechaCreacion || 0).getTime() >= ahora - 7 * 86400000).length;
    const mes = reales.filter(p => new Date(p.fechaCreacion || 0).getTime() >= ahora - 30 * 86400000).length;

    return { total: reales.length, tests, counts, recsTotal: recs.length, recCounts, topInstr, semana, mes };
}

function buildVertotalCard() {
    const s = statsVertotal();
    const G = `<:${process.env.emoji_greentick}>`;
    const R = `<:${process.env.emoji_redtick}>`;
    const Y = `<:${process.env.emoji_yellowtick}>`;
    const GY = `<:${process.env.emoji_greytick}>`;

    const resumen = `${G} Aceptadas **${s.counts.aceptada}** · ${R} Denegadas **${s.counts.denegada}** · ${Y} Pendientes **${s.counts.pendiente}** · Reclamadas **${s.counts.reclamada}** · ${GY} Retiradas **${s.counts.retirada}**`;

    const instrTopLines = s.topInstr.length
        ? s.topInstr.map(([id, n], i) => `> ${i + 1}. <@${id}> — **${n}**`)
        : [];

    const instrLine = s.recsTotal
        ? `> Reclamaciones: **${s.recsTotal}** — ✅ ${s.recCounts.aceptada} · ❌ ${s.recCounts.denegada} · En curso ${s.recCounts.reclamada}${s.recCounts.retirada ? ` · ↩️ ${s.recCounts.retirada}` : ''}${s.recCounts.cancelada ? ` · 🚫 ${s.recCounts.cancelada}` : ''}` +
          (instrTopLines.length ? `\n> **Por instructor:**\n${instrTopLines.join('\n')}` : '')
        : '> Sin reclamaciones de instructores registradas.';

    const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} PLANTILLAS — ESTADÍSTICAS TOTALES`)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Datos globales de instructores · pruebas excluidas (${s.tests} de test ignoradas)`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Resumen general**\n> Total enviadas: **${s.total}**\n> ${resumen}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Instructores (los que aceptan)**\n${instrLine}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Actividad**\n> Última semana: **${s.semana}** · Último mes: **${s.mes}** · Pendientes sin reclamar: **${s.counts.pendiente}**\n-# Actualizado <t:${Math.floor(Date.now() / 1000)}:F>\n${NOTA_BORRADO}`
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('plantillas_totalcsv_')
                    .setLabel('Guardar CSV')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('plantillas_totaljson_')
                    .setLabel('Guardar JSON')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return { container, stats: s };
}

function csvCampo(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function exportarVertotalCSV() {
    const todas = getAllPlantillas();
    const header = ['id', 'userId', 'nombre', 'dni', 'edad', 'estado', 'fechaCreacion', 'fechaResolucion', 'reclamadaPor', 'aceptadaPor', 'denegadaPor', 'retiradaPor', 'motivo', 'test'];
    const rows = todas.map(p => [
        p.id, p.userId, p.nombre, p.dni, p.edad, p.estado, p.fechaCreacion,
        p.fechaAceptacion || p.fechaDenegacion || p.fechaRetirada || '',
        p.reclamadaPor || '', p.aceptadaPor || '', p.denegadaPor || '', p.retiradaPor || '',
        p.motivo || '', p.test === true ? 'si' : 'no',
    ].map(csvCampo).join(','));
    return [header.join(','), ...rows].join('\r\n');
}

function exportarVertotalJSON() {
    return JSON.stringify({
        generado: new Date().toISOString(),
        stats: statsVertotal(),
        plantillas: getAllPlantillas(),
    }, null, 2);
}

module.exports = {
    buildPlantillasCard,
    buildRegistrosCard,
    buildVertotalCard,
    statsVertotal,
    exportarVertotalCSV,
    exportarVertotalJSON,
    esAgenteCnp,
    esInstructor,
};
