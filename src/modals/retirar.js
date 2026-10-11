const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlagsBitField,
} = require('discord.js');
const { getPlantilla, updatePlantilla } = require('../database/plantillas');
const { resolverReclamacion } = require('../database/reclamaciones');
const { logAction } = require('../utils/actionLog');

module.exports = [
    {
        customId: 'modal_retirar_',
        execute: async (interaction) => {
            const plantillaId = interaction.customId.replace('modal_retirar_', '');
            const confirmacion = interaction.fields.getTextInputValue('confirmacion');
            const plantilla = getPlantilla(plantillaId);

            if (!plantilla) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'retirar', motivo: 'esta plantilla ya no existe' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya no existe.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (confirmacion !== 'CONFIRMAR') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'retirar', motivo: 'debías escribir CONFIRMAR' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Debes escribir **CONFIRMAR** para retirar la plantilla.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            updatePlantilla(plantillaId, {
                estado: 'retirada',
                retiradaPor: interaction.user.id,
                retiradaTag: interaction.user.tag,
                fechaRetirada: new Date().toISOString(),
            });

            resolverReclamacion(plantillaId, {
                estado: 'retirada',
                resueltaPor: interaction.user.id,
                resueltaTag: interaction.user.tag,
            });

            await interaction.message.delete();

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xfee75c)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> Has retirado la plantilla de <@${plantilla.userId}> correctamente.`)
                );
            await interaction.reply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        },
    },
];
