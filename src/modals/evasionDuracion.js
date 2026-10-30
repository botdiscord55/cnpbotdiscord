const { aplicarVetoMenu, parseDuracion, responderError } = require('../utils/evasion');

module.exports = [
    {
        customId: 'evamod_',
        execute: async (interaction) => {
            const suffix = interaction.customId.replace('evamod_', '');

            let texto = '';
            try { texto = interaction.fields.getTextInputValue('duracion'); } catch {}
            const dur = parseDuracion(texto);
            if (!dur) {
                return responderError(
                    interaction,
                    `Duración no reconocida: \`${texto || '(vacío)'}\`. Usa por ejemplo: \`27d\`, \`1mes\`, \`2meses\`, \`1w\` o \`48h\`.`,
                    'duración personalizada no reconocida',
                    'elegir la duración personalizada del veto de evasión'
                );
            }

            await interaction.deferUpdate().catch(() => {});
            return aplicarVetoMenu(interaction, suffix, dur, { nombreLog: 'elegir la duración personalizada del veto de evasión' });
        },
    },
];
