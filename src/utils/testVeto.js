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
const { createVeto, updateVeto, getVetoByUser, deleteVeto } = require('../database/vetos');
const { registrarTestMsg } = require('../database/testmsgs');

function parseDias(dias) {
    const num = parseInt(dias, 10);
    if (!num || num <= 0) return { ms: 0, label: 'Indefinido' };
    return { ms: num * 24 * 60 * 60 * 1000, label: `${num} ${num === 1 ? 'día' : 'días'}` };
}

async function crearVetoTest(client, targetUserId, dias = 1) {
    const anterior = getVetoByUser(targetUserId, { includeTest: true });
    if (anterior && anterior[1] && anterior[1].test === true) {
        deleteVeto(anterior[0]);
    }

    const dur = parseDias(dias);
    const motivoTest = 'Comportamiento inadecuado durante la formación';
    const vetoId = createVeto({
        userId: targetUserId,
        motivo: motivoTest,
        duracion: dur.ms ? `${dias}d` : null,
        creadoPor: '0',
        creadoPorTag: 'Consola',
        creadoPorNickname: 'Consola',
        test: true,
    });

    if (dur.ms) {
        updateVeto(vetoId, { expiresAt: new Date(Date.now() + dur.ms).toISOString() });
    }

    const container = new ContainerBuilder()
        .setAccentColor(0xfee75c)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO ACADÉMICO — \`${vetoId}\``)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `> **Usuario:** <@${targetUserId}>\n` +
                `> **Duración:** ${dur.label}\n` +
                `> **Motivo:** ${motivoTest}\n` +
                `> **Aplicado por:** <@${process.env.duenio_delbot}>`
            )
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`autorizar_${vetoId}`)
            .setLabel('Autorizar')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(process.env.emoji_greentick),
        new ButtonBuilder()
            .setCustomId(`rechazar_plantilla_${vetoId}`)
            .setLabel('Denegar')
            .setStyle(ButtonStyle.Danger)
            .setEmoji(process.env.emoji_redtick),
    );

    const canalVetos = await client.channels.fetch(process.env.canalregistros_vetos);
    const enviado = await canalVetos.send({ components: [container, row], flags: MessageFlagsBitField.Flags.IsComponentsV2, allowed_mentions: { parse: [] } });
    registrarTestMsg(enviado && enviado.id, canalVetos.id, 'veto');

    return vetoId;
}

module.exports = { crearVetoTest, parseDias };
