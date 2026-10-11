const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlagsBitField,
} = require('discord.js');
const { savePlantilla } = require('../database/plantillas');
const { registrarTestMsg } = require('../database/testmsgs');

const EMOJI_MAP = {
    bien: `<:${process.env.emoji_greentick}>`,
    dudoso: `<:${process.env.emoji_greytick}>`,
    mal: `<:${process.env.emoji_redtick}>`,
};

async function crearPlantillaTest(client, targetUserId, targetTag, targetUsername) {
    const plantillaId = `${targetUserId}_${Date.now()}`;
    const evaluacion = { pg: 'bien', mg: 'bien', bd: 'dudoso', vdm: 'bien' };

    savePlantilla(plantillaId, {
        userId: targetUserId,
        userTag: targetTag,
        userName: targetUsername,
        nombre: 'Adrián Molina Carrasco',
        dni: '45678912T',
        edad: '23',
        pg: 'PG = Power Gaming. Forzar una escena forzando la física del servidor.',
        mg: 'MG = Metagaming. Usar información OOC dentro de la RP.',
        bd: 'BD = Bad Driving. Conducción antirrealista.',
        vdm: 'VDM = Vehicle Deathmatch. Atropellar con intención de matar.',
        licConducir: 'Sí',
        licArmas: 'No',
        multas: 'No',
        evaluacion,
        test: true,
    });

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### SOLICITUD DE INGRESO - ACADEMIA DE POLICÍA')
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Información OOC del solicitante:** <@${targetUserId}>\n` +
                `**ID Única:** \`${targetUserId}\`\n` +
                `-# ID de la solicitud: \`${plantillaId}\``
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Ficha de Identificación General**\n' +
                '> ***Nombre Completo:*** Adrián Molina Carrasco\n' +
                '> ***Número de DNI:*** 45678912T\n' +
                '> ***Edad OOC:*** 23'
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Evaluación de Conocimientos Teóricos**\n' +
                `> ${EMOJI_MAP[evaluacion.pg]} ***Concepto de PG:*** PG = Power Gaming. Forzar una escena forzando la física del servidor.\n` +
                `> ${EMOJI_MAP[evaluacion.mg]} ***Concepto de MG:*** MG = Metagaming. Usar información OOC dentro de la RP.\n` +
                `> ${EMOJI_MAP[evaluacion.bd]} ***Concepto de BD:*** BD = Bad Driving. Conducción antirrealista.\n` +
                `> ${EMOJI_MAP[evaluacion.vdm]} ***Concepto de VDM:*** VDM = Vehicle Deathmatch. Atropellar con intención de matar.`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Estatus de Trámites y Permisos**\n' +
                `> <:${process.env.emoji_greentick}> ***Licencia de Conducir:*** Sí\n` +
                `> <:${process.env.emoji_redtick}> ***Licencia de Armas:*** No\n` +
                `> <:${process.env.emoji_greentick}> ***Multas/Antecedentes:*** No`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addActionRowComponents(
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

    const canalRegistro = await client.channels.fetch(process.env.canalregistro_plantillaenviar);
    const enviado = await canalRegistro.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2, allowed_mentions: { parse: [] } });
    registrarTestMsg(enviado && enviado.id, canalRegistro.id, 'plantilla');

    return plantillaId;
}

module.exports = { crearPlantillaTest };
