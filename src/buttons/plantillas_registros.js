const { ContainerBuilder, TextDisplayBuilder, MessageFlagsBitField } = require('discord.js');
const { buildPlantillasCard, buildRegistrosCard, esAgenteCnp } = require('../utils/plantillasCard');
const { track } = require('../utils/plantillasLive');
const { programarBorrado } = require('../utils/tempMsg');
const { logAction, resolveActionNombre } = require('../utils/actionLog');

function denyContainer() {
    return new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Solo los **Agentes de la CNP** pueden ver estos registros.`)
        );
}

async function deny(interaction, key) {
    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: resolveActionNombre(interaction, key), motivo: 'no tiene el rol de Agente CNP' });
    return interaction.reply({ components: [denyContainer()], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
}

function parseNav(customId) {
    const rest = customId.replace('plantillas_nav_', '');
    const parts = rest.split('_');
    const page = parts.pop();
    const period = parts.pop();
    const userId = parts.join('_');
    return { userId, period, page };
}

async function show(interaction, build) {
    const { container } = build();
    await interaction.update({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    track(interaction.client, interaction.message, () => ({ components: [build().container] }));
    programarBorrado(interaction.message);
}

module.exports = [
    {
        customId: 'plantillas_reg_',
        execute: async (interaction) => {
            const userId = interaction.customId.replace('plantillas_reg_', '');
            if (!(await esAgenteCnp(interaction))) return deny(interaction, 'plantillas_reg_');

            await show(interaction, () => buildRegistrosCard(userId, 'total', 0));
        },
    },
    {
        customId: 'plantillas_nav_',
        execute: async (interaction) => {
            const { userId, period, page } = parseNav(interaction.customId);
            if (!(await esAgenteCnp(interaction))) return deny(interaction, 'plantillas_nav_');

            await show(interaction, () => buildRegistrosCard(userId, period, page));
        },
    },
    {
        customId: 'plantillas_back_',
        execute: async (interaction) => {
            const userId = interaction.customId.replace('plantillas_back_', '');
            if (!(await esAgenteCnp(interaction))) return deny(interaction, 'plantillas_back_');

            await show(interaction, () => buildPlantillasCard(userId, { instructor: userId === interaction.user.id }));
        },
    },
];
