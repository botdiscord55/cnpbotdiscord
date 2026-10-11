const { esInstructor, exportarVertotalCSV, exportarVertotalJSON } = require('../utils/plantillasCard');
const { logAction, resolveActionNombre } = require('../utils/actionLog');
const { programarBorrado } = require('../utils/tempMsg');

function deny(interaction, key) {
    logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: resolveActionNombre(interaction, key), motivo: 'no tiene permiso de instructor' });
    return interaction.reply({ content: `<:${process.env.emoji_redtick}> Solo los **instructores** pueden usar este comando.`, ephemeral: true });
}

function fechaArchivo() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mo}-${dd}`;
}

module.exports = [
    {
        customId: 'plantillas_totalcsv_',
        execute: async (interaction) => {
            if (!(await esInstructor(interaction))) return deny(interaction, 'plantillas_totalcsv_');
            const nombre = `plantillas_total_${fechaArchivo()}.csv`;
            await interaction.reply({
                content: `\`${nombre}\``,
                files: [{ attachment: Buffer.from(exportarVertotalCSV(), 'utf8'), name: nombre }],
                ephemeral: true,
            });
            programarBorrado(interaction.message);
        },
    },
    {
        customId: 'plantillas_totaljson_',
        execute: async (interaction) => {
            if (!(await esInstructor(interaction))) return deny(interaction, 'plantillas_totaljson_');
            const nombre = `plantillas_total_${fechaArchivo()}.json`;
            await interaction.reply({
                content: `\`${nombre}\``,
                files: [{ attachment: Buffer.from(exportarVertotalJSON(), 'utf8'), name: nombre }],
                ephemeral: true,
            });
            programarBorrado(interaction.message);
        },
    },
];
