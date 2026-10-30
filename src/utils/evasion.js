const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlagsBitField,
} = require('discord.js');
const { getVetoByUser, createVeto, updateVeto } = require('../database/vetos');
const { registrarTestMsg } = require('../database/testmsgs');
const { checkRole } = require('../buttons/veto');
const { logAction } = require('./actionLog');

const SEG = 1000;
const MIN = 60 * SEG;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const MES = 30 * DIA;
const MUTE_TOPE_MS = 27 * DIA; // el máximo de Discord es 27 días

const MOTIVO_EVASION = 'Evasión de CK 2/2: abandonó el servidor para evadir el Character Kill obligatorio';

const DURACIONES_MENU = [
    { label: '1 día', value: '1d' },
    { label: '3 días', value: '3d' },
    { label: '5 días', value: '5d' },
    { label: '7 días', value: '7d' },
    { label: '10 días', value: '10d' },
    { label: '14 días', value: '14d' },
    { label: '21 días', value: '21d' },
    { label: '27 días (tope del mute)', value: '27d' },
    { label: '30 días', value: '30d' },
    { label: 'Personalizado...', value: 'custom' },
];

// ─── Duraciones ──────────────────────────────────────────────────────────────

function parseDuracion(texto) {
    const t = String(texto || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (!t) return null;

    let m;
    if ((m = t.match(/^(\d+)(meses|mes)$/))) {
        const n = parseInt(m[1], 10);
        if (!n) return null;
        return { ms: n * MES, label: `${n} ${n === 1 ? 'mes' : 'meses'}` };
    }
    if ((m = t.match(/^(\d+)(semanas|semana|w)$/))) {
        const n = parseInt(m[1], 10);
        if (!n) return null;
        return { ms: n * 7 * DIA, label: `${n} ${n === 1 ? 'semana' : 'semanas'}` };
    }
    if ((m = t.match(/^(\d+)(dias|dia|d)$/))) {
        const n = parseInt(m[1], 10);
        if (!n) return null;
        return { ms: n * DIA, label: `${n} ${n === 1 ? 'día' : 'días'}` };
    }
    if ((m = t.match(/^(\d+)(horas|h)$/))) {
        const n = parseInt(m[1], 10);
        if (!n) return null;
        return { ms: n * HORA, label: `${n} ${n === 1 ? 'hora' : 'horas'}` };
    }
    if ((m = t.match(/^(\d+)(min|minuto|minutos|m)$/))) {
        const n = parseInt(m[1], 10);
        if (!n) return null;
        return { ms: n * MIN, label: `${n} ${n === 1 ? 'minuto' : 'minutos'}` };
    }
    return null;
}

function duracionNormalizada(ms) {
    if (ms % DIA === 0) return `${ms / DIA}d`;
    if (ms % HORA === 0) return `${ms / HORA}h`;
    return `${Math.max(1, Math.round(ms / MIN))}m`;
}

// ─── Árbol de decisiones de la reentrada ─────────────────────────────────────

function evaluarRama(snapshot, { rolAceptada, rolDenegada2 } = {}) {
    if (!snapshot) {
        return { rama: 'nuevo', detalle: 'Sin registro de salida (primera entrada o el bot estaba caído) → solo recibe el rol sin plantilla.' };
    }
    const roles = snapshot.roles || [];
    const tieneDenegada2 = !!(rolDenegada2 && roles.includes(String(rolDenegada2)));
    const tieneAceptada = !!(rolAceptada && roles.includes(String(rolAceptada)));

    if (tieneDenegada2 && !tieneAceptada) {
        return { rama: 'evasion', detalle: 'Tenía plantilla denegada 2/2 (CK obligatorio) al salir → se restaura TODO y se envía la tarjeta de veto por evasión.' };
    }
    if (tieneAceptada) {
        return { rama: 'aceptada', detalle: 'Tenía plantilla aceptada al salir → es como abandonar: solo recibe el rol sin plantilla (sin castigo y sin restaurar).' };
    }
    if (!roles.length) {
        return { rama: 'nuevo', detalle: 'Registro sin roles guardados → como una entrada nueva: solo recibe el rol sin plantilla.' };
    }
    return { rama: 'restaurar', detalle: `Restaurar sus ${roles.length} rol(es) y apodo tal y como estaban al salir (denegada 1/2, pendiente, etc.).` };
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

function rolesExcluidos() {
    return new Set([
        process.env.rolveto_academico,
        process.env.vetoedadooc_insuficiente,
    ].filter(Boolean).map(String));
}

function rolesRestaurables(member) {
    const excluir = rolesExcluidos();
    const out = [];
    for (const [roleId, role] of member.roles.cache) {
        if (roleId === member.guild.id) continue;
        if (role.managed) continue;
        if (excluir.has(String(roleId))) continue;
        out.push({ id: String(roleId), name: role.name });
    }
    return out;
}

async function restaurarMiembro(member, snapshot) {
    const restaurados = [];
    const excluir = rolesExcluidos();
    for (const roleId of (snapshot.roles || [])) {
        if (excluir.has(String(roleId))) continue;
        const role = member.guild.roles.cache.get(String(roleId));
        if (!role) continue; // el rol ya no existe en el servidor
        try {
            if (!member.roles.cache.has(role.id)) {
                await member.roles.add(role);
                restaurados.push(role.name);
            }
        } catch {}
    }
    let nickRestaurado = false;
    if (snapshot.nick) {
        try {
            if (member.nickname !== snapshot.nick) {
                await member.setNickname(snapshot.nick);
                nickRestaurado = true;
            }
        } catch {}
    }
    return { restaurados, nickRestaurado };
}

// ─── Imposición de veto activo al reentrar ───────────────────────────────────

async function imponerVetoVigente(member, veto) {
    const detalles = [];
    const vetoRoleId = process.env.rolveto_academico;
    if (vetoRoleId) {
        try {
            if (!member.roles.cache.has(vetoRoleId)) {
                await member.roles.add(vetoRoleId);
                detalles.push('rol de veto');
            }
        } catch {}
    }
    const muteHasta = veto && veto.muteHasta ? Date.parse(veto.muteHasta) : 0;
    const ahora = Date.now();
    if (muteHasta > ahora) {
        try {
            await member.timeout(muteHasta - ahora, 'Reentrada con veto vigente: mute restante reaplicado');
            detalles.push(`mute restante (${Math.ceil((muteHasta - ahora) / HORA)} h)`);
        } catch {}
    }
    return detalles;
}

async function avisarVetoVigente(client, member, veto, detalles) {
    try {
        const canal = await client.channels.fetch(process.env.canalregistros_vetos);
        const container = new ContainerBuilder()
            .setAccentColor(0xfee75c)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `### ${process.env.emoji_oposiciones} VETO VIGENTE REIMPUESO — \`${veto.id}\`\n` +
                    `> **Usuario:** <@${member.id}>\n` +
                    `> **Motivo:** ${veto.motivo}\n` +
                    `> **Reimpuesto al reentrar:** ${detalles.length ? detalles.join(' · ') : 'ya lo tenía todo aplicado'}`
                )
            );
        await canal.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.SuppressNotifications });
    } catch {}
}

// ─── Tarjeta de evasión con el menú de duraciones ────────────────────────────

function parsearSuffix(suffix) {
    const s = String(suffix || '');
    if (s.startsWith('test_')) return { userId: s.slice('test_'.length), esTest: true };
    return { userId: s, esTest: false };
}

function tarjetaEvasion({ userId, nick, rolesRestaurados, esTest }) {
    const container = new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${esTest ? '🧪 TEST — ' : ''}⚠ EVASIÓN DETECTADA — CK 2/2 evadido`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> **Usuario:** <@${userId}> (\`${userId}\`)\n` +
                `> **Apodo al salir:** ${nick || 'sin apodo'}\n` +
                `> **Motivo:** Tenía plantilla denegada 2/2 (CK obligatorio), abandonó el servidor y ha vuelto para evadirlo.\n` +
                `> **Restaurado al volver:** ${rolesRestaurados.length ? rolesRestaurados.join(' · ') : 'ningún rol (ya no existen)'}${nick ? ' + apodo' : ''}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '-# **Elige la duración del veto:** mute real de Discord (máximo 27 días) + rol de veto por el tiempo total. ' +
                'El veto se retira solo al cumplirse el plazo. «Personalizado...» admite `27d`, `1mes`, `2meses`, `1w`, `48h`...'
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`evadur_${esTest ? 'test_' : ''}${userId}`)
                    .setPlaceholder('Elige la duración del veto (1 a 30 días)')
                    .addOptions(DURACIONES_MENU)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`evadenegar_${esTest ? 'test_' : ''}${userId}`)
                    .setLabel('No vetar')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(process.env.emoji_greytick)
            )
        );
    return container;
}

async function enviarTarjetaEvasion(client, { userId, nick, rolesRestaurados, esTest }) {
    const canal = await client.channels.fetch(process.env.canalregistros_vetos);
    const enviado = await canal.send({
        components: [tarjetaEvasion({ userId, nick, rolesRestaurados, esTest })],
        flags: MessageFlagsBitField.Flags.IsComponentsV2,
        ...(esTest ? { allowed_mentions: { parse: [] } } : {}),
    });
    if (esTest) registrarTestMsg(enviado && enviado.id, canal.id, 'evasion');
    return enviado;
}

// ─── Aplicación del veto desde el menú (select o modal) ──────────────────────

function errorContainer(text) {
    return new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> ${text}`)
        );
}

async function responderError(interaction, texto, motivoLog, nombreLog) {
    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: nombreLog, motivo: motivoLog });
    const payload = { components: [errorContainer(texto)], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true };
    if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
}

async function aplicarVetoMenu(interaction, suffix, dur, { nombreLog = 'elegir la duración del veto de evasión' } = {}) {
    const { userId, esTest } = parsearSuffix(suffix);

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !(await checkRole(member))) {
        return responderError(interaction, 'No tienes permiso para realizar esta acción.', 'no tienes permiso', nombreLog);
    }

    const existente = getVetoByUser(userId, { includeTest: esTest });
    if (existente) {
        return responderError(interaction, `<@${userId}> ya tiene un veto activo (\`${existente[0]}\`), no se crea otro.`, 'ya tiene un veto activo', nombreLog);
    }

    const nickname = member.nickname || interaction.user.username;
    const ahora = Date.now();
    const muteMs = Math.min(dur.ms, MUTE_TOPE_MS);
    const duracionNorm = duracionNormalizada(dur.ms);
    const codigoRetiro = String(Math.floor(100000 + Math.random() * 900000));

    const vetoId = createVeto({
        userId,
        motivo: MOTIVO_EVASION,
        creadoPor: interaction.user.id,
        creadoPorTag: interaction.user.tag,
        creadoPorNickname: nickname,
        ...(esTest ? { test: true } : {}),
    });
    updateVeto(vetoId, {
        estado: 'confirmado',
        revisadoPor: interaction.user.id,
        fechaRevision: new Date(ahora).toISOString(),
        duracion: duracionNorm,
        expiresAt: new Date(ahora + dur.ms).toISOString(),
        ...(esTest ? {} : { muteHasta: new Date(ahora + muteMs).toISOString() }),
        codigoRetiro,
    });

    const detalles = [];
    if (!esTest) {
        const target = await interaction.guild.members.fetch(userId).catch(() => null);
        const vetoRoleId = process.env.rolveto_academico;
        if (target && vetoRoleId) {
            try {
                if (!target.roles.cache.has(vetoRoleId)) {
                    await target.roles.add(vetoRoleId);
                    detalles.push('rol de veto');
                } else {
                    detalles.push('rol de veto (ya lo tenía)');
                }
            } catch (e) {
                detalles.push(`rol de veto: NO aplicado (${e.message})`);
            }
        } else if (!target) {
            detalles.push('no está en el servidor: rol y mute se impondrán al volver');
        }
        if (target) {
            try {
                await target.timeout(muteMs, `Veto de evasión ${vetoId}: ${MOTIVO_EVASION}`);
                detalles.push(`mute ${dur.label}${dur.ms > MUTE_TOPE_MS ? ' (mute al tope de 27 d)' : ''}`);
            } catch (e) {
                detalles.push(`mute: NO aplicado (${e.message})`);
            }
        }

        try {
            const dm = await target.createDM();
            const dmContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO ACADÉMICO POR EVASIÓN`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `Has sido vetado de la academia del **Cuerpo Nacional de Policía de Andalucía:RP**\n` +
                        `> **Duración:** ${dur.label}\n` +
                        `> **Motivo:** ${MOTIVO_EVASION}\n` +
                        `> **Fecha:** <t:${Math.floor(Date.now() / 1000)}:F>\n` +
                        '-# Estás bloqueado para escribir (mute) y con el rol de veto hasta cumplir el plazo.'
                    )
                );
            await dm.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        } catch {}
    }

    // Tarjeta de confirmación (edición de la tarjeta original)
    const duracionRestante = dur.label;
    const container = new ContainerBuilder()
        .setAccentColor(esTest ? 0xfee75c : 0x57f287)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${esTest ? '🧪 TEST — ' : ''}${process.env.emoji_oposiciones} VETO CONFIRMADO — \`${vetoId}\``)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> **Usuario:** <@${userId}>\n` +
                `> **Duración:** ${duracionRestante}\n` +
                `> **Termina:** <t:${Math.floor((ahora + dur.ms) / 1000)}:R>\n` +
                `> **Motivo:** ${MOTIVO_EVASION}\n` +
                `> **Confirmado por:** <@${interaction.user.id}>\n` +
                (detalles.length ? `> **Aplicado:** ${detalles.join(' · ')}\n` : '')
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 🔑 Código de retirada: \`${codigoRetiro}\``)
        );

    if (!esTest) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`quitar_veto_${userId}`)
                    .setLabel('Quitar veto')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(process.env.emoji_redtick)
            )
        );
    }

    const payload = {
        components: [container],
        flags: MessageFlagsBitField.Flags.IsComponentsV2,
        ...(esTest ? { allowed_mentions: { parse: [] } } : {}),
    };
    try {
        await interaction.editReply(payload);
    } catch {
        // si ya no se puede editar, se envía uno nuevo
        try {
            const enviado = await interaction.channel.send(payload);
            if (esTest) registrarTestMsg(enviado && enviado.id, interaction.channelId, 'evasion');
        } catch {}
    }
    if (esTest) registrarTestMsg(interaction.message && interaction.message.id, interaction.channelId, 'evasion');

    return { ok: true, vetoId, esTest };
}

module.exports = {
    SEG, MIN, HORA, DIA, MES, MUTE_TOPE_MS, MOTIVO_EVASION,
    DURACIONES_MENU,
    parseDuracion, duracionNormalizada,
    evaluarRama, rolesRestaurables, restaurarMiembro,
    imponerVetoVigente, avisarVetoVigente,
    parsearSuffix, tarjetaEvasion, enviarTarjetaEvasion,
    aplicarVetoMenu, responderError,
};
