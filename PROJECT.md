# PROJECT SUMMARY
## package.json
{
  "name": "bot-clipping",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "discord.js": "^14.27.0",
    "dotenv": "^17.4.2",
    "googleapis": "^182.0.0"
  }
}
## Daftar file
./data/users.json
./embeds/adminEmbed.js
./embeds/rulesEmbed.js
./google-key.json
./handlers/adminHandler.js
./handlers/commandHandler.js
./handlers/dashboardHandler.js
./handlers/interactionHandler.js
./handlers/inviteHandler.js
./handlers/modalHandler.js
./handlers/profileHandler.js
./handlers/submitHandler.js
./handlers/ticketHandler.js
./index.js
./package.json
./test-sheets.js
./utils/progressBar.js
./utils/sheetsHelper.js
./utils/stickyHandler.js
./utils/tiktokScraper.js
## Jumlah baris per file
  206 ./index.js
   39 ./embeds/rulesEmbed.js
   56 ./embeds/adminEmbed.js
   88 ./handlers/commandHandler.js
    0 ./handlers/interactionHandler.js
    0 ./handlers/modalHandler.js
  296 ./handlers/submitHandler.js
  163 ./handlers/adminHandler.js
   95 ./handlers/profileHandler.js
  145 ./handlers/ticketHandler.js
   81 ./handlers/dashboardHandler.js
  102 ./handlers/inviteHandler.js
   20 ./utils/progressBar.js
  392 ./utils/sheetsHelper.js
  233 ./utils/tiktokScraper.js
   29 ./utils/stickyHandler.js
   39 ./test-sheets.js
 1984 total
## Command / event / tombol
./index.js:55:                    if (btn && btn.customId.startsWith('submit_clip_btn_')) {
./index.js:56:                        const tabName = btn.customId.replace('submit_clip_btn_', '');
./index.js:65:client.on('messageCreate', async (message) => {
./index.js:70:client.on('interactionCreate', async (interaction) => {
./index.js:71:    const id = interaction.customId || 'N/A';
./index.js:202:client.on('inviteCreate', handleInviteCreate);
./index.js:203:client.on('inviteDelete', handleInviteDelete);
./index.js:204:client.on('guildMemberAdd', handleGuildMemberAdd);
./embeds/rulesEmbed.js:38:module.exports = { getRulesEmbed, getStartEmbed };
./embeds/adminEmbed.js:56:module.exports = { getAdminPanelEmbed, getSubmitPanelEmbed };
./handlers/commandHandler.js:87:module.exports = { handleMessageCommands };
./handlers/submitHandler.js:38:            return btn && btn.customId === `submit_clip_btn_${tabName}`;
./handlers/submitHandler.js:75:    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('modal_clipper_submit_')) return;
./handlers/submitHandler.js:86:    const parts = interaction.customId.split('_');
./handlers/submitHandler.js:150:    if (interaction.customId.startsWith('approve_sub_')) {
./handlers/submitHandler.js:153:        const parts = interaction.customId.split('_');
./handlers/submitHandler.js:216:    if (interaction.customId.startsWith('reject_sub_')) {
./handlers/submitHandler.js:217:        const parts = interaction.customId.split('_');
./handlers/submitHandler.js:239:    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('modal_reject_reason_')) return;
./handlers/submitHandler.js:243:    const parts = interaction.customId.split('_');
./handlers/submitHandler.js:290:module.exports = { 
./handlers/adminHandler.js:14:    if (interaction.isButton() && interaction.customId === 'admin_add_campaign_btn') {
./handlers/adminHandler.js:65:    if (interaction.isButton() && interaction.customId === 'admin_close_campaign_btn') {
./handlers/adminHandler.js:84:                if (btn && btn.customId.startsWith('submit_clip_btn_')) {
./handlers/adminHandler.js:86:                    const tabName = btn.customId.replace('submit_clip_btn_', '');
./handlers/adminHandler.js:115:    if (interaction.isStringSelectMenu() && interaction.customId === 'admin_select_close_campaign') {
./handlers/adminHandler.js:163:module.exports = { handleAdminPanelInteractions };
./handlers/profileHandler.js:51:    if (!interaction.isModalSubmit() || interaction.customId !== 'modal_clipper_profile') return;
./handlers/profileHandler.js:91:module.exports = {
./handlers/ticketHandler.js:12:    if (!interaction.isButton() || interaction.customId !== 'btn_open_ticket') return;
./handlers/ticketHandler.js:125:    if (!interaction.isButton() || interaction.customId !== 'btn_close_ticket') return;
./handlers/ticketHandler.js:142:module.exports = {
./handlers/dashboardHandler.js:12:    if (!interaction.isButton() || interaction.customId !== 'btn_open_my_dashboard') return;
./handlers/dashboardHandler.js:81:module.exports = { handleDashboardInteraction };
./handlers/inviteHandler.js:96:module.exports = {
./utils/progressBar.js:20:module.exports = { createProgressBar };
./utils/sheetsHelper.js:376:module.exports = {
./utils/tiktokScraper.js:233:module.exports = { fetchTikTokMetrics };
./utils/stickyHandler.js:29:module.exports = { handleStickyMessage };
