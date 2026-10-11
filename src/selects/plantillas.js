const { ContainerBuilder, TextDisplayBuilder, MessageFlagsBitField } = require('discord.js');
const { buildRegistrosCard, esAgenteCnp } = require('../utils/plantillasCard');
const { track } = require('../utils/plantillasLive');
const { programarBorrado } = require('../utils/tempMsg');
const { logAction, resolveActionNombre } = require('../utils/actionLog');

module.exports = [
    {
        customId: 'plantillas_period_',
        execute: async (interaction) => {
            const userId = interaction.customId.replace('plantillas_period_', '');
            const period = interaction.values[0];

            if (!(await esAgenteCnp(interaction))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: resolveActionNombre(interaction, 'plantillas_period_'), motivo: 'no tiene el rol de Agente CNP' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Solo los **Agentes de la CNP** pueden ver estos registros.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const build = () => buildRegistrosCard(userId, period, 0);
            const { container } = build();
            await interaction.update({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            track(interaction.client, interaction.message, () => ({ components: [build().container] }));
            programarBorrado(interaction.message);
        },
    },
];
