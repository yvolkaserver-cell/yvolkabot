require('dotenv').config({ path: __dirname + '/.env' });
const { 
    createCampaignSpreadsheet, 
    appendSubmissionToSheet, 
    updateSubmissionStatusInSheet,
    getCampaignMetadata,
    getCampaignTargetDetails,
    getAllTabs
} = require('./utils/sheetsHelper');

async function sendDummyData() {
    console.log('═'.repeat(60));
    console.log('🚀 MENGIRIM DUMMY DATA KE GOOGLE SHEETS (v1.3.0)');
    console.log('═'.repeat(60));

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
        console.error('❌ GOOGLE_SPREADSHEET_ID tidak ditemukan di .env!');
        return;
    }

    try {
        const timestampSuffix = Date.now().toString().slice(-4);
        const testCampaignTitle = `Test_v130_${timestampSuffix}`;
        const targetViews = '1M';
        const payRate = '$10 / 10k views';
        const startDateIso = new Date().toISOString();
        const officialMusicId = '7123456789012345678';

        console.log(`\n1️⃣ Membuat tab kampanye baru: "${testCampaignTitle}"...`);
        const res = await createCampaignSpreadsheet(
            testCampaignTitle, 
            targetViews, 
            payRate, 
            startDateIso, 
            officialMusicId
        );

        const tabName = res.tabName;
        console.log(`✅ Tab berhasil dibuat: '${tabName}'`);
        console.log(`🔗 Spreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`);

        // 2. Kirim 3 baris Dummy Submissions sesuai skema 13 Kolom (Row 8, 9, 10)
        console.log(`\n2️⃣ Mengirim dummy submissions ke baris 8, 9, dan 10...`);

        // Dummy 1: Status PENDING
        const subId1 = `SUB-${Date.now().toString().slice(-6)}`;
        const dummy1 = [
            subId1,                                            // Col A: Submission ID
            '123456789012345678',                              // Col B: User Discord ID
            'ClipperSatu#0001',                                // Col C: User Tag
            'TikTok',                                          // Col D: Platform
            'https://www.tiktok.com/@clippersatu/video/10001', // Col E: Link
            25000,                                             // Col F: Total Views
            1800,                                              // Col G: Total Likes
            '=INDIRECT("F"&ROW())*B$4',                        // Col H: Payout Formula
            new Date(Date.now() - 3600000).toISOString(),       // Col I: VT Post Date [NEW]
            `${officialMusicId} - Official Campaign Song`,     // Col J: Music Detected [NEW]
            '-',                                               // Col K: Rejection Notes
            'PENDING',                                         // Col L: Status
            new Date().toISOString()                           // Col M: Submitted At
        ];
        await appendSubmissionToSheet(tabName, dummy1);
        console.log(`   ├─ ✅ Dummy 1 terkirim: ${subId1} (PENDING, 25k views)`);

        // Dummy 2: Nanti di-update ke APPROVED
        const subId2 = `SUB-${(Date.now() + 1).toString().slice(-6)}`;
        const dummy2 = [
            subId2,
            '987654321098765432',
            'ClipperDua#0002',
            'TikTok',
            'https://www.tiktok.com/@clipperdua/video/10002',
            80000,
            6500,
            '=INDIRECT("F"&ROW())*B$4',
            new Date(Date.now() - 7200000).toISOString(),
            `${officialMusicId} - Official Campaign Song`,
            '-',
            'PENDING',
            new Date().toISOString()
        ];
        await appendSubmissionToSheet(tabName, dummy2);
        console.log(`   ├─ ✅ Dummy 2 terkirim: ${subId2} (Akan di-approve)`);

        // Dummy 3: Nanti di-update ke REJECTED
        const subId3 = `SUB-${(Date.now() + 2).toString().slice(-6)}`;
        const dummy3 = [
            subId3,
            '555666777888999000',
            'ClipperTiga#0003',
            'TikTok',
            'https://www.tiktok.com/@clippertiga/video/10003',
            5000,
            120,
            '=INDIRECT("F"&ROW())*B$4',
            new Date(Date.now() - 10800000).toISOString(),
            `9999999999999999999 - Unrelated Viral Song`,
            '-',
            'PENDING',
            new Date().toISOString()
        ];
        await appendSubmissionToSheet(tabName, dummy3);
        console.log(`   ├─ ✅ Dummy 3 terkirim: ${subId3} (Akan di-reject)`);

        // 3. Uji Update Status Submission
        console.log(`\n3️⃣ Menguji pembaruan status ke Google Sheets...`);
        await updateSubmissionStatusInSheet(tabName, subId2, 'APPROVED by TesterAdmin', '-');
        console.log(`   ├─ ✅ ${subId2} diupdate ke: APPROVED by TesterAdmin`);

        await updateSubmissionStatusInSheet(tabName, subId3, 'REJECTED', 'Video menggunakan sound yang salah');
        console.log(`   ├─ ✅ ${subId3} diupdate ke: REJECTED (Reason: Video menggunakan sound yang salah)`);

        // 4. Verifikasi Pembacaan Metadata & Target
        console.log(`\n4️⃣ Memverifikasi pembacaan metadata tab '${tabName}'...`);
        const meta = await getCampaignMetadata(tabName);
        console.log('   Metadata terbaca:', {
            Title: meta.title,
            TargetViews: meta.targetViews,
            RatePerView: meta.ratePerView,
            StartDate: meta.startDate,
            MusicId: meta.musicId
        });

        const targetDetails = await getCampaignTargetDetails(tabName);
        console.log('   Target Details:', targetDetails);

        console.log('\n' + '═'.repeat(60));
        console.log('🎉 SUKSES BESAR! DUMMY DATA BERHASIL DIINJEKSIKAN!');
        console.log(`Buka Google Sheet Anda untuk melihat tab '${tabName}' secara langsung:`);
        console.log(`👉 https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`);
        console.log('═'.repeat(60));

    } catch (err) {
        console.error('\n❌ Terjadi error saat mengirim dummy data:', err);
    }
}

sendDummyData();
