#!/usr/bin/env node
/**
 * audit-cli.js — Interactive CLI Audit & Cleanup Tool for Legacy Campaign Sheets
 * Sesuai spesifikasi PRD "Interactive CLI Audit & Cleanup Tool for Legacy Campaign Sheets"
 * 
 * Fitur Utama:
 * 1. Isolasi data ke Baris 7+ (tidak menyentuh metadata Baris 1-6)
 * 2. CLI Interaktif (pilih tab kampanye, input Music ID/URL & Campaign Start Date)
 * 3. Validasi otomatis: Audio Match, Upload Date, Video Private/Deleted
 * 4. Update live views/likes, status & reason langsung ke Google Sheet
 * 5. Resume capability via local progress buffer (audit-progress.json)
 * 6. Laporan ringkasan eksekusi: Fraudulent Views removed & Budget Saved ($ USD)
 */

require('dotenv').config({ path: __dirname + '/.env' });
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { fetchTikTokMetrics, extractMusicId, resolveAllRedirects } = require('./utils/tiktokScraper');
const { getAllTabs, recalculateMembersStatsBatch, parsePayRateToPerView } = require('./utils/sheetsHelper');

const PROGRESS_FILE = path.join(__dirname, 'audit-progress.json');

// Setup Google Sheets Auth
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

function getSpreadsheetId() {
    return process.env.GOOGLE_SPREADSHEET_ID || process.env.MASTER_SPREADSHEET_ID;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createRl() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function askQuestion(rl, query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// Format date to YYYY-MM-DD HH:mm UTC
function formatUtcTimestamp(date) {
    if (!date) return '-';
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Baca progress file jika ada
function loadProgress(tabName) {
    if (!fs.existsSync(PROGRESS_FILE)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
        if (data && data.tabName === tabName) return data;
    } catch {}
    return null;
}

// Simpan progress file
function saveProgress(data) {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save progress file:', e.message);
    }
}

// Hapus progress file saat audit tuntas
function clearProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
    } catch {}
}

async function main() {
    console.clear();
    console.log('═'.repeat(65));
    console.log('🔍 INTERACTIVE CLI AUDIT & CLEANUP TOOL (LEGACY SHEETS)');
    console.log('═'.repeat(65));

    const spreadsheetId = getSpreadsheetId();
    if (!spreadsheetId) {
        console.error('❌ GOOGLE_SPREADSHEET_ID tidak dikonfigurasi di file .env!');
        process.exit(1);
    }

    const rl = createRl();

    try {
        console.log('\n[+] Authenticating with Google Sheets API...');
        console.log(`[+] Connected to Document ID: ${spreadsheetId.substring(0, 10)}...${spreadsheetId.slice(-6)}`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: TARGET SHEET TAB SELECTION
        // ═══════════════════════════════════════════════════════════════
        const allTabs = await getAllTabs(spreadsheetId, true);
        const systemTabs = ['Members', 'Invites', 'Sheet1', 'Template'];
        const campaignTabs = allTabs.filter(t => !systemTabs.includes(t));

        if (campaignTabs.length === 0) {
            console.log('⚠️ Tidak ditemukan tab kampanye yang dapat diaudit.');
            rl.close();
            return;
        }

        console.log('\nAvailable Campaign Tabs:');
        campaignTabs.forEach((tab, idx) => {
            console.log(`  [${idx + 1}] ${tab}`);
        });

        let selectedTabIndex = -1;
        while (selectedTabIndex < 0 || selectedTabIndex >= campaignTabs.length) {
            const answer = await askQuestion(rl, `\n? Select sheet tab to audit (1-${campaignTabs.length}): `);
            const num = parseInt(answer.trim(), 10);
            if (!isNaN(num) && num >= 1 && num <= campaignTabs.length) {
                selectedTabIndex = num - 1;
            } else {
                console.log(`⚠️ Pilihan tidak valid. Harap masukkan angka antara 1 sampai ${campaignTabs.length}.`);
            }
        }

        const selectedTab = campaignTabs[selectedTabIndex];
        console.log(`\n[>] Target Selected: "${selectedTab}"`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: RUNTIME PARAMETER CONFIGURATION
        // ═══════════════════════════════════════════════════════════════
        // Cek resume progress
        const savedProgress = loadProgress(selectedTab);
        let resumeFromRow = 0;
        let targetAudioId = '';
        let cutoffDateStr = '';
        let cutoffUnix = 0;

        if (savedProgress && savedProgress.completedRowIndices?.length > 0) {
            console.log(`\n⚠️ Ditemukan progres audit yang belum selesai untuk "${selectedTab}".`);
            console.log(`   Telah memproses ${savedProgress.completedRowIndices.length} baris.`);
            const resumeAns = await askQuestion(rl, '? Ingin melanjutkan dari checkpoint sebelumnya? (y/N): ');
            if (resumeAns.trim().toLowerCase() === 'y') {
                targetAudioId = savedProgress.targetAudioId;
                cutoffDateStr = savedProgress.cutoffDateStr;
                cutoffUnix = savedProgress.cutoffUnix;
                resumeFromRow = savedProgress.completedRowIndices.length;
                console.log(`[+] Melanjutkan audit dengan Target Audio: ${targetAudioId} & Cutoff Date: ${cutoffDateStr}`);
            }
        }

        if (!targetAudioId) {
            // Prompt input Audio ID / URL
            let audioInput = '';
            while (!audioInput) {
                const ans = await askQuestion(rl, '? Enter Official TikTok Song Link / Music ID: ');
                if (ans.trim()) {
                    audioInput = ans.trim();
                } else {
                    console.log('⚠️ Official Music ID/Link wajib diisi.');
                }
            }

            console.log('[*] Resolving TikTok Audio ID...');
            const resolvedAudioUrl = await resolveAllRedirects(audioInput);
            targetAudioId = extractMusicId(resolvedAudioUrl) || extractMusicId(audioInput);
            console.log(`[+] Target Audio ID Resolved: ${targetAudioId || audioInput}`);

            // Prompt input Start Date
            const defaultDate = '2026-10-01 00:00';
            const datePrompt = `? Enter Campaign Start Date (YYYY-MM-DD HH:mm) [Default: ${defaultDate}]: `;
            const dateAns = await askQuestion(rl, datePrompt);
            const rawDate = dateAns.trim() || defaultDate;

            let normalizedDate = rawDate;
            if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(normalizedDate)) {
                normalizedDate = normalizedDate.replace(/\s+/, 'T') + ':00Z';
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
                normalizedDate = normalizedDate + 'T00:00:00Z';
            }

            const parsedDate = new Date(normalizedDate);
            if (isNaN(parsedDate.getTime())) {
                console.error('❌ Format tanggal tidak valid. Menggunakan default UTC.');
                cutoffUnix = Math.floor(new Date(defaultDate.replace(' ', 'T') + ':00Z').getTime() / 1000);
                cutoffDateStr = new Date(cutoffUnix * 1000).toISOString();
            } else {
                cutoffUnix = Math.floor(parsedDate.getTime() / 1000);
                cutoffDateStr = parsedDate.toISOString();
            }

            console.log(`[+] Campaign Cutoff Date Set: ${cutoffDateStr} (Unix: ${cutoffUnix})`);
        }

        // Ambil tarif per view dari sel B4 untuk kalkulasi penghematan anggaran (Budget Saved)
        let payRatePerView = 0.001; // Default estimasi $0.001
        try {
            const metaRes = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${selectedTab}'!B4`
            });
            const b4Val = metaRes.data.values?.[0]?.[0];
            if (b4Val) {
                payRatePerView = parsePayRateToPerView(b4Val) || parseFloat(b4Val) || 0.001;
            }
        } catch {}

        // Ambil seluruh data submission (Range A7:K)
        console.log(`\n[+] Fetching rows from "${selectedTab}" (Range: A7:K)...`);
        const sheetRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${selectedTab}'!A7:K1000`
        });

        const rows = sheetRes.data.values || [];
        const totalRows = rows.length;

        if (totalRows === 0) {
            console.log(`[!] Tidak ada data pengajuan yang ditemukan di baris 7+ pada tab "${selectedTab}".`);
            rl.close();
            return;
        }

        console.log(`[+] Total Submissions Loaded: ${totalRows} rows.`);
        console.log('\n[!] Memulai eksekusi audit baris per baris. Tekan Ctrl+C kapan saja untuk jeda/simpan progress.');
        await sleep(1500);

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: EXECUTION & REAL-TIME TERMINAL PROGRESS
        // ═══════════════════════════════════════════════════════════════
        console.log('\n' + '─'.repeat(65));
        console.log(`AUDIT EXECUTION STARTED — ${new Date().toLocaleString()}`);
        console.log('─'.repeat(65));

        const completedIndices = new Set(savedProgress?.completedRowIndices || []);
        let validCount = 0;
        let rejectedCount = 0;
        let countInvalidAudio = 0;
        let countPreCampaign = 0;
        let countPrivateDeleted = 0;
        let totalFraudulentViews = 0;

        const affectedUserIds = new Set();
        const pendingSheetUpdates = [];

        for (let i = 0; i < totalRows; i++) {
            const sheetRow = i + 7; // Baris riil di spreadsheet (Row 7+)
            const row = rows[i] || [];

            const subId = row[0] || `ROW-${sheetRow}`;
            const userId = row[1] || '';
            const userTag = row[2] || 'Unknown';
            const link = (row[4] || '').trim(); // Col E
            const oldViews = parseInt(row[5], 10) || 0; // Col F
            const oldLikes = parseInt(row[6], 10) || 0; // Col G
            const currentStatus = row[9] || ''; // Col J

            if (userId) affectedUserIds.add(userId);

            // Lewati baris jika sudah diaudit pada resume sebelumnya
            if (completedIndices.has(i)) {
                if (currentStatus.includes('APPROVED')) validCount++;
                else if (currentStatus.includes('REJECTED')) rejectedCount++;
                continue;
            }

            console.log(`\n[${i + 1}/${totalRows}] Processing Row ${sheetRow} | ${subId} | ${link ? link.substring(0, 40) + '...' : 'NO LINK'}`);

            // Penanganan jika link kosong / tidak ada di Kolom E
            if (!link || !link.startsWith('http')) {
                console.log('├── Link Status      : [MISSING / MALFORMED]');
                console.log('└── Result           : SKIPPED (Reason: Missing Video URL)');
                
                pendingSheetUpdates.push({
                    range: `'${selectedTab}'!I${sheetRow}:J${sheetRow}`,
                    values: [['Skipped: Missing Video URL', currentStatus || 'PENDING']]
                });
                completedIndices.add(i);
                continue;
            }

            // Linear Backoff: Jeda 3 detik antar video untuk proteksi IP & rate limit
            if (i > 0) {
                await sleep(3000);
            }

            // Scrape TikTok metadata dengan auto-retry 3x jika terkena limit
            let metrics = null;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    metrics = await fetchTikTokMetrics(link);
                    if (metrics && metrics.createTime > 0) {
                        break;
                    }
                } catch (e) {}
                retryCount++;
                if (retryCount < maxRetries) {
                    await sleep(3000);
                }
            }

            let auditResult = '';
            let newStatus = '';
            let newReason = '';
            let finalViews = oldViews;
            let finalLikes = oldLikes;

            // Evaluasi Aturan 3: Private, Removed, or Geoblocked Video
            if (!metrics || !metrics.success || !metrics.createTime) {
                auditResult = 'REJECTED';
                newStatus = 'REJECTED (Auto-Audit)';
                newReason = 'Video Private / Deleted';
                rejectedCount++;
                countPrivateDeleted++;
                totalFraudulentViews += oldViews;

                console.log('├── Scrape Status    : [FAILED / PRIVATE / DELETED]');
                console.log(`└── Result           : ${auditResult} (Reason: ${newReason})`);
            } else {
                finalViews = metrics.views >= oldViews ? metrics.views : oldViews;
                finalLikes = metrics.likes >= oldLikes ? metrics.likes : oldLikes;

                const scrapedAudioId = metrics.musicInfo?.id ? String(metrics.musicInfo.id).trim() : '';
                const scrapedAudioTitle = metrics.musicInfo?.title || 'Unknown Sound';
                const postTimeFormatted = formatUtcTimestamp(metrics.createTime * 1000);

                // Evaluasi Aturan 1: Audio Source Validation
                let isAudioMatch = false;
                if (targetAudioId && scrapedAudioId && (scrapedAudioId === targetAudioId || targetAudioId.includes(scrapedAudioId))) {
                    isAudioMatch = true;
                } else if (scrapedAudioTitle.toLowerCase().includes(targetAudioId.toLowerCase())) {
                    isAudioMatch = true;
                }

                // Evaluasi Aturan 2: Upload Timing Validation (createTime >= cutoffUnix)
                const isTimingValid = metrics.createTime >= cutoffUnix;

                console.log(`├── Scraped Audio ID : ${scrapedAudioId || 'N/A'} [${isAudioMatch ? 'MATCH' : 'MISMATCH'}] ("${scrapedAudioTitle}")`);
                console.log(`├── Post Timestamp   : ${postTimeFormatted} [${isTimingValid ? 'VALID' : 'PRE-CAMPAIGN'}]`);

                if (!isAudioMatch) {
                    auditResult = 'REJECTED';
                    newStatus = 'REJECTED (Auto-Audit)';
                    newReason = `Rejected: Invalid song used (Detected: ${scrapedAudioTitle})`;
                    rejectedCount++;
                    countInvalidAudio++;
                    totalFraudulentViews += oldViews;
                    console.log(`└── Result           : ${auditResult} (Reason: ${newReason})`);
                } else if (!isTimingValid) {
                    auditResult = 'REJECTED';
                    newStatus = 'REJECTED (Auto-Audit)';
                    newReason = 'Rejected: Posted before campaign start';
                    rejectedCount++;
                    countPreCampaign++;
                    totalFraudulentViews += oldViews;
                    console.log(`└── Result           : ${auditResult} (Reason: ${newReason})`);
                } else {
                    // Semua aturan lolos! (Pass Handling)
                    auditResult = 'PASSED';
                    newStatus = 'APPROVED';
                    newReason = '-';
                    validCount++;
                    console.log(`└── Result           : ${auditResult} (Views updated: ${finalViews.toLocaleString()} | Likes: ${finalLikes.toLocaleString()})`);
                }
            }

            // Susun mutasi data untuk sheet (Col F: Views, Col G: Likes, Col I: Reason, Col J: Status)
            pendingSheetUpdates.push({
                range: `'${selectedTab}'!F${sheetRow}:G${sheetRow}`,
                values: [[finalViews, finalLikes]]
            });
            pendingSheetUpdates.push({
                range: `'${selectedTab}'!I${sheetRow}:J${sheetRow}`,
                values: [[newReason, newStatus]]
            });

            completedIndices.add(i);

            // Simpan state progress berkala ke audit-progress.json
            saveProgress({
                tabName: selectedTab,
                targetAudioId,
                cutoffDateStr,
                cutoffUnix,
                completedRowIndices: Array.from(completedIndices)
            });

            // Flush update ke Google Sheet setiap 5 baris agar tidak membebani memory
            if (pendingSheetUpdates.length >= 10) {
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId,
                    resource: {
                        valueInputOption: 'USER_ENTERED',
                        data: pendingSheetUpdates.splice(0, pendingSheetUpdates.length)
                    }
                }).catch(e => console.error('  ⚠️ Batch update error:', e.message));
            }
        }

        // Flush sisa update ke Google Sheet
        if (pendingSheetUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data: pendingSheetUpdates
                }
            }).catch(e => console.error('  ⚠️ Final batch update error:', e.message));
        }

        // Hapus file progress karena audit selesai
        clearProgress();

        // Rekalkulasi statistik members di tab Members
        if (affectedUserIds.size > 0) {
            console.log('\n[+] Menyinkronkan ulang statistik anggota di tab Members...');
            await recalculateMembersStatsBatch(Array.from(affectedUserIds)).catch(() => {});
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: SUCCESS METRICS & EXECUTION SUMMARY OUTPUT
        // ═══════════════════════════════════════════════════════════════
        const totalBudgetSaved = (totalFraudulentViews * payRatePerView).toFixed(2);

        console.log('\n' + '═'.repeat(65));
        console.log('AUDIT RUN COMPLETE');
        console.log('═'.repeat(65));
        console.log(`Target Tab             : ${selectedTab}`);
        console.log(`Total Rows Processed   : ${totalRows}`);
        console.log(`Valid Submissions      : ${validCount}`);
        console.log(`Rejected Submissions   : ${rejectedCount}`);
        console.log(`- Invalid Audio        : ${countInvalidAudio}`);
        console.log(`- Pre-campaign Post    : ${countPreCampaign}`);
        console.log(`- Private / Deleted    : ${countPrivateDeleted}`);
        console.log(`Total Fraudulent Views : ${totalFraudulentViews.toLocaleString()} views removed`);
        console.log(`Total Budget Saved     : $${parseFloat(totalBudgetSaved).toLocaleString()} USD`);
        console.log('═'.repeat(65));
        console.log('[+] Google Sheet updated successfully.');
        console.log(`👉 https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0\n`);

    } catch (err) {
        console.error('\n❌ Terjadi kesalahan fatal:', err);
    } finally {
        rl.close();
    }
}

main();
