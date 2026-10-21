/**
 * Generates visual Target Views progress bar for active campaign cards
 * @param {number} currentViews Views yang sudah tercapai/approved
 * @param {number} targetViews Target total views campaign
 */
function createProgressBar(currentViews = 0, targetViews = 100000) {
    if (!targetViews || targetViews <= 0) targetViews = 1;
    
    // Hitung persentase progress (0% - 100%)
    const rawPercent = (currentViews / targetViews) * 100;
    const safePercent = Math.max(0, Math.min(100, Math.floor(rawPercent)));
    
    const totalBlocks = 10;
    const filledBlocks = Math.round((safePercent / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;

    const filledStr = '🟩'.repeat(filledBlocks);
    const emptyStr = '⬛'.repeat(emptyBlocks);

    if (safePercent >= 100) {
        return `🎯 [🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩] **100% (TARGET REACHED / CLOSED)**`;
    }

    return `📊 [${filledStr}${emptyStr}] **${safePercent}% Completed** (${currentViews.toLocaleString()} / ${targetViews.toLocaleString()} views)`;
}

module.exports = { createProgressBar };
