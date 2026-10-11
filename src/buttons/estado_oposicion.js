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
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const { getOposicion, updateOposicion, deleteOposicion } = require('../database/oposiciones');
const { logAction } = require('../utils/actionLog');

function buildEstadoContainer(code, oposicion) {
    const ESTADO_LABELS = {
        pendiente: 'Pendiente',
        en_curso: 'En curso',
        finalizada: 'Finalizada',
        cancelada: 'Cancelada',
    };

    const ESTADO_EMOJI = {
        pendiente: process.env.emoji_yellowtick,
        en_curso: process.env.emoji_greentick,
        finalizada: process.env.emoji_greytick,
        cancelada: process.env.emoji_redtick,
    };

    const estado = oposicion.estado;
    const estadoEmoji = ESTADO_EMOJI[estado] || process.env.emoji_greytick;

    const imagePath = path.join(__dirname, '..', '..', 'convocatoriasimagen.png');
    const attachment = new AttachmentBuilder(imagePath, { name: 'logo.png' });

    const container = new ContainerBuilder()
        .setAccentColor(0xfee75c)
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://logo.png')
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} ${code}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> <:${estadoEmoji}> **Estado:** ${ESTADO_LABELS[estado]}\n` +
                `> 🗓️ **Fecha:** ${oposicion.fecha}\n` +
                `> 🕕 **Hora:** ${oposicion.hora}`
            )
        );

    if (oposicion.estado === 'en_curso') {
        const votos = oposicion.votos || { opositores: 0, instructores: 0, observadores: 0 };
        container
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `> 🖐️ **Opositores:** ${votos.opositores}\n` +
                    `> 👮 **Instructores:** ${votos.instructores}\n` +
                    `> 🚓 **Observadores:** ${votos.observadores}`
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Iniciada el ${new Date(oposicion.fechaInicio).toLocaleString('es-ES')}`)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`finalizar_oposicion_${code}`)
                        .setLabel('Finalizar')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(process.env.emoji_greentick),
                    new ButtonBuilder()
                        .setCustomId(`desactivar_unirse_${code}`)
                        .setLabel('Desactivar unirse')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🚫'),
                )
            );
    } else if (oposicion.estado === 'finalizada') {
        const fechaInicio = new Date(oposicion.fechaInicio).toLocaleString('es-ES');
        const fechaFin = new Date(oposicion.fechaFin).toLocaleString('es-ES');
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        ).addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Iniciada: ${fechaInicio}\n-# Finalizada: ${fechaFin}`)
        ).addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`descargar_lista_${code}`)
                    .setLabel('Descargar lista')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📄'),
            )
        );
    } else if (oposicion.estado === 'cancelada') {
        const fechaCancelacion = new Date(oposicion.fechaFin).toLocaleString('es-ES');
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        ).addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Cancelada el ${fechaCancelacion}`)
        );
    }

    return { container, attachment };
}

module.exports = [
    {
        customId: 'iniciar_oposicion_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const code = interaction.customId.replace('iniciar_oposicion_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'iniciar la convocatoria', motivo: 'oposición no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Oposición no encontrada.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.userId !== interaction.user.id) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'iniciar la convocatoria', motivo: 'este código no te pertenece' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este código no te pertenece.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.estado !== 'pendiente') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'iniciar la convocatoria', motivo: 'esta oposición ya no está pendiente' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta oposición ya no está pendiente.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            updateOposicion(code, { estado: 'en_curso', fechaInicio: new Date().toISOString() });
            const updated = getOposicion(code);

            const canalOposicion = await interaction.client.channels.fetch(process.env.canaloposicion_pendiente);

            let votos = { opositores: 0, instructores: 0, observadores: 0 };
            let participantes = [];
            try {
                const messages = await canalOposicion.messages.fetch({ limit: 100 });
                for (const [, msg] of messages) {
                    if (msg.author.bot && msg.reactions.cache.size > 0) {
                        try {
                            const oReact = msg.reactions.cache.get('🖐️');
                            const iReact = msg.reactions.cache.get('👮');
                            const obReact = msg.reactions.cache.get('🚓');

                            if (oReact) {
                                const users = await oReact.users.fetch();
                                users.forEach(u => {
                                    if (!u.bot) participantes.push({ id: u.id, username: u.username, apodo: u.tag, tipo: 'Opositor' });
                                });
                                votos.opositores = users.filter(u => !u.bot).size;
                            }
                            if (iReact) {
                                const users = await iReact.users.fetch();
                                users.forEach(u => {
                                    if (!u.bot) participantes.push({ id: u.id, username: u.username, apodo: u.tag, tipo: 'Instructor' });
                                });
                                votos.instructores = users.filter(u => !u.bot).size;
                            }
                            if (obReact) {
                                const users = await obReact.users.fetch();
                                users.forEach(u => {
                                    if (!u.bot) participantes.push({ id: u.id, username: u.username, apodo: u.tag, tipo: 'Observador' });
                                });
                                votos.observadores = users.filter(u => !u.bot).size;
                            }
                        } catch {}
                    }
                    try { await msg.delete(); } catch {}
                }
            } catch {}

            updateOposicion(code, { votos, participantes });

            const iniciarContainer = new ContainerBuilder()
                .setAccentColor(0xfee75c)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} CONVOCATORIA INICIADA`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        'Se informa a todos los opositores que la convocatoria ha iniciado. Entrad al canal de voz correspondiente junto al servidor de ERLC con el código **OPOSARP**. Preparaos con el uniforme Z sentados en la sala de reuniones.'
                    )
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`unirse_convocatoria_${code}`)
                            .setLabel('Unirse a la convocatoria')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(process.env.emoji_greentick),
                    )
                );
            const msgIniciar = await canalOposicion.send({ components: [iniciarContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            updateOposicion(code, { msgUnirseId: msgIniciar.id });
            setTimeout(() => { msgIniciar.delete().catch(() => {}); }, 5 * 60 * 1000);

            setTimeout(async () => {
                const current = getOposicion(code);
                if (!current || current.estado !== 'en_curso') return;

                updateOposicion(code, {
                    estado: 'cancelada',
                    fechaFin: new Date().toISOString(),
                    motivoCancelacion: 'Cancelada automáticamente - 6 horas sin finalizar',
                });

                try {
                    const cancelContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} OPOSICIÓN CANCELADA`)
                        )
                        .addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent('La oposición ha sido cancelada automáticamente por superar las 6 horas de duración.')
                        );
                    await canalOposicion.send({ components: [cancelContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                } catch {}

                try { await interaction.message.edit({ components: [], flags: MessageFlagsBitField.Flags.IsComponentsV2 }); } catch {}
            }, 6 * 60 * 60 * 1000);

            const { container, attachment } = buildEstadoContainer(code, updated);
            await interaction.editReply({ components: [container], files: [attachment], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        },
    },
    {
        customId: 'finalizar_oposicion_',
        execute: async (interaction) => {
            const code = interaction.customId.replace('finalizar_oposicion_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'finalizar la convocatoria', motivo: 'oposición no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Oposición no encontrada.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.userId !== interaction.user.id) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'finalizar la convocatoria', motivo: 'este código no te pertenece' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este código no te pertenece.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.estado !== 'en_curso') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'finalizar la convocatoria', motivo: 'esta oposición no está en curso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta oposición no está en curso.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const now = new Date();
            const fechaFinal = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
            const horaFinal = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });

            updateOposicion(code, { estado: 'finalizada', fecha: fechaFinal, hora: horaFinal, fechaFin: now.toISOString() });
            const updated = getOposicion(code);

            const canalOposicion = await interaction.client.channels.fetch(process.env.canaloposicion_pendiente);

            let lastMessageId;
            try {
                const messages = await canalOposicion.messages.fetch({ limit: 100 });
                for (const [, msg] of messages) {
                    try { await msg.delete(); } catch {}
                }
                lastMessageId = null;
            } catch {}

            const finalContainer = new ContainerBuilder()
                .setAccentColor(0x2b2d31)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} CONVOCATORIA FINALIZADA`)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `La convocatoria del **${fechaFinal}** ha finalizado a las **${horaFinal}**. ¡Le invitamos a opositar en la siguiente!`
                    )
                );
            await canalOposicion.send({ components: [finalContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            const { container, attachment } = buildEstadoContainer(code, updated);
            await interaction.update({ components: [container], files: [attachment], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            deleteOposicion(code);
        },
    },
    {
        customId: 'cancelar_oposicion_',
        execute: async (interaction) => {
            const code = interaction.customId.replace('cancelar_oposicion_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'cancelar la oposición', motivo: 'oposición no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Oposición no encontrada.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.userId !== interaction.user.id) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'cancelar la oposición', motivo: 'este código no te pertenece' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este código no te pertenece.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.estado !== 'pendiente') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'cancelar la oposición', motivo: 'esta oposición ya no está pendiente' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta oposición ya no está pendiente.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_cancelar_oposicion_${code}`)
                .setTitle('Cancelar convocatoria')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('motivo')
                            .setLabel('Motivo de cancelación')
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setPlaceholder('Escribe el motivo...')
                    )
                );

            await interaction.showModal(modal);
        },
    },
    {
        customId: 'descargar_lista_',
        execute: async (interaction) => {
            await interaction.deferReply({ ephemeral: true });
            const code = interaction.customId.replace('descargar_lista_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'descargar la lista', motivo: 'oposición no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Oposición no encontrada.`)
                    );
                return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            }

            const participantes = oposicion.participantes || [];
            if (participantes.length === 0) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'descargar la lista', motivo: 'no hay participantes registrados' });
                const emptyContainer = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> No hay participantes registrados.`)
                    );
                return interaction.editReply({ components: [emptyContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            }

            let txt = `Lista de participantes - ${code}\n`;
            txt += `Fecha: ${oposicion.fecha} | Hora: ${oposicion.hora}\n`;
            txt += `Total: ${participantes.length} participantes\n`;
            txt += '─'.repeat(50) + '\n\n';

            const unidos = oposicion.unidos || [];
            const opositores = participantes.filter(p => p.tipo === 'Opositor');
            const instructores = participantes.filter(p => p.tipo === 'Instructor');
            const observadores = participantes.filter(p => p.tipo === 'Observador');

            if (opositores.length > 0) {
                txt += `🖐️ OPOSITORES (${opositores.length})\n`;
                opositores.forEach(p => {
                    const seUnio = unidos.includes(p.id);
                    txt += `  • ${p.apodo} (${p.username}) - ${p.id} → ${seUnio ? '✅ Se unió' : '❌ No se unió'}\n`;
                });
                txt += '\n';
            }
            if (instructores.length > 0) {
                txt += `👮 INSTRUCTORES (${instructores.length})\n`;
                instructores.forEach(p => {
                    const seUnio = unidos.includes(p.id);
                    txt += `  • ${p.apodo} (${p.username}) - ${p.id} → ${seUnio ? '✅ Se unió' : '❌ No se unió'}\n`;
                });
                txt += '\n';
            }
            if (observadores.length > 0) {
                txt += `🚓 OBSERVADORES (${observadores.length})\n`;
                observadores.forEach(p => {
                    const seUnio = unidos.includes(p.id);
                    txt += `  • ${p.apodo} (${p.username}) - ${p.id} → ${seUnio ? '✅ Se unió' : '❌ No se unió'}\n`;
                });
            }

            const { AttachmentBuilder } = require('discord.js');
            const file = new AttachmentBuilder(Buffer.from(txt, 'utf-8'), { name: `participantes_${code}.txt` });

            const successContainer = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Lista de ${participantes.length} participantes descargada.`)
                );
            await interaction.editReply({ components: [successContainer], files: [file], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        },
    },
    {
        customId: 'desactivar_unirse_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const code = interaction.customId.replace('desactivar_unirse_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'desactivar las inscripciones', motivo: 'oposición no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Oposición no encontrada.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.userId !== interaction.user.id) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'desactivar las inscripciones', motivo: 'este código no te pertenece' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este código no te pertenece.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            updateOposicion(code, { unirseDesactivado: true });

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Botón de unirse desactivado.`)
                );
            await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        },
    },
    {
        customId: 'reactivar_unirse_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const code = interaction.customId.replace('reactivar_unirse_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reactivar las inscripciones', motivo: 'oposición no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Oposición no encontrada.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.userId !== interaction.user.id) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'reactivar las inscripciones', motivo: 'este código no te pertenece' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este código no te pertenece.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            updateOposicion(code, { unirseDesactivado: false });

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Botón de unirse reactivado.`)
                );
            await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        },
    },
];
