require('dotenv').config({ path: __dirname + '/.env' });
const { createCampaignSpreadsheet, appendSubmissionToSheet, updateSubmissionStatusInSheet } = require('./utils/sheetsHelper');

async function runUnitTest() {
    console.log('🧪 Starting Master Google Sheet Unit Test...\n');

    const masterId = process.env.MASTER_SPREADSHEET_ID;
    if (!masterId) {
        console.error('❌ MASTER_SPREADSHEET_ID is missing in .env file!');
        return;
    }

    try {
        const campaignTitle = `Campaign Test ${Date.now().toString().slice(-4)}`;
        console.log(`1️⃣ Creating new Tab for: "${campaignTitle}"...`);
        const { spreadsheetId, spreadsheetUrl, tabName } = await createCampaignSpreadsheet(campaignTitle, '100K', '$10 / 10k views');
        console.log(`✅ Tab created successfully! URL: ${spreadsheetUrl}`);

        const testSubId = `TEST-${Date.now().toString().slice(-4)}`;
        console.log(`2️⃣ Appending submission ${testSubId} to Tab "${tabName}"...`);
        const rowData = [
            testSubId,
            '123456789',
            'Tester#0001',
            'TikTok',
            'https://tiktok.com/@test/video/123',
            5000,
            250,
            '=INDIRECT("F"&ROW())*B$4',
            '-',
            'PENDING',
            new Date().toLocaleString()
        ];
        await appendSubmissionToSheet(tabName, rowData);

        console.log(`3️⃣ Updating status for ${testSubId}...`);
        await updateSubmissionStatusInSheet(tabName, testSubId, 'APPROVED by AdminTester', '-');

        console.log('\n🎉 ALL UNIT TESTS PASSED! Check your Google Sheet now!');
    } catch (error) {
        console.error('\n❌ UNIT TEST FAILED:', error);
    }
}

runUnitTest();
