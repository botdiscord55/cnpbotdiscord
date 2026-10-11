require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ('data' in command) {
        commands.push(command.data.toJSON());
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Borrando comandos antiguos...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, '1509188460681101384'),
            { body: [] },
        );

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] },
        );

        console.log(`Desplegando ${commands.length} comandos...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, '1509188460681101384'),
            { body: commands },
        );

        console.log(`${data.length} comandos desplegados correctamente.`);
    } catch (error) {
        console.error(error);
    }
})();
