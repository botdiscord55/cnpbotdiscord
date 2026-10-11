const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlagsBitField,
} = require('discord.js');
const { getPlantilla, updatePlantilla, savePlantilla } = require('../database/plantillas');
const { registrarReclamacion } = require('../database/reclamaciones');
const { logAction } = require('../utils/actionLog');
const { esTestMsg } = require('../database/testmsgs');

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

async function tryRecoverPlantilla(interaction, plantillaId) {
    try {
        const message = interaction.message;
        if (!message || !message.components || !message.components[0]) return null;

        if (esTestMsg(message.id)) return { test: true };

        const container = message.components[0];
        if (!container.components) return null;

        let userId = null;
        let nombre = null;
        let dni = null;
        let edad = null;
        let pg = null, mg = null, bd = null, vdm = null;
        let licConducir = null, licArmas = null, multas = null;
        let todoTexto = '';

        for (const comp of container.components) {
            if (comp.type === 10) {
                const text = comp.content || '';
                todoTexto += ' ' + text;
                const userIdMatch = text.match(/`(\d+)`/);
                if (userIdMatch) userId = userIdMatch[1];

                const nombreMatch = text.match(/Nombre Completo:\*\*\* (.+)/);
                if (nombreMatch) nombre = nombreMatch[1];

                const dniMatch = text.match(/Número de DNI:\*\*\* (.+)/);
                if (dniMatch) dni = dniMatch[1];

                const edadMatch = text.match(/Edad OOC:\*\*\* (.+)/);
                if (edadMatch) edad = edadMatch[1];

                const pgMatch = text.match(/Concepto de PG:\*\*\* (.+)/);
                if (pgMatch) pg = pgMatch[1];

                const mgMatch = text.match(/Concepto de MG:\*\*\* (.+)/);
                if (mgMatch) mg = mgMatch[1];

                const bdMatch = text.match(/Concepto de BD:\*\*\* (.+)/);
                if (bdMatch) bd = bdMatch[1];

                const vdmMatch = text.match(/Concepto de VDM:\*\*\* (.+)/);
                if (vdmMatch) vdm = vdmMatch[1];

                const licCondMatch = text.match(/Licencia de Conducir:\*\*\* (.+)/);
                if (licCondMatch) licConducir = licCondMatch[1];

                const licArmasMatch = text.match(/Licencia de Armas:\*\*\* (.+)/);
                if (licArmasMatch) licArmas = licArmasMatch[1];

                const multasMatch = text.match(/Multas\/Antecedentes:\*\*\* (.+)/);
                if (multasMatch) multas = multasMatch[1];
            }
        }

        const esTestMensaje = todoTexto.includes('🧪') || todoTexto.includes('(TEST)')
            || (String(nombre || '').trim().length <= 3 && String(dni || '').trim().length <= 3);
        if (esTestMensaje) return { test: true };

        if (!userId || !nombre || !dni || !edad) return null;

        const evaluacion = { pg: 'dudoso', mg: 'dudoso', bd: 'dudoso', vdm: 'dudoso' };

        savePlantilla(plantillaId, {
            userId,
            userTag: 'Recuperado',
            userName: 'Recuperado',
            nombre,
            dni,
            edad,
            pg: pg || 'N/A',
            mg: mg || 'N/A',
            bd: bd || 'N/A',
            vdm: vdm || 'N/A',
            licConducir: licConducir || 'No',
            licArmas: licArmas || 'No',
            multas: multas || 'No',
            evaluacion,
            estado: 'pendiente',
            recuperada: true,
        });

        return getPlantilla(plantillaId);
    } catch (e) {
        console.error('Error recuperando plantilla:', e);
        return null;
    }
}

module.exports = [
    {
        customId: 'reclamar_',
        execute: async (interaction) => {
            const plantillaId = interaction.customId.replace('reclamar_', '');
            let plantilla = getPlantilla(plantillaId);

            if (!plantilla) {
                const msgAge = Date.now() - interaction.message.createdTimestamp;
                if (msgAge < 60000) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reclamar', motivo: 'esta plantilla ya no existe' });
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(0xfee75c)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> Esta plantilla ya no existe.`)
                        );
                    return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
                }

                const recoverContainer = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> Plantilla no encontrada en la base de datos. Intentando recuperar del mensaje...`)
                    );
                await interaction.reply({ components: [recoverContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });

                plantilla = await tryRecoverPlantilla(interaction, plantillaId);

                if (!plantilla) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reclamar', motivo: 'no se pudo recuperar la plantilla' });
                    const errorContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No se pudo recuperar la plantilla. El mensaje no contiene suficiente información.`)
                        );
                    return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                }

                if (plantilla.test === true) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reclamar', motivo: 'es una plantilla de prueba' });
                    const testContainer = new ContainerBuilder()
                        .setAccentColor(0xfee75c)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> Esta es una plantilla de prueba. No se puede reclamar.`)
                        );
                    return interaction.editReply({ components: [testContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                }

                const successContainer = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Plantilla recuperada correctamente. Ya puedes reclamarla.`)
                    );
                await interaction.editReply({ components: [successContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                return;
            }

            if (plantilla.estado !== 'pendiente') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reclamar', motivo: 'esta plantilla ya ha sido procesada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya ha sido procesada.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const rolDenegada2 = process.env.rolplantilla_denegada2;
            if (rolDenegada2) {
                let es2de2 = false;
                try {
                    const solicitante = await interaction.guild.members.fetch(plantilla.userId);
                    es2de2 = !!solicitante && solicitante.roles.cache.has(rolDenegada2);
                } catch {}

                if (es2de2) {
                    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reclamar', motivo: 'el solicitante ya tiene 2/2 de plantillas (agotó sus intentos): plantilla retirada automáticamente' });

                    updatePlantilla(plantillaId, {
                        estado: 'retirada',
                        retiradaPor: interaction.user.id,
                        retiradaTag: interaction.user.tag,
                        fechaRetirada: new Date().toISOString(),
                        motivo: 'Solicitante sin intentos (2/2). Retirada automáticamente.',
                    });

                    const warnContainer = new ContainerBuilder()
                        .setAccentColor(0xfee75c)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> **2/2 agotados**: <@${plantilla.userId}> ya no tiene intentos de plantilla. Esta solicitud ha sido **retirada automáticamente**.`)
                        );
                    await interaction.reply({ components: [warnContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
                    try { await interaction.message.delete(); } catch {}
                    return;
                }
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const nickname = member.nickname || interaction.user.username;

            updatePlantilla(plantillaId, {
                estado: 'reclamada',
                reclamadaPor: interaction.user.id,
                reclamadaTag: interaction.user.tag,
                reclamadaNickname: nickname,
                fechaReclamacion: new Date().toISOString(),
            });

            registrarReclamacion({
                plantillaId,
                userId: plantilla.userId,
                userTag: plantilla.userTag,
                reclamadaPor: interaction.user.id,
                reclamadaTag: interaction.user.tag,
                reclamadaNickname: nickname,
            });

            const container = buildPlantillaContainer(plantilla, `Reclamada por ${nickname}`);

            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`decision_${plantillaId}`)
                        .setPlaceholder('Seleccionar una acción...')
                        .addOptions(
                            {
                                label: 'Aceptar',
                                description: 'Aceptar la plantilla del solicitante',
                                value: 'aceptar',
                                emoji: { id: process.env.emoji_greentick.split(':')[1] },
                            },
                            {
                                label: 'Denegar',
                                description: 'Denegar la plantilla del solicitante',
                                value: 'denegar',
                                emoji: { id: process.env.emoji_redtick.split(':')[1] },
                            },
                            {
                                label: 'Cancelar',
                                description: 'Cancelar la reclamación para que otros puedan reclamarla',
                                value: 'cancelar',
                                emoji: { id: process.env.emoji_greytick.split(':')[1] },
                            },
                        )
                )
            );

            await interaction.update({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            const claimTimeout = setTimeout(async () => {
                const current = getPlantilla(plantillaId);
                if (!current || current.estado !== 'reclamada') return;

                updatePlantilla(plantillaId, {
                    estado: 'pendiente',
                    reclamadaPor: null,
                    reclamadaTag: null,
                    reclamadaNickname: null,
                    fechaReclamacion: null,
                });

                const pendienteContainer = buildPlantillaContainer(current, null);
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

                try {
                    await interaction.message.edit({ components: [pendienteContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                } catch {}
            }, 5 * 60 * 1000);

            interaction.client._activeClaims.set(plantillaId, claimTimeout);
        },
    },
    {
        customId: 'retirar_',
        execute: async (interaction) => {
            const plantillaId = interaction.customId.replace('retirar_', '');
            const plantilla = getPlantilla(plantillaId);

            if (!plantilla) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'retirar', motivo: 'esta plantilla ya no existe' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> Esta plantilla ya no existe.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (plantilla.estado !== 'pendiente') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'retirar', motivo: 'esta plantilla ya ha sido procesada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> Esta plantilla ya ha sido procesada.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_retirar_${plantillaId}`)
                .setTitle('Confirmar Retiro de Plantilla');

            const confirmInput = new TextInputBuilder()
                .setCustomId('confirmacion')
                .setLabel('Escribe CONFIRMAR para retirar la plantilla')
                .setPlaceholder('CONFIRMAR')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(9)
                .setMaxLength(9);

            const row = new ActionRowBuilder().addComponents(confirmInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        },
    },
];
