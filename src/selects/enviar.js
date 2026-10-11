const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserData, clearUserData } = require('../data/userData');
const { savePlantilla } = require('../database/plantillas');

async function updateEmbed(interaction, data) {
    const embed = new EmbedBuilder()
        .setTitle('📋 Plantilla de Usuario')
        .setColor(0x5865f2)
        .setDescription(
            `**Nombre Completo:** ${data.nombre || 'N/A'}\n` +
            `**Número de DNI:** ${data.dni || 'N/A'}\n` +
            `**Edad OOC:** ${data.edad || 'N/A'}\n` +
            `**PG:** ${data.pg || 'N/A'}\n` +
            `**MG:** ${data.mg || 'N/A'}\n` +
            `**BD:** ${data.bd || 'N/A'}\n` +
            `**VDM:** ${data.vdm || 'N/A'}\n\n` +
            `**Licencia de Conducir:** ${data.licConducir || 'Pendiente...'}\n` +
            `**Licencia de Armas:** ${data.licArmas || 'Pendiente...'}\n` +
            `**Multas/Antecedentes:** ${data.multas || 'Pendiente...'}`
        )
        .setFooter({ text: `ID: ${interaction.user.id} • ${interaction.user.tag}` })
        .setTimestamp();

    await interaction.update({ embeds: [embed] });
}

async function checkAndSendLog(interaction, data) {
    if (data.licConducir && data.licArmas && data.multas) {
        const canalRegistro = await interaction.client.channels.fetch(process.env.canalregistro_plantillaenviar);

        const plantillaId = `${interaction.user.id}_${Date.now()}`;

        savePlantilla(plantillaId, {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            userName: interaction.user.username,
            nombre: data.nombre,
            dni: data.dni,
            edad: data.edad,
            pg: data.pg,
            mg: data.mg,
            bd: data.bd,
            vdm: data.vdm,
            licConducir: data.licConducir,
            licArmas: data.licArmas,
            multas: data.multas,
        });

        const logEmbed = new EmbedBuilder()
            .setTitle('SOLICITUD DE INGRESO - ACADEMIA DE POLICÍA')
            .setColor(0xfee75c)
            .setDescription(
                `**Información OOC del solicitante:** <@${interaction.user.id}>\n` +
                `**ID Única:** \`${interaction.user.id}\`\n\n` +
                `**Ficha de Identificación General**\n` +
                `> ***Nombre Completo:*** ${data.nombre}\n` +
                `> ***Número de DNI:*** ${data.dni}\n\n` +
                `**Evaluación de Conocimientos Teóricos**\n` +
                `> ***Concepto de PG:*** ${data.pg}\n` +
                `> ***Concepto de MG:*** ${data.mg}\n` +
                `> ***Concepto de BD:*** ${data.bd}\n` +
                `> ***Concepto de VDM:*** ${data.vdm}\n\n` +
                `**Estatus de Trámites y Permisos**\n` +
                `> ***Licencia de Conducir:*** ${data.licConducir}\n` +
                `> ***Licencia de Armas:*** ${data.licArmas}\n` +
                `> ***Multas/Antecedentes:*** ${data.multas}`
            )
            .setFooter({ text: `ID Plantilla: ${plantillaId}` })
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`reclamar_${plantillaId}`)
                .setLabel('Reclamar')
                .setStyle(ButtonStyle.Success)
                .setEmoji(process.env.emoji_greentick),
            new ButtonBuilder()
                .setCustomId(`retirar_${plantillaId}`)
                .setLabel('Retirar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(process.env.emoji_redtick),
        );

        await canalRegistro.send({ embeds: [logEmbed], components: [buttons] });
        clearUserData(interaction.user.id);
    }
}

module.exports = [
    {
        customId: 'envio_liccond_',
        execute: async (interaction) => {
            const data = getUserData(interaction.user.id);
            data.licConducir = interaction.values[0] === 'si_liccond' ? 'Sí' : 'No';
            await updateEmbed(interaction, data);
            await checkAndSendLog(interaction, data);
        },
    },
    {
        customId: 'envio_licarmas_',
        execute: async (interaction) => {
            const data = getUserData(interaction.user.id);
            data.licArmas = interaction.values[0] === 'si_licarmas' ? 'Sí' : 'No';
            await updateEmbed(interaction, data);
            await checkAndSendLog(interaction, data);
        },
    },
    {
        customId: 'envio_multas_',
        execute: async (interaction) => {
            const data = getUserData(interaction.user.id);
            data.multas = interaction.values[0] === 'si_multas' ? 'Sí' : 'No';
            await updateEmbed(interaction, data);
            await checkAndSendLog(interaction, data);
        },
    },
];
