const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { getPlantilla, updatePlantilla } = require('../database/plantillas');
const { getVeto, updateVeto, createVeto, getVetoByUser } = require('../database/vetos');
const { logAction } = require('../utils/actionLog');
const { registrarTestMsg } = require('../database/testmsgs');

const EMOJI_MAP = {
    bien: `<:${process.env.emoji_greentick}>`,
    dudoso: `<:${process.env.emoji_greytick}>`,
    mal: `<:${process.env.emoji_redtick}>`,
};

function buildPlantillaContainer(plantilla, footerText = null, motivo = null) {
    const evaluacion = plantilla.evaluacion || {};
    const razones = evaluacion.razones || {};

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### SOLICITUD DE INGRESO - ACADEMIA DE POLICÍA')
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Información OOC del solicitante:** <@${plantilla.userId}>\n` +
                `**ID Única:** \`${plantilla.userId}\`\n` +
                `-# ID de la solicitud: \`${plantilla.id}\``
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Ficha de Identificación General**\n' +
                `> ***Nombre Completo:*** ${plantilla.nombre}\n` +
                `> ***Número de DNI:*** ${plantilla.dni}\n` +
                `> ***Edad OOC:*** ${plantilla.edad}`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Evaluación de Conocimientos Teóricos**\n' +
                `> ${EMOJI_MAP[evaluacion.pg] || ''} ***Concepto de PG:*** ${plantilla.pg}${razones.pg ? `\n> -# ${razones.pg}` : ''}\n` +
                `> ${EMOJI_MAP[evaluacion.mg] || ''} ***Concepto de MG:*** ${plantilla.mg}${razones.mg ? `\n> -# ${razones.mg}` : ''}\n` +
                `> ${EMOJI_MAP[evaluacion.bd] || ''} ***Concepto de BD:*** ${plantilla.bd}${razones.bd ? `\n> -# ${razones.bd}` : ''}\n` +
                `> ${EMOJI_MAP[evaluacion.vdm] || ''} ***Concepto de VDM:*** ${plantilla.vdm}${razones.vdm ? `\n> -# ${razones.vdm}` : ''}`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Estatus de Trámites y Permisos**\n' +
                `> ${plantilla.licConducir === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Conducir:*** ${plantilla.licConducir}\n` +
                `> ${plantilla.licArmas === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Armas:*** ${plantilla.licArmas}\n` +
                `> ${plantilla.multas === 'Sí' ? `<:${process.env.emoji_yellowtick}>` : `<:${process.env.emoji_greentick}>`} ***Multas/Antecedentes:*** ${plantilla.multas}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        );

    const razonGeneral = evaluacion.razon_general || '';
    if (razonGeneral) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Razón de la evaluación:**\n${razonGeneral}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        );
    }

    if (motivo) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Razón del instructor:**\n${motivo}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        );
    }

    if (footerText) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`*${footerText}*`)
        );
    }

    return container;
}

async function checkRole(member) {
    if (member.id === process.env.userid_noafc) return true;
    const roleId = process.env.rolsuperioresacademia;
    if (!roleId) return true;
    return member.roles.cache.has(roleId);
}

async function revokeVeto(interaction, targetUserId, nickname, motivoVeto, esTest = false, enviarLog = true) {
    if (!esTest) {
        const vetoRoleId = process.env.vetoedadooc_insuficiente;
        if (vetoRoleId) {
            const solicitante = await interaction.guild.members.fetch(targetUserId);
            if (solicitante.roles.cache.has(vetoRoleId)) {
                await solicitante.roles.remove(vetoRoleId);
            }
        }
    }

    if (enviarLog) {
        const canalVetos = await interaction.client.channels.fetch(process.env.canalregistros_vetos);
        const vetoLog = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## <:${process.env.emoji_greentick}> VETO REVOCADO\nEl veto de <@${targetUserId}> ha sido revocado por **${nickname}**.\nEl motivo del veto era por: **${motivoVeto}**.`)
            );
            const enviado = await canalVetos.send({ components: [vetoLog], flags: MessageFlagsBitField.Flags.IsComponentsV2, ...(esTest ? { allowed_mentions: { parse: [] } } : {}) });
            if (esTest) registrarTestMsg(enviado && enviado.id, canalVetos.id, 'veto');
    }

    if (esTest) return;

    try {
        const solicitante = await interaction.guild.members.fetch(targetUserId);
        const dm = await solicitante.createDM();
        const dmContainer = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO RETIRADO\n> Tu veto ha sido retirado.`)
            );
        await dm.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    } catch {}
}

async function maintainVeto(interaction, targetUserId, nickname, motivoVeto, vetoIdParam = null, editFn = null) {
    let veto = null;
    let vetoId = vetoIdParam || null;

    if (vetoId) {
        veto = getVeto(vetoId);
    } else {
        const entry = getVetoByUser(targetUserId) || getVetoByUser(targetUserId, { includeTest: true });
        if (entry) {
            vetoId = entry[0];
            veto = entry[1];
        }
    }

    const esTest = !!(veto && veto.test === true);

    if (!esTest) {
        const vetoRoleId = process.env.vetoedadooc_insuficiente;
        if (vetoRoleId) {
            const solicitante = await interaction.guild.members.fetch(targetUserId);
            if (!solicitante.roles.cache.has(vetoRoleId)) {
                await solicitante.roles.add(vetoRoleId);
            }
        }
    }

    let codigoRetiro = null;
    if (vetoId) {
        codigoRetiro = String(Math.floor(100000 + Math.random() * 900000));
        updateVeto(vetoId, { codigoRetiro });
    }

    const canalVetos = await interaction.client.channels.fetch(process.env.canalregistros_vetos);

    let duracionText = '';
    if (veto && veto.expiresAt) {
        const expiresAt = new Date(veto.expiresAt);
        const now = new Date();
        const diff = expiresAt.getTime() - now.getTime();
        if (diff > 0) {
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            if (days > 0) duracionText = `${days}d ${hours}h`;
            else if (hours > 0) duracionText = `${hours}h ${minutes}m`;
            else duracionText = `${minutes}m`;
        } else {
            duracionText = 'Expirado';
        }
    } else {
        duracionText = 'Indefinido';
    }

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO CONFIRMADO — \`${vetoId}\``)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> **Usuario:** <@${targetUserId}>\n` +
                `> **Duración restante:** ${duracionText}\n` +
                `> **Motivo:** ${motivoVeto}\n` +
                `> **Confirmado por:** <@${interaction.user.id}>\n` +
                `> **Fecha:** <t:${Math.floor(Date.now() / 1000)}:F>`
            )
        );

    if (codigoRetiro) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# 🔑 Código de retirada: \`${codigoRetiro}\``)
        );
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quitar_veto_${targetUserId}`)
            .setLabel('Quitar veto')
            .setStyle(ButtonStyle.Danger)
            .setEmoji(process.env.emoji_redtick),
    );

    if (editFn) {
        await editFn({ components: [container, row], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    } else {
        const enviado = await canalVetos.send({ components: [container, row], flags: MessageFlagsBitField.Flags.IsComponentsV2, ...(esTest ? { allowed_mentions: { parse: [] } } : {}) });
        if (esTest) registrarTestMsg(enviado && enviado.id, canalVetos.id, 'veto');
    }
}

module.exports = [
    {
        customId: 'autorizar_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const id = interaction.customId.replace('autorizar_', '');

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!(await checkRole(member))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'autorizar el veto', motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const nickname = member.nickname || interaction.user.username;

            if (id.startsWith('VETO-')) {
                const veto = getVeto(id);
                if (!veto) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'autorizar el veto', motivo: 'este veto ya no existe' });
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este veto ya no existe.`)
                        );
                    return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
                }

                updateVeto(id, {
                    estado: 'confirmado',
                    revisadoPor: interaction.user.id,
                    fechaRevision: new Date().toISOString(),
                });

                await maintainVeto(interaction, veto.userId, nickname, veto.motivo, id, (payload) => interaction.editReply(payload));
            } else {
                const plantilla = getPlantilla(id);
                if (!plantilla) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'autorizar el veto', motivo: 'esta plantilla ya no existe' });
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya no existe.`)
                        );
                    return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
                }

                updatePlantilla(id, {
                    denegadaPor: interaction.user.id,
                    denegadaTag: interaction.user.tag,
                    denegadaNickname: nickname,
                    fechaDenegacion: new Date().toISOString(),
                    motivo: `Veto aceptado por ${nickname} - Edad ooc insuficiente`,
                });

                await maintainVeto(interaction, plantilla.userId, nickname, 'edad ooc insuficiente', null, (payload) => interaction.editReply(payload));

                const confirmContainer = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> Has aceptado el veto de <@${plantilla.userId}>.`)
                    );
                await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }
        },
    },
    {
        customId: 'rechazar_plantilla_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const id = interaction.customId.replace('rechazar_plantilla_', '');

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!(await checkRole(member))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'denegar el veto', motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const nickname = member.nickname || interaction.user.username;

            if (id.startsWith('VETO-')) {
                const veto = getVeto(id);
                if (!veto) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'denegar el veto', motivo: 'este veto ya no existe' });
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este veto ya no existe.`)
                        );
                    return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
                }

                updateVeto(id, {
                    estado: 'revocado',
                    revisadoPor: interaction.user.id,
                    fechaRevision: new Date().toISOString(),
                });

                await revokeVeto(interaction, veto.userId, nickname, veto.motivo, veto.test === true, false);

                const container = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> El veto \`${id}\` de <@${veto.userId}> ha sido denegado por **${nickname}**.`)
                    );
                await interaction.editReply({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

                const confirmContainer = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> Has denegado el veto \`${id}\` de <@${veto.userId}>.`)
                    );
                await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            } else {
                const plantilla = getPlantilla(id);
                if (!plantilla) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'denegar el veto', motivo: 'esta plantilla ya no existe' });
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya no existe.`)
                        );
                    return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
                }

                await revokeVeto(interaction, plantilla.userId, nickname, 'edad ooc insuficiente', plantilla.test === true, false);

                updatePlantilla(id, {
                    estado: 'aceptada',
                    aceptadaPor: interaction.user.id,
                    aceptadaTag: interaction.user.tag,
                    aceptadaNickname: nickname,
                    fechaAceptacion: new Date().toISOString(),
                });

                const container = buildPlantillaContainer(plantilla, `<:${process.env.emoji_redtick}> El veto de <@${plantilla.userId}> ha sido denegado por **${nickname}**. El motivo del veto era por: **edad ooc insuficiente**.`);
                container.setAccentColor(0xed4245);
                await interaction.editReply({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

                const confirmContainer = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> Has denegado el veto de <@${plantilla.userId}>.`)
                    );
                await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }
        },
    },
    {
        customId: 'toggle_veto_revoke_',
        execute: async (interaction) => {
            const parts = interaction.customId.replace('toggle_veto_revoke_', '').split('_');
            const existingVetoId = parts[0];
            const targetUserId = parts[1];
            const data = JSON.parse(Buffer.from(parts.slice(2).join('_'), 'base64').toString());

            const claimKey = `${interaction.user.id}_${existingVetoId}`;
            interaction.client._activeClaims.set(claimKey, { existingVetoId, targetUserId, data });

            const modal = new ModalBuilder()
                .setCustomId(`tvrr_${claimKey}`)
                .setTitle('Retirar veto y aplicar nuevo')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('motivo_retiro')
                            .setLabel('Motivo del retiro del veto actual')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(false)
                            .setPlaceholder('Opcional - Escribe el motivo si lo deseas...')
                    )
                );
            await interaction.showModal(modal);
        },
    },
    {
        customId: 'toggle_veto_cancel_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const cancelContainer = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greytick}> Operación cancelada.`)
                );
            await interaction.editReply({ components: [cancelContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        },
    },
    {
        customId: 'quitar_veto_',
        execute: async (interaction) => {
            const targetUserId = interaction.customId.replace('quitar_veto_', '');

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!(await checkRole(member))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'quitar el veto', motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const channelId = interaction.channelId || (interaction.message && interaction.message.channelId) || '';
            const messageId = (interaction.message && interaction.message.id) || '';

            const modal = new ModalBuilder()
                .setCustomId(`modal_quitar_veto_${targetUserId}_${channelId}_${messageId}`)
                .setTitle('Confirmar retiro de veto')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('codigo')
                            .setLabel('Código de retirada')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMaxLength(6)
                            .setMinLength(6)
                            .setPlaceholder('6 dígitos del embed')
                    )
                );
            await interaction.showModal(modal);
        },
    },
];

module.exports.revokeVeto = revokeVeto;
module.exports.checkRole = checkRole;
