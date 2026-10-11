const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlagsBitField,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const { getOposicion, updateOposicion, deleteOposicion } = require('../database/oposiciones');
const { logAction } = require('../utils/actionLog');

module.exports = [
    {
        customId: 'modal_cancelar_oposicion_',
        execute: async (interaction) => {
            const code = interaction.customId.replace('modal_cancelar_oposicion_', '');
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

            const motivo = interaction.fields.getTextInputValue('motivo');
            updateOposicion(code, { estado: 'cancelada', fechaFin: new Date().toISOString(), motivoCancelacion: motivo });

            const canalOposicion = await interaction.client.channels.fetch(process.env.canaloposicion_pendiente);
            const cancelContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('### CONVOCATORIA CANCELADA')
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `Se informa a todos los opositores que la convocatoria ha sido cancelada por **${motivo}**. Sentimos las molestias.`
                    )
                );
            await canalOposicion.send({ components: [cancelContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            const updated = getOposicion(code);

            const imagePath = path.join(__dirname, '..', '..', 'convocatoriasimagen.png');
            const attachment = new AttachmentBuilder(imagePath, { name: 'logo.png' });

            const estadoContainer = new ContainerBuilder()
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
                        `> <:${process.env.emoji_redtick}> **Estado:** Cancelada\n` +
                        `> 🗓️ **Fecha:** ${updated.fecha}\n` +
                        `> 🕕 **Hora:** ${updated.hora}`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Cancelada el ${new Date(updated.fechaFin).toLocaleString('es-ES')}`)
                );

            await interaction.update({ components: [estadoContainer], files: [attachment], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Convocatoria cancelada.`)
                );
            await interaction.reply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });

            deleteOposicion(code);
        },
    },
];
