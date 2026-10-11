const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const { createOposicion, getOposicion } = require('../database/oposiciones');

async function publicarConvocatoria(client, { code, userId, userTag, fecha, hora, aceptadoPor, aceptadoPorTag }) {
    if (getOposicion(code)) {
        return { ok: false, error: `Ya existe una oposición con el código ${code}.` };
    }

    const created = createOposicion({ code, userId, userTag, fecha, hora, aceptadoPor, aceptadoPorTag });
    if (!created) {
        return { ok: false, error: `No se pudo crear la oposición ${code}.` };
    }

    const canalOposicion = await client.channels.fetch(process.env.canaloposicion_pendiente);

    try {
        let lastId;
        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;
            const messages = await canalOposicion.messages.fetch(options);
            if (messages.size === 0) break;
            for (const [, msg] of messages) {
                try { await msg.delete(); } catch {}
            }
            lastId = messages.last().id;
            if (messages.size < 100) break;
        }
    } catch {}

    const imagePath = path.join(__dirname, '..', '..', 'convocatoriasimagen.png');
    const attachment = new AttachmentBuilder(imagePath, { name: 'convocatoria.png' });

    const mentions = [`<@&${process.env.rolplantilla_aceptada}>`, `<@&${process.env.rolagente_cnp}>`];
    if (process.env.rolinstructores) mentions.push(`<@&${process.env.rolinstructores}>`);

    await canalOposicion.send({ content: mentions.join(' ') });

    const container = new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**CONVOCATORIA OFICIAL DE OPOSICIONES A LA POLICÍA NACIONAL**\n*Cuerpo Nacional de Policía – Proceso Selectivo*')
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                'Se informa a todos los opositores que las **oposiciones** para el ingreso al **Cuerpo Nacional de Policía** se celebrará el siguiente día:'
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> 🗓️ **Fecha:** ${fecha}\n> 🕕 **Hora:** ${hora}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://convocatoria.png')
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `- Para obtener una **calificación extraordinaria**, deberá estudiar todo el temario que se encuentra en <#${process.env.canalmaterial_estudio}>.`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**🧰 EQUIPAMIENTO NECESARIO PARA LA PRUEBA:**\n' +
                'Todos los opositores deberán contar con el siguiente material reglamentario:\n\n' +
                '> • **Glock 17** con sus cargadores.\n' +
                '> • **Táser** X26.\n' +
                '> • Un par de **grilletes**.\n' +
                '> • **Porra** reglamentaria.\n' +
                '> • **Spray de pimienta**.'
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**CONFIRMACIÓN DE ASISTENCIA:**\n\n' +
                `> • Los opositores <@&${process.env.rolplantilla_aceptada}> que asistan reaccionen a: 🖐️\n` +
                `> • Los instructores <@&${process.env.rolinstructores}> que asistan reaccionen a: 👮\n` +
                `> • Los que no sean opositores <@&${process.env.rolagente_cnp}> que asistan reaccionen a: 🚓\n` +
                '-# Quien reaccione como asistente y no asista, perderá su rol de Plantilla Aceptada.'
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '¡Mucha suerte a todos! ¡Demuestren su valía y compromiso con el **Cuerpo Nacional de Policía**!'
            )
        );

    const sentMsg = await canalOposicion.send({
        components: [container],
        files: [attachment],
        flags: MessageFlagsBitField.Flags.IsComponentsV2,
    });

    try {
        await sentMsg.react('🖐️');
        await sentMsg.react('👮');
        await sentMsg.react('🚓');
    } catch {}

    return { ok: true, code };
}

module.exports = { publicarConvocatoria };
