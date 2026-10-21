/**
 * viewsTracker.js — Auto-refresh TikTok views & likes setiap 1 jam
 * 
 * Cara kerja:
 * 1. Ambil semua tab campaign dari Google Sheets (skip 'Members', 'Sheet1', 'Invites')
 * 2. Untuk setiap tab, baca semua baris submission (row 7+)
 * 3. Untuk setiap baris yang punya link TikTok (col E), scrape ulang views & likes
 * 4. Batch-update kolom F (Views) & G (Likes) di sheet
 * 5. Sync progress bar embed di Discord channel
 * 
 * Dijalankan via setInterval(1 jam) dari index.js
 */

const { google } = require('googleapis');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { fetchTikTokMetrics } = require('../utils/tiktokScraper');
const { getCampaignTargetDetails, recalculateMemberStatsInSheet, recalculateMembersStatsBatch, getAllTabs } = require('../utils/sheetsHelper');
const { createProgressBar } = require('../utils/progressBar');

// Google Sheets auth (shared config with sheetsHelper)
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

function getSpreadsheetId() {
    return process.env.GOOGLE_SPREADSHEET_ID || process.env.MASTER_SPREADSHEET_ID;
}

// ═══════════════════════════════════════════════════════════════
//  CORE: Ambil semua tab campaign (filter out system tabs)
// ═══════════════════════════════════════════════════════════════
async function getCampaignTabs() {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) return [];

    const allTabs = await getAllTabs(spreadsheetId);
    const systemTabs = ['Members', 'Sheet1', 'Invites', 'Template'];

    return allTabs.filter(t => !systemTabs.includes(t));
}

// ═══════════════════════════════════════════════════════════════
//  CORE: Baca semua submission dari 1 tab campaign
// ═══════════════════════════════════════════════════════════════
async function getSubmissionsFromTab(tabName) {
    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) return [];

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${tabName}'!A8:M1000`
        });
        return res.data.values || [];
    } catch (err) {
        console.error(`[TRACKER] Failed to read tab '${tabName}':`, err.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════
//  CORE: Batch-update views & likes untuk 1 tab
// ═══════════════════════════════════════════════════════════════
async function batchUpdateMetrics(tabName, updates) {
    if (updates.length === 0) return;

    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) return;

    // Bangun array request untuk batchUpdate
    const data = [];
    for (const u of updates) {
        // Col F (Views) & Col G (Likes) — row offset mulai dari 7
        data.push({
            range: `'${tabName}'!F${u.sheetRow}:G${u.sheetRow}`,
            values: [[u.newViews, u.newLikes]]
        });
    }

    try {
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data
            }
        });
    } catch (err) {
        console.error(`[TRACKER] Batch update failed for '${tabName}':`, err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
//  Delay helper agar tidak nge-spam API TikTok
// ═══════════════════════════════════════════════════════════════
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
//  SYNC: Update progress bar embed di Discord
// ═══════════════════════════════════════════════════════════════
async function syncAllCampaignEmbeds(client, updatedTabs) {
    const channelId = process.env.ACTIVE_CAMPAIGNS_CHANNEL_ID;
    if (!channelId || !client) return;

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    let messages;
    try {
        messages = await channel.messages.fetch({ limit: 50 });
    } catch { return; }

    for (const tabName of updatedTabs) {
        try {
            const targetData = await getCampaignTargetDetails(tabName);
            if (!targetData) continue;

            const campaignMsg = messages.find(m => {
                if (m.author.id !== client.user.id || !m.components?.length) return false;
                const btn = m.components[0]?.components[0];
                return btn && btn.customId === `submit_clip_btn_${tabName}`;
            });

            if (!campaignMsg || !campaignMsg.embeds?.length) continue;

            const oldEmbed = campaignMsg.embeds[0];
            const progressBarText = createProgressBar(targetData.approvedViews, targetData.targetViews);

            const updatedFields = oldEmbed.fields.map(f => {
                if (f.name.includes('Target Status') || f.name.includes('Funding Status')) {
                    return { name: '🎯 Target Status', value: progressBarText, inline: false };
                }
                return f;
            });

            const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields(updatedFields);
            await campaignMsg.edit({ embeds: [updatedEmbed] });

            console.log(`[TRACKER] ✅ Progress bar updated for campaign '${tabName}'`);
        } catch (err) {
            console.error(`[TRACKER] Failed to sync embed for '${tabName}':`, err.message);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN: Proses 1 siklus tracker (dipanggil setiap 1 jam)
// ═══════════════════════════════════════════════════════════════
async function runViewsTrackerCycle(client) {
    const startTime = Date.now();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[TRACKER] 🔄 Starting hourly views refresh — ${new Date().toLocaleString()}`);
    console.log(`${'═'.repeat(60)}`);

    let totalChecked = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const updatedTabs = [];
    const affectedUserIds = new Set();

    try {
        const tabs = await getCampaignTabs();
        if (tabs.length === 0) {
            console.log('[TRACKER] No campaign tabs found. Skipping cycle.');
            return;
        }

        console.log(`[TRACKER] Found ${tabs.length} campaign tab(s): ${tabs.join(', ')}`);

        for (const tabName of tabs) {
            console.log(`\n[TRACKER] 📋 Processing tab '${tabName}'...`);

            const rows = await getSubmissionsFromTab(tabName);
            if (rows.length === 0) {
                console.log(`[TRACKER]   └─ No submissions found. Skipping.`);
                continue;
            }

            const updates = [];
            let tabUpdated = 0;

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const subId = row[0] || '';
                const userId = row[1] || '';
                const link = row[4] || '';   // Col E = TikTok Link
                const oldViews = parseInt(row[5], 10) || 0; // Col F = Views
                const oldLikes = parseInt(row[6], 10) || 0; // Col G = Likes
                const status = row[11] || row[9] || '';     // Col L = Status (v1.3.0) / Col J (v1.2.2 fallback)
                const sheetRow = i + 8;                     // Data submissions mulai dari row 8 (v1.3.0)

                // Skip jika tidak ada link
                if (!link || !link.startsWith('http')) {
                    totalSkipped++;
                    continue;
                }

                totalChecked++;

                // Delay 5 detik antar scrape untuk menghindari rate limit
                if (totalChecked > 1) {
                    await delay(5000);
                }

                try {
                    const metrics = await fetchTikTokMetrics(link);

                    if (!metrics || !metrics.success) {
                        console.log(`[TRACKER]   ├─ ⚠️ ${subId}: Scrape failed (kept old: ${oldViews.toLocaleString()} views)`);
                        totalSkipped++;
                        continue;
                    }

                    const newViews = metrics.views;
                    const newLikes = metrics.likes;

                    // Hanya update kalau views baru >= views lama (hindari penurunan views palsu)
                    if (newViews >= oldViews) {
                        const viewDiff = newViews - oldViews;

                        if (viewDiff > 0 || newLikes !== oldLikes) {
                            updates.push({ sheetRow, newViews, newLikes });
                            tabUpdated++;
                            totalUpdated++;

                            if (userId) affectedUserIds.add(userId);

                            console.log(`[TRACKER]   ├─ ✅ ${subId}: ${oldViews.toLocaleString()} → ${newViews.toLocaleString()} views (+${viewDiff.toLocaleString()}) | Likes: ${oldLikes.toLocaleString()} → ${newLikes.toLocaleString()}`);
                        } else {
                            // Views & likes sama — skip update
                            totalSkipped++;
                        }
                    } else {
                        // newViews < oldViews — abaikan (kemungkinan cache API)
                        console.log(`[TRACKER]   ├─ ⏭️ ${subId}: Skipped (API returned ${newViews.toLocaleString()} < current ${oldViews.toLocaleString()})`);
                        totalSkipped++;
                    }
                } catch (scrapeErr) {
                    console.error(`[TRACKER]   ├─ ❌ ${subId}: Error — ${scrapeErr.message}`);
                    totalSkipped++;
                }
            }

            // Batch-write ke Google Sheet
            if (updates.length > 0) {
                await batchUpdateMetrics(tabName, updates);
                updatedTabs.push(tabName);
                console.log(`[TRACKER]   └─ 📊 Batch updated ${tabUpdated} row(s) in '${tabName}'`);
            } else {
                console.log(`[TRACKER]   └─ No changes needed for '${tabName}'`);
            }
        }

        // Sync progress bar embed di Discord untuk tab yang berubah
        if (updatedTabs.length > 0 && client) {
            console.log(`\n[TRACKER] 🔄 Syncing Discord embeds for ${updatedTabs.length} campaign(s)...`);
            await syncAllCampaignEmbeds(client, updatedTabs);
        }

        // Recalculate member stats untuk user yang terdampak secara batch (1 API call)
        if (affectedUserIds.size > 0) {
            console.log(`[TRACKER] 🔄 Batch recalculating stats for ${affectedUserIds.size} affected user(s)...`);
            try {
                await recalculateMembersStatsBatch(Array.from(affectedUserIds));
            } catch (batchErr) {
                console.error('[TRACKER] ❌ Error recalculating member stats:', batchErr.message);
            }
        }

    } catch (err) {
        console.error('[TRACKER] ❌ Critical error during tracker cycle:', err);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[TRACKER] ✅ Cycle complete in ${elapsed}s — Checked: ${totalChecked} | Updated: ${totalUpdated} | Skipped: ${totalSkipped}`);
    console.log(`${'═'.repeat(60)}\n`);

    return {
        success: true,
        totalChecked,
        totalUpdated,
        totalSkipped,
        updatedTabs,
        elapsed
    };
}

// ═══════════════════════════════════════════════════════════════
//  INIT: Start interval 1 jam (dipanggil dari index.js)
// ═══════════════════════════════════════════════════════════════
const TRACKER_INTERVAL_MS = 60 * 60 * 1000; // 1 jam
let trackerInterval = null;

function startViewsTracker(client) {
    if (trackerInterval) {
        console.log('[TRACKER] Tracker already running. Skipping duplicate start.');
        return;
    }

    console.log(`[TRACKER] 🚀 Views Tracker started — will refresh every ${TRACKER_INTERVAL_MS / 60000} minute(s)`);

    // Jalankan pertama kali setelah 30 detik (beri waktu bot startup)
    setTimeout(() => {
        runViewsTrackerCycle(client);
    }, 30 * 1000);

    // Set interval setiap 1 jam
    trackerInterval = setInterval(() => {
        runViewsTrackerCycle(client);
    }, TRACKER_INTERVAL_MS);
}

function stopViewsTracker() {
    if (trackerInterval) {
        clearInterval(trackerInterval);
        trackerInterval = null;
        console.log('[TRACKER] 🛑 Views Tracker stopped.');
    }
}

module.exports = {
    startViewsTracker,
    stopViewsTracker,
    runViewsTrackerCycle // Export untuk manual trigger jika perlu
};
