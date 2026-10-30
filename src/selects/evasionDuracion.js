const { aplicarVetoMenu, responderError } = require('../utils/evasion');

module.exports = [
    {
        customId: 'evadur_',
        execute: async (interaction) => {
            const suffix = interaction.customId.replace('evadur_', '');
            const valor = (interaction.values && interaction.values[0]) || '';

            if (valor === 'custom') {
                // El personalizado abre un modal (27d, 1mes, 2meses, 1w, 48h...)
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
                const modal = new ModalBuilder()
                    .setCustomId(`evamod_${suffix}`)
                    .setTitle('Duración personalizada del veto')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('duracion')
                                .setLabel('Duración (ej: 27d, 1mes, 2meses, 1w, 48h)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setMaxLength(20)
                                .setPlaceholder('27d · 1mes · 2meses · 1w · 48h')
                        )
                    );
                return interaction.showModal(modal);
            }

            await interaction.deferUpdate().catch(() => {});

            const { parseDuracion } = require('../utils/evasion');
            const dur = parseDuracion(valor);
            if (!dur) {
                return responderError(interaction, `Duración no reconocida: \`${valor}\`.`, 'duración no reconocida', 'elegir la duración del veto de evasión');
            }

            return aplicarVetoMenu(interaction, suffix, dur, { nombreLog: 'elegir la duración del veto de evasión' });
        },
    },
];
