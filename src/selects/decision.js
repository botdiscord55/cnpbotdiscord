const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlagsBitField,
} = require('discord.js');
const { getPlantilla, updatePlantilla } = require('../database/plantillas');
const { resolverReclamacion } = require('../database/reclamaciones');
const { logAction, resolveActionNombre } = require('../utils/actionLog');

const EMOJI_MAP = {
    bien: `<:${process.env.emoji_greentick}>`,
    dudoso: `<:${process.env.emoji_greytick}>`,
    mal: `<:${process.env.emoji_redtick}>`,
};

function buildPlantillaContainer(plantilla, footerText, motivo) {
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
        );

    const razonGeneral = evaluacion.razon_general || '';
    if (razonGeneral) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Razón de la evaluación:**\n${razonGeneral}`)
        );
    }

    if (motivo) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Razón del instructor:**\n${motivo}`)
        );
    }

    if (footerText) {
        container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`*${footerText}*`)
            );
    }

    return container;
}

module.exports = [
    {
        customId: 'decision_',
        execute: async (interaction) => {
            const plantillaId = interaction.customId.replace('decision_', '');
            const valor = interaction.values[0];
            const plantilla = getPlantilla(plantillaId);

            if (!plantilla) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: resolveActionNombre(interaction, 'decision_'), motivo: 'esta plantilla ya no existe' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya no existe.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (plantilla.estado !== 'reclamada') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: resolveActionNombre(interaction, 'decision_'), motivo: 'esta plantilla ya ha sido procesada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya ha sido procesada.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const nickname = member.nickname || interaction.user.username;

            const rolesPermitidos = (process.env.rolaceptar_plantillas || '').split(',').filter(Boolean);
            const isNoAfc = interaction.user.id === process.env.userid_noafc;
            if (!isNoAfc && rolesPermitidos.length > 0 && !rolesPermitidos.some(r => member.roles.cache.has(r))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: resolveActionNombre(interaction, 'decision_'), motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (valor === 'aceptar') {
                const esTest = plantilla.test === true;

                await interaction.deferUpdate();

                const activeClaims = interaction.client._activeClaims || new Map();
                const claimTimeout = activeClaims.get(plantillaId);
                if (claimTimeout) {
                    clearTimeout(claimTimeout);
                    activeClaims.delete(plantillaId);
                }

                if (!esTest) {
                    try {
                        const solicitante = await interaction.guild.members.fetch(plantilla.userId);
                        const rolAceptada = process.env.rolplantilla_aceptada;
                        const rolDenegada1 = process.env.rolplantilla_denegada1;
                        const rolDenegada2 = process.env.rolplantilla_denegada2;

                        if (rolAceptada) await solicitante.roles.add(rolAceptada);
                        if (rolDenegada1 && solicitante.roles.cache.has(rolDenegada1)) await solicitante.roles.remove(rolDenegada1);
                        if (rolDenegada2 && solicitante.roles.cache.has(rolDenegada2)) await solicitante.roles.remove(rolDenegada2);

                        const rolSinPlantilla = process.env.rol_sinplantilla;
                        if (rolSinPlantilla && solicitante.roles.cache.has(rolSinPlantilla)) await solicitante.roles.remove(rolSinPlantilla);

                        const newName = `PA | ${plantilla.nombre}`;
                        try { await solicitante.setNickname(newName); } catch {}
                    } catch (e) {
                        console.error(`[Consola] Aviso: no se pudo actualizar roles/nickname de <@${plantilla.userId}> al aceptar:`, e.message || e);
                    }
                }

                updatePlantilla(plantillaId, {
                    estado: 'aceptada',
                    aceptadaPor: interaction.user.id,
                    aceptadaTag: interaction.user.tag,
                    aceptadaNickname: nickname,
                    fechaAceptacion: new Date().toISOString(),
                });

                resolverReclamacion(plantillaId, {
                    estado: 'aceptada',
                    resueltaPor: interaction.user.id,
                    resueltaTag: interaction.user.tag,
                    resueltaNickname: nickname,
                });

                const container = buildPlantillaContainer(plantilla, `<:${process.env.emoji_greentick}> Solicitud Aceptada por ${nickname}`);
                container.setAccentColor(0x57f287);
                await interaction.editReply({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

                if (!esTest) {
                    try {
                        const canalResultados = await interaction.client.channels.fetch(process.env.canalresultados_plantillasenviadas);
                        const acceptContainer = new ContainerBuilder()
                            .setAccentColor(0x57f287)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`## <:${process.env.emoji_greentick}> PLANTILLA ACEPTADA\n<@${plantilla.userId}>, su plantilla para el acceso a la **Escala Básica** del **Cuerpo Nacional de Policía** ha sido aceptada.\n-# Le recomendamos revisar el <#${process.env.canalmaterial_estudio}> y <#${process.env.canaloposiciones}>. ¡Mucha suerte!`)
                            );
                        await canalResultados.send({ components: [acceptContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                    } catch (e) {
                        console.error('[Consola] Aviso: no se pudo enviar el aviso de aceptación al canal de resultados:', e.message || e);
                    }
                }

                const confirmContainer = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> Has aceptado la plantilla de <@${plantilla.userId}>.`)
                    );
                await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            } else if (valor === 'denegar') {
                const modal = new ModalBuilder()
                    .setCustomId(`modal_denegar_${plantillaId}`)
                    .setTitle('Motivo de Denegación');

                const motivoInput = new TextInputBuilder()
                    .setCustomId('motivo')
                    .setLabel('Motivo de la denegación')
                    .setPlaceholder('Escribe el motivo por el cual se deniega la plantilla...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(500);

                const row = new ActionRowBuilder().addComponents(motivoInput);
                modal.addComponents(row);

                await interaction.showModal(modal);
            } else if (valor === 'cancelar') {
                await interaction.deferUpdate();

                const activeClaims = interaction.client._activeClaims || new Map();
                const claimTimeout = activeClaims.get(plantillaId);
                if (claimTimeout) {
                    clearTimeout(claimTimeout);
                    activeClaims.delete(plantillaId);
                }

                updatePlantilla(plantillaId, {
                    estado: 'pendiente',
                    reclamadaPor: null,
                    reclamadaTag: null,
                    reclamadaNickname: null,
                    fechaReclamacion: null,
                });

                resolverReclamacion(plantillaId, {
                    estado: 'cancelada',
                    resueltaPor: interaction.user.id,
                    resueltaTag: interaction.user.tag,
                    resueltaNickname: nickname,
                });

                const pendienteContainer = buildPlantillaContainer(plantilla, null);
                pendienteContainer.addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`reclamar_${plantillaId}`)
                            .setLabel('Reclamar')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(process.env.emoji_greentick),
                        new ButtonBuilder()
                            .setCustomId(`retirar_${plantillaId}`)
                            .setLabel('Retirar')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(process.env.emoji_yellowtick),
                    )
                );

                await interaction.editReply({ components: [pendienteContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

                const cancelContainer = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greytick}> Has cancelado la reclamación de la plantilla de <@${plantilla.userId}>.`)
                    );
                await interaction.followUp({ components: [cancelContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }
        },
    },
];
