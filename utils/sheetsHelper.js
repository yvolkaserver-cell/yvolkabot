const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

const USERS_FILE = path.join(__dirname, '../data/users.json');
function getLocalUserProfile(userId) {
    if (!fs.existsSync(USERS_FILE)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        return data[userId] || null;
    } catch {
        return null;
    }
}

function getMasterSheetId() {
    return process.env.GOOGLE_SPREADSHEET_ID || process.env.MASTER_SPREADSHEET_ID;
}

let membersTabEnsured = false;
let invitesTabEnsured = false;
let cachedTabs = null;
let cachedTabsTime = 0;
const TABS_CACHE_TTL = 30 * 1000; // 30 detik

function invalidateTabsCache() {
    cachedTabs = null;
    cachedTabsTime = 0;
}

async function getAllTabs(spreadsheetId, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedTabs && (now - cachedTabsTime < TABS_CACHE_TTL)) {
        return cachedTabs;
    }
    try {
        const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
        cachedTabs = sheetMeta.data.sheets.map(s => s.properties.title);
        cachedTabsTime = now;
        return cachedTabs;
    } catch (err) {
        console.error('[SHEETS ERROR] getAllTabs:', err.message);
        return cachedTabs || [];
    }
}

function parseTargetViews(input) {
    if (!input) return 0;
    if (typeof input === 'number') return Math.round(input);

    // 1. Bersihkan string: ubah ke huruf besar, hapus spasi ekstra
    let str = String(input).trim().toUpperCase();

    // 2. Cek apakah ada akhiran singkatan (K, M, B)
    let multiplier = 1;
    if (str.endsWith('B')) {
        multiplier = 1000000000; // Billion (Miliar)
        str = str.slice(0, -1);
    } else if (str.endsWith('M')) {
        multiplier = 1000000;    // Million (Juta)
        str = str.slice(0, -1);
    } else if (str.endsWith('K')) {
        multiplier = 1000;       // Thousand (Ribu)
        str = str.slice(0, -1);
    }

    // 3. Normalisasi pemisah ribuan & desimal
    // Jika ada titik DAN koma (contoh: "2.500,00" atau "2,500.00")
    if (str.includes('.') && str.includes(',')) {
        if (str.lastIndexOf('.') > str.lastIndexOf(',')) {
            // Format US/UK: 2,500.00 -> hapus koma
            str = str.replace(/,/g, '');
        } else {
            // Format Indo/EU: 2.500,00 -> hapus titik, ubah koma jadi titik
            str = str.replace(/\./g, '').replace(',', '.');
        }
    } else if (str.includes('.')) {
        // Jika hanya ada titik:
        // Cek jika formatnya titik ribuan Indonesia (misal: "2.000.000")
        const parts = str.split('.');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
            str = str.replace(/\./g, '');
        }
    } else if (str.includes(',')) {
        // Jika hanya ada koma:
        // Cek jika koma ribuan (misal: "2,000,000") vs koma desimal (misal: "2,5")
        const parts = str.split(',');
        if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
            str = str.replace(/,/g, '');
        } else {
            str = str.replace(',', '.');
        }
    }

    // 4. Konversi ke Float lalu kalikan dengan pengali
    const val = parseFloat(str.trim());
    if (isNaN(val)) return 0;

    return Math.round(val * multiplier);
}

function parsePayRateToPerView(payRateRaw) {
    if (!payRateRaw) return 0;
    let raw = String(payRateRaw).toUpperCase().replace(/\$/g, '').trim();

    if (raw.includes('/') || raw.includes('PER')) {
        const parts = raw.split(/\/|PER/).map(p => p.trim());
        const amount = parseFloat(parts[0]) || 0;
        let denomStr = (parts[1] || '1').replace(/VIEWS?/i, '').trim();

        let denominator = 1;
        if (denomStr.endsWith('M') || denomStr.includes('M')) {
            const num = parseFloat(denomStr.replace(/[^0-9.]/g, '')) || 1;
            denominator = num * 1000000;
        } else if (denomStr.endsWith('K') || denomStr.includes('K')) {
            const num = parseFloat(denomStr.replace(/[^0-9.]/g, '')) || 1;
            denominator = num * 1000;
        } else {
            denominator = parseFloat(denomStr.replace(/[^0-9.]/g, '')) || 1;
        }

        return denominator > 0 ? amount / denominator : 0;
    }

    if (raw.endsWith('M') || raw.includes('M')) return (parseFloat(raw.replace(/[^0-9.]/g, '')) || 0) / 1000000;
    if (raw.endsWith('K') || raw.includes('K')) return (parseFloat(raw.replace(/[^0-9.]/g, '')) || 0) / 1000;

    return parseFloat(raw) || 0;
}

async function createCampaignSpreadsheet(title, targetViewsRaw, payRateRaw, startDateIso, musicId) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID tidak dikonfigurasi di .env');

    const tabName = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const numericPayRate = parsePayRateToPerView(payRateRaw);
    const finalStartDate = startDateIso || new Date().toISOString();
    const finalMusicId = musicId ? String(musicId).trim() : '';

    try {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{ addSheet: { properties: { title: tabName } } }]
            }
        });

        // Schema Header Rows 1 - 7 sesuai PRD Section 5.A & 5.B
        const headers = [
            ['Campaign Title', title],
            ['Approved Views', `=SUMIF(INDIRECT("L8:L1000"), "*APPROVED*", INDIRECT("F8:F1000"))`],
            ['TARGET VIEWS', parseTargetViews(targetViewsRaw)],
            ['RATE PER VIEW', numericPayRate],
            ['START DATE', finalStartDate],
            ['MUSIC ID', finalMusicId],
            [
                'Submission ID',
                'User Discord ID',
                'User Discord Tag',
                'Platform',
                'TikTok Video Link',
                'Total Views',
                'Total Likes',
                'Payout Formula',
                'VT Post Date',
                'Music Detected',
                'Rejection Notes',
                'Status',
                'Submitted At'
            ]
        ];

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${tabName}'!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: headers }
        });

        invalidateTabsCache();
        const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
        return { spreadsheetId, spreadsheetUrl, tabName };
    } catch (err) {
        console.error('[SHEETS ERROR] createCampaignSpreadsheet:', err.message);
        return { spreadsheetId, spreadsheetUrl: '', tabName };
    }
}

async function appendSubmissionToSheet(tabName, rowData) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    try {
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'${tabName}'!A8`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'OVERWRITE',
            resource: { values: [rowData] }
        });
    } catch (err) {
        console.error('[SHEETS ERROR] appendSubmissionToSheet:', err.message);
    }
}

async function ensureInvitesTab() {
    if (invitesTabEnsured) return;
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    try {
        const tabs = await getAllTabs(spreadsheetId);
        const exists = tabs.includes('Invites');

        if (!exists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{ addSheet: { properties: { title: 'Invites' } } }]
                }
            });

            const headers = [['Member ID', 'Member Tag', 'Inviter ID', 'Inviter Tag', 'Invite Code', 'Timestamp']];
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'Invites'!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: headers }
            });
            invalidateTabsCache();
        }
        invitesTabEnsured = true;
    } catch (err) {
        console.error('[SHEETS ERROR] Invites tab setup:', err.message);
    }
}

async function logInviteToSheet(data) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    await ensureInvitesTab();

    try {
        const newRow = [[
            data.memberId,
            data.memberTag,
            data.inviterId || 'N/A',
            data.inviterTag || 'Direct / Unknown',
            data.code || 'N/A',
            new Date().toLocaleString()
        ]];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `'Invites'!A2`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'OVERWRITE',
            resource: { values: newRow }
        });
    } catch (err) {
        console.error('[SHEETS ERROR] Append invite log failed:', err.message);
    }
}

async function getCampaignMetadata(tabName) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return null;

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${tabName}'!A1:B6`
        });

        const rows = res.data.values || [];
        let title = '';
        let approvedViews = 0;
        let targetViews = 0;
        let ratePerView = 0;
        let startDateStr = '';
        let musicId = '';

        for (const r of rows) {
            const label = String(r[0] || '').toUpperCase();
            const val = r[1] || '';
            if (label.includes('TITLE')) title = val;
            else if (label.includes('APPROVED')) approvedViews = parseInt(val, 10) || 0;
            else if (label.includes('TARGET')) targetViews = parseTargetViews(val);
            else if (label.includes('RATE')) ratePerView = parseFloat(val) || 0;
            else if (label.includes('START')) startDateStr = val;
            else if (label.includes('MUSIC')) musicId = String(val).trim();
        }

        let startDateUnix = 0;
        if (startDateStr) {
            const parsed = new Date(startDateStr);
            if (!isNaN(parsed.getTime())) {
                startDateUnix = Math.floor(parsed.getTime() / 1000);
            }
        }

        return {
            title,
            approvedViews,
            targetViews,
            ratePerView,
            startDate: startDateStr,
            startDateUnix,
            musicId
        };
    } catch (err) {
        console.error('[SHEETS ERROR] getCampaignMetadata:', err.message);
        return null;
    }
}

async function getCampaignTargetDetails(tabName) {
    const meta = await getCampaignMetadata(tabName);
    if (!meta) return { targetViews: 0, approvedViews: 0 };
    return {
        targetViews: meta.targetViews,
        approvedViews: meta.approvedViews
    };
}

async function isLinkSubmitted(tabName, link) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return false;

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${tabName}'!E8:E1000`
        });
        const rows = res.data.values || [];
        return rows.some(r => r[0] && r[0].trim() === link.trim());
    } catch (err) {
        return false;
    }
}

async function ensureMembersTab() {
    if (membersTabEnsured) return;
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    try {
        const tabs = await getAllTabs(spreadsheetId);
        const exists = tabs.includes('Members');

        if (!exists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{ addSheet: { properties: { title: 'Members' } } }]
                }
            });

            const headers = [['User ID', 'Discord Tag', 'Registered Accounts (Max 3)', 'Payment Details', 'Total Views', 'Total Paid Out ($)', 'Joined Date']];
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'Members'!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: headers }
            });
            invalidateTabsCache();
        }
        membersTabEnsured = true;
    } catch (err) {
        console.error('[SHEETS ERROR] Members tab setup:', err.message);
    }
}

async function syncMemberToSheet(userData) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    await ensureMembersTab();

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'Members'!A2:A1000`
        });

        const rows = res.data.values || [];
        let rowIndex = -1;

        const targetUserId = String(userData.userId).trim();
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] && String(rows[i][0]).trim() === targetUserId) {
                rowIndex = i + 2;
                break;
            }
        }

        const accountsString = Array.isArray(userData.accounts) 
            ? userData.accounts.join(', ') 
            : (userData.accounts || '');

        const dateFormatted = new Date().toLocaleDateString('en-US');

        if (rowIndex !== -1) {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'Members'!B${rowIndex}:D${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { 
                    values: [[
                        userData.userTag || '',
                        accountsString,
                        userData.paymentDetails || ''
                    ]] 
                }
            });
        } else {
            const newRowValues = [
                String(userData.userId),
                userData.userTag || '',
                accountsString,
                userData.paymentDetails || '',
                0,
                0,
                dateFormatted
            ];

            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `'Members'!A2`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [newRowValues] }
            });
        }
    } catch (err) {
        console.error('[SHEETS ERROR] syncMemberToSheet failed:', err.message);
    }
}

// FUNGSI MENGHITUNG STATISTIK DASHBOARD USER (OPTIMIZED WITH BATCH GET)
async function getMemberDashboardStats(userId) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return { totalSubmits: 0, views: 0, payout: 0, verifiedInvites: 0 };

    let totalSubmits = 0;
    let views = 0;
    let payout = 0;

    try {
        const allTabs = await getAllTabs(spreadsheetId);
        const campaignTabs = allTabs.filter(t => !['Members', 'Sheet1', 'Invites', 'Template'].includes(t));

        if (campaignTabs.length > 0) {
            const ranges = campaignTabs.map(t => `'${t}'!A8:M1000`);
            const res = await sheets.spreadsheets.values.batchGet({
                spreadsheetId,
                ranges
            });

            const targetUserId = String(userId).trim();
            for (const vr of res.data.valueRanges || []) {
                const rows = vr.values || [];
                for (const row of rows) {
                    if (row[1] && String(row[1]).trim() === targetUserId) {
                        totalSubmits++;
                        // Col L (index 11) di v1.3.0, fallback index 9 untuk legacy v1.2.2
                        const status = row[11] || row[9] || '';
                        if (status.includes('APPROVED')) {
                            views += parseInt(row[5], 10) || 0;
                            payout += parseFloat(row[7]) || 0;
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('[SHEETS ERROR] getMemberDashboardStats:', err.message);
    }

    return { totalSubmits, views, payout, verifiedInvites: 0 };
}

async function getMemberProfileFromSheet(userId) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) {
        console.error('[SHEETS ERROR] GOOGLE_SPREADSHEET_ID tidak ditemukan di .env');
        return null;
    }

    try {
        await ensureMembersTab();

        // 1. Ambil Data Profile dari Tab 'Members'
        const memRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'Members'!A2:G1000`
        });

        const rows = memRes.data.values || [];
        let userRow = null;
        const targetId = String(userId).trim();

        for (const row of rows) {
            if (row[0] && String(row[0]).trim() === targetId) {
                userRow = row;
                break;
            }
        }

        // 2. Ambil Statistik Campaign
        const stats = await getMemberDashboardStats(userId);

        // Jika user BELUM ada di tab Members (misal tab baru dibuat)
        if (!userRow) {
            // Coba ambil data lokal untuk auto-sync ulang ke tab Members yang baru
            const localUser = getLocalUserProfile(userId);
            if (localUser) {
                console.log(`[SHEETS AUTO-SYNC] Re-syncing ${userId} to newly created Members tab...`);
                await syncMemberToSheet(localUser);
            }

            return {
                userId: targetId,
                userTag: localUser?.userTag || 'Not Synced',
                accounts: localUser?.accounts 
                    ? (Array.isArray(localUser.accounts) ? localUser.accounts.join(', ') : localUser.accounts) 
                    : 'Not Set',
                paymentDetails: localUser?.paymentDetails || 'Not Set',
                joinedDate: '-',
                totalSubmits: stats.totalSubmits,
                totalViews: stats.views,
                totalEarnings: stats.payout,
                verifiedInvites: stats.verifiedInvites,
                isFromSheet: false
            };
        }

        // Jika user SUDAH ada di tab Members
        return {
            userId: userRow[0],
            userTag: userRow[1] || 'Unknown',
            accounts: userRow[2] || 'Not Set',
            paymentDetails: userRow[3] || 'Not Set',
            joinedDate: userRow[6] || '-',
            totalSubmits: stats.totalSubmits,
            totalViews: stats.views,
            totalEarnings: stats.payout,
            verifiedInvites: stats.verifiedInvites,
            isFromSheet: true
        };
    } catch (err) {
        console.error('[SHEETS ERROR] getMemberProfileFromSheet:', err.message);
        return null;
    }
}
// Fungsi batch untuk menghitung ulang & memperbarui Total Views & Payout di tab 'Members'
async function recalculateMembersStatsBatch(userIds) {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    const idList = (Array.isArray(userIds) ? userIds : [userIds])
        .filter(Boolean)
        .map(id => String(id).trim());

    if (idList.length === 0) return;

    try {
        await ensureMembersTab();

        const allTabs = await getAllTabs(spreadsheetId);
        const campaignTabs = allTabs.filter(t => !['Members', 'Sheet1', 'Invites', 'Template'].includes(t));

        // Setup batchGet ranges: semua tab campaign + kolom user ID di Members
        const ranges = [
            ...campaignTabs.map(t => `'${t}'!A8:M1000`),
            `'Members'!A2:A1000`
        ];

        const batchRes = await sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges
        });

        const valueRanges = batchRes.data.valueRanges || [];
        const campaignRanges = valueRanges.slice(0, campaignTabs.length);
        const membersRange = valueRanges[campaignTabs.length]?.values || [];

        // Inisialisasi map statistik untuk target users
        const targetIdSet = new Set(idList);
        const statsMap = new Map();
        for (const uid of targetIdSet) {
            statsMap.set(uid, { views: 0, payout: 0 });
        }

        // Agregasi views & payout dari seluruh tab campaign
        for (const vr of campaignRanges) {
            const rows = vr.values || [];
            for (const row of rows) {
                const uid = row[1] ? String(row[1]).trim() : '';
                if (targetIdSet.has(uid)) {
                    // Col L (index 11) di v1.3.0, fallback index 9 untuk legacy v1.2.2
                    const status = row[11] || row[9] || '';
                    if (status.includes('APPROVED')) {
                        const cur = statsMap.get(uid);
                        cur.views += parseInt(row[5], 10) || 0;
                        cur.payout += parseFloat(row[7]) || 0;
                    }
                }
            }
        }

        // Map userId -> nomor baris di tab Members (offset 2 karena baris 1 header)
        const userRowMap = new Map();
        for (let i = 0; i < membersRange.length; i++) {
            if (membersRange[i][0]) {
                const uid = String(membersRange[i][0]).trim();
                userRowMap.set(uid, i + 2);
            }
        }

        // Susun payload batchUpdate untuk tab Members
        const updateData = [];
        for (const uid of targetIdSet) {
            const rowIndex = userRowMap.get(uid);
            if (rowIndex) {
                const stats = statsMap.get(uid);
                updateData.push({
                    range: `'Members'!E${rowIndex}:F${rowIndex}`,
                    values: [[stats.views, stats.payout]]
                });
            }
        }

        if (updateData.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data: updateData
                }
            });
            console.log(`[SHEETS STATS SYNC] Batch updated stats for ${updateData.length} member(s) in Members tab.`);
        }
    } catch (err) {
        console.error('[SHEETS ERROR] recalculateMembersStatsBatch:', err.message);
    }
}

// Fungsi untuk menghitung ulang & memperbarui Total Views & Payout untuk 1 user
async function recalculateMemberStatsInSheet(userId) {
    if (!userId) return;
    return recalculateMembersStatsBatch([userId]);
}

async function updateSubmissionStatusInSheet(tabName, submissionId, status, reason = '-') {
    const spreadsheetId = getMasterSheetId();
    if (!spreadsheetId) return;

    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${tabName}'!A8:M1000`
        });

        const rows = res.data.values || [];
        let rowIndex = -1;
        let userId = null;

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === submissionId) {
                rowIndex = i + 8;
                userId = rows[i][1]; // Ambil User ID dari Kolom B
                break;
            }
        }

        if (rowIndex !== -1) {
            if (reason && reason !== '-') {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${tabName}'!K${rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[reason]] }
                });
            }

            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${tabName}'!L${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[status]] }
            });

            // SINKRONISASI KE TAB MEMBERS JIKA STATUS APPROVED / REJECTED
            if (userId) {
                await recalculateMemberStatsInSheet(userId);
            }
        }
    } catch (err) {
        console.error('[SHEETS ERROR] updateSubmissionStatusInSheet:', err.message);
    }
}
module.exports = {
    getMasterSheetId,
    parseTargetViews,
    parsePayRateToPerView,
    createCampaignSpreadsheet,
    appendSubmissionToSheet,
    updateSubmissionStatusInSheet,
    getCampaignTargetDetails,
    getCampaignMetadata,
    isLinkSubmitted,
    syncMemberToSheet,
    getMemberDashboardStats,
    getMemberProfileFromSheet,
    recalculateMemberStatsInSheet,
    recalculateMembersStatsBatch,
    logInviteToSheet,
    getAllTabs
};
