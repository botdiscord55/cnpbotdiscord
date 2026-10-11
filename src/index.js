require('dotenv').config();

process.on('uncaughtException', (e) => console.error('[FATAL] uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('[FATAL] unhandledRejection:', e));

const { restOptions } = require('./proxy');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
    ],
    rest: restOptions,
});

client.commands = new Collection();
client.selects = new Collection();
client.buttons = new Collection();
client.modals = new Collection();
client._activeClaims = new Map();

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
    }
}

const selectsPath = path.join(__dirname, 'selects');
if (fs.existsSync(selectsPath)) {
    const selectFiles = fs.readdirSync(selectsPath).filter(f => f.endsWith('.js'));
    for (const file of selectFiles) {
        const selects = require(path.join(selectsPath, file));
        if (Array.isArray(selects)) {
            for (const select of selects) {
                if ('customId' in select && 'execute' in select) {
                    client.selects.set(select.customId, select);
                }
            }
        }
    }
}

const buttonsPath = path.join(__dirname, 'buttons');
if (fs.existsSync(buttonsPath)) {
    const buttonFiles = fs.readdirSync(buttonsPath).filter(f => f.endsWith('.js'));
    for (const file of buttonFiles) {
        const buttons = require(path.join(buttonsPath, file));
        if (Array.isArray(buttons)) {
            for (const button of buttons) {
                if ('customId' in button && 'execute' in button) {
                    client.buttons.set(button.customId, button);
                }
            }
        }
    }
}

const modalsPath = path.join(__dirname, 'modals');
if (fs.existsSync(modalsPath)) {
    const modalFiles = fs.readdirSync(modalsPath).filter(f => f.endsWith('.js'));
    for (const file of modalFiles) {
        const modals = require(path.join(modalsPath, file));
        if (Array.isArray(modals)) {
            for (const modal of modals) {
                if ('customId' in modal && 'execute' in modal) {
                    client.modals.set(modal.customId, modal);
                }
            }
        }
    }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

async function loginConReintentos() {
    let intento = 0;
    for (;;) {
        intento++;
        try {
            await client.login(process.env.DISCORD_TOKEN);
            return;
        } catch (e) {
            const msg = String((e && e.message) || e);
            const codigo = String((e && e.code) || (e && e.name) || '');
            if (codigo === 'TokenInvalid' || /token.*(invalid|not correct|incorrect)|invalid.*token/i.test(msg)) {
                console.error('[Consola] Token de Discord inválido. Revisa DISCORD_TOKEN en .env');
                process.exit(1);
            }
            const espera = Math.min(60000, 10000 * intento);
            console.error(`[Consola] No se pudo conectar a Discord (intento ${intento}): ${msg}`);
            const sub = (e && Array.isArray(e.errors)) ? e.errors : (e && e.cause && Array.isArray(e.cause.errors)) ? e.cause.errors : [];
            for (const se of sub) {
                console.error(`[Consola]   causa: ${se.code || se.name || '?'}${se.address ? ` address=${se.address}:${se.port || ''}` : ''}${se.message ? ` (${se.message})` : ''}`);
            }
            if (intento === 1) {
                try {
                    const resp = await fetch('https://discord.com/api/v10/gateway');
                    console.error(`[Consola] Diagnóstico: GET /api/v10/gateway -> HTTP ${resp.status}`);
                } catch (pe) {
                    const pc = (pe && pe.cause) || pe;
                    console.error(`[Consola] Diagnóstico: GET /api/v10/gateway falló: ${pc.code || pc.name || ''} ${pc.message || pc}`);
                }
            }
            console.error(`[Consola] Reintentando en ${Math.round(espera / 1000)}s...`);
            await new Promise(r => setTimeout(r, espera));
        }
    }
}
loginConReintentos();

const { initConsole } = require('./console');
client.once('ready', () => initConsole(client));
