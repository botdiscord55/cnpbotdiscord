const { Events } = require('discord.js');
const { logAction, chatNombre, resolveActionNombre, skipSuccess, actionExtra } = require('../utils/actionLog');
const { programarBorrado } = require('../utils/tempMsg');

function errorReply(interaction, text) {
    const reply = { content: text, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(reply).catch(() => {});
    }
    return interaction.reply(reply).catch(() => {});
}

function commandExtra(interaction) {
    try {
        if (interaction.commandName === 'veto') {
            const u = interaction.options.getUser('usuario');
            return u ? `objetivo: <@${u.id}>` : '';
        }
        if (interaction.commandName === 'tramitar') {
            const u = interaction.options.getUser('usuario');
            return u ? `CK de <@${u.id}>` : '';
        }
        if (interaction.commandName === 'resultado') {
            const u = interaction.options.getUser('usuario');
            const r = interaction.options.getString('resultado');
            if (u && r) return `<@${u.id}>: **${r}**`;
        }
    } catch {}
    return '';
}

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            const nombre = chatNombre(interaction);
            try {
                await command.execute(interaction);
                if (!interaction.__logged) {
                    await logAction(interaction, { tipo: 'comando', estado: 'ok', nombre, extra: commandExtra(interaction) });
                }
            } catch (error) {
                console.error(error);
                await errorReply(interaction, 'Error al ejecutar el comando.');
                await logAction(interaction, { tipo: 'comando', estado: 'error', nombre });
            }
            return;
        }

        let registry = null;
        if (interaction.isStringSelectMenu()) {
            registry = interaction.client.selects;
        } else if (interaction.isButton()) {
            registry = interaction.client.buttons;
        } else if (interaction.type === 5) {
            registry = interaction.client.modals;
        }
        if (!registry) return;

        const customId = interaction.customId;
        for (const [key, handler] of registry) {
            if (!customId.startsWith(key)) continue;

            if (customId.startsWith('plantillas_') && (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.message) {
                try { programarBorrado(interaction.message); } catch {}
            }

            const nombre = resolveActionNombre(interaction, key);
            try {
                await handler.execute(interaction);
                if (!interaction.__logged && !skipSuccess(key, interaction)) {
                    const rawId = customId.startsWith(key) ? customId.slice(key.length) : '';
                    const extra = actionExtra(interaction, key, rawId);
                    await logAction(interaction, { tipo: 'accion', estado: 'ok', nombre, extra });
                }
            } catch (error) {
                console.error(error);
                await errorReply(interaction, 'Error al procesar.');
                await logAction(interaction, { tipo: 'accion', estado: 'error', nombre });
            }
            break;
        }
    },
};
