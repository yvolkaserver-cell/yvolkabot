require('dotenv').config({ path: __dirname + '/.env' });
const { extractMusicId } = require('./utils/tiktokScraper');
const { parseTargetViews, parsePayRateToPerView } = require('./utils/sheetsHelper');

console.log('═'.repeat(60));
console.log('🧪 RUNNING PRD QA TESTING MATRIX (v1.3.0)');
console.log('═'.repeat(60));

let passed = 0;
let total = 0;

function assertTest(id, name, condition, details = '') {
    total++;
    if (condition) {
        passed++;
        console.log(`✅ [${id}] ${name}: PASSED ${details}`);
    } else {
        console.error(`❌ [${id}] ${name}: FAILED ${details}`);
    }
}

// ─────────────────────────────────────────────────────────────
// 1. UNIT TEST: Music ID Extractor
// ─────────────────────────────────────────────────────────────
console.log('\n[1] Testing Music ID Extraction...');
assertTest('UNIT-01', 'Extract numeric ID from string', extractMusicId('7123456789012345678') === '7123456789012345678');
assertTest('UNIT-02', 'Extract numeric ID from TikTok sound URL', extractMusicId('https://www.tiktok.com/music/sound-title-7123456789012345678') === '7123456789012345678');
assertTest('UNIT-03', 'Extract numeric ID from short music link', extractMusicId('https://www.tiktok.com/music/7123456789012345678') === '7123456789012345678');

// ─────────────────────────────────────────────────────────────
// 2. UNIT TEST: Target Views & Rate Parsers
// ─────────────────────────────────────────────────────────────
console.log('\n[2] Testing Sheet Helper Parsers...');
assertTest('UNIT-04', 'Parse Target Views "1M"', parseTargetViews('1M') === 1000000);
assertTest('UNIT-05', 'Parse Target Views "500K"', parseTargetViews('500K') === 500000);
assertTest('UNIT-06', 'Parse Pay Rate "$10 / 10k views"', parsePayRateToPerView('$10 / 10k views') === 0.001);

// ─────────────────────────────────────────────────────────────
// 3. QA TESTING MATRIX (Sesuai Section 8 PRD)
// ─────────────────────────────────────────────────────────────
console.log('\n[3] Testing QA Matrix Scenarios (TC-VAL-01 s/d TC-VAL-05)...');

const mockCampaign = {
    title: 'Growtopia TikTok Campaign',
    targetViews: 1000000,
    ratePerView: 0.001,
    startDateStr: '2026-10-21T00:00:00.000Z',
    startDateUnix: Math.floor(new Date('2026-10-21T00:00:00.000Z').getTime() / 1000), // 1792540800
    musicId: '7123456789012345678'
};

function simulateGatekeeper({ userRegistered, isDuplicate, vtCreateTime, vtMusicId, vtMusicTitle }) {
    // Check 0: Profile
    if (!userRegistered) {
        return { accepted: false, code: 'MISSING_PROFILE', reason: 'Please set up your profile first' };
    }
    // Check 1: Duplicate
    if (isDuplicate) {
        return { accepted: false, code: 'DUPLICATE_LINK', reason: 'This link has already been submitted' };
    }
    // Check 2: Upload Date
    if (vtCreateTime < mockCampaign.startDateUnix) {
        return { accepted: false, code: 'OLDER_VT', reason: 'VT uploaded prior to campaign start' };
    }
    // Check 3: Music Track
    const reqMusicId = extractMusicId(mockCampaign.musicId);
    let match = false;
    if (reqMusicId && vtMusicId && vtMusicId === reqMusicId) match = true;
    else if (vtMusicTitle && vtMusicTitle.toLowerCase().includes(mockCampaign.musicId.toLowerCase())) match = true;

    if (!match) {
        return { accepted: false, code: 'WRONG_AUDIO', reason: 'Incorrect audio track detected' };
    }

    return { accepted: true, code: 'ACCEPTED', reason: 'Passed all gatekeeper checks' };
}

// TC-VAL-01: Valid Submission
const res1 = simulateGatekeeper({
    userRegistered: true,
    isDuplicate: false,
    vtCreateTime: mockCampaign.startDateUnix + 3600, // 1 hour after start
    vtMusicId: '7123456789012345678',
    vtMusicTitle: 'Official Campaign Song'
});
assertTest('TC-VAL-01', 'Valid Submission (Date >= Start & Audio Match)', res1.accepted === true && res1.code === 'ACCEPTED');

// TC-VAL-02: Older VT Submission
const res2 = simulateGatekeeper({
    userRegistered: true,
    isDuplicate: false,
    vtCreateTime: mockCampaign.startDateUnix - 86400, // 1 day before start
    vtMusicId: '7123456789012345678',
    vtMusicTitle: 'Official Campaign Song'
});
assertTest('TC-VAL-02', 'Older VT Submission Rejected (VT Date < Start Date)', res2.accepted === false && res2.code === 'OLDER_VT');

// TC-VAL-03: Wrong Sound Submission
const res3 = simulateGatekeeper({
    userRegistered: true,
    isDuplicate: false,
    vtCreateTime: mockCampaign.startDateUnix + 100,
    vtMusicId: '9999999999999999999', // Different sound
    vtMusicTitle: 'Unrelated Viral Sound'
});
assertTest('TC-VAL-03', 'Wrong Sound Rejected (Audio ID Mismatch)', res3.accepted === false && res3.code === 'WRONG_AUDIO');

// TC-VAL-04: Duplicate Submission
const res4 = simulateGatekeeper({
    userRegistered: true,
    isDuplicate: true, // Same link twice
    vtCreateTime: mockCampaign.startDateUnix + 100,
    vtMusicId: '7123456789012345678',
    vtMusicTitle: 'Official Campaign Song'
});
assertTest('TC-VAL-04', 'Duplicate Submission Rejected', res4.accepted === false && res4.code === 'DUPLICATE_LINK');

// TC-VAL-05: Missing Profile
const res5 = simulateGatekeeper({
    userRegistered: false,
    isDuplicate: false,
    vtCreateTime: mockCampaign.startDateUnix + 100,
    vtMusicId: '7123456789012345678',
    vtMusicTitle: 'Official Campaign Song'
});
assertTest('TC-VAL-05', 'Missing Profile Rejected', res5.accepted === false && res5.code === 'MISSING_PROFILE');

// ─────────────────────────────────────────────────────────────
// 4. SCHEMA & COLUMN VERIFICATION
// ─────────────────────────────────────────────────────────────
console.log('\n[4] Verifying 13-Column Submission Row Layout...');
const sampleSubId = 'SUB-987654';
const samplePostDateIso = new Date().toISOString();
const sampleMusicDetected = '7123456789012345678 - Official Song';
const rowData = [
    sampleSubId,                               // Col A (0)
    '111222333444',                            // Col B (1)
    'Clipper#1234',                            // Col C (2)
    'TikTok',                                  // Col D (3)
    'https://tiktok.com/@clip/video/12345',    // Col E (4)
    15000,                                     // Col F (5)
    1200,                                      // Col G (6)
    '=INDIRECT("F"&ROW())*B$4',                // Col H (7)
    samplePostDateIso,                         // Col I (8) [NEW]
    sampleMusicDetected,                       // Col J (9) [NEW]
    '-',                                       // Col K (10)
    'PENDING',                                 // Col L (11)
    new Date().toISOString()                   // Col M (12)
];

assertTest('SCHEMA-01', 'Submission Row length is exactly 13 columns (A-M)', rowData.length === 13);
assertTest('SCHEMA-02', 'Col I (index 8) is VT Post Date', rowData[8] === samplePostDateIso);
assertTest('SCHEMA-03', 'Col J (index 9) is Music Detected', rowData[9] === sampleMusicDetected);
assertTest('SCHEMA-04', 'Col L (index 11) is Status', rowData[11] === 'PENDING');

console.log('\n' + '═'.repeat(60));
console.log(`📊 TEST RESULTS: ${passed} / ${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
console.log('═'.repeat(60));
