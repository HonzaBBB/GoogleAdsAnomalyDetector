/**
 * Google Ads Anomaly Detector (MCC Version)
 * 
 * Monitors multiple Google Ads accounts for common issues:
 * - Zero impressions/clicks (campaigns not serving)
 * - Budget lost impression share
 * - Campaign status issues (budget/bidding constrained)
 * - Budget spend monitoring with TREND TRACKING
 * - PNO (cost/revenue ratio) monitoring
 * - Disapproved ads/keywords/assets
 * - Conversion tracking issues
 * - RSA ad strength check
 * - Quality Score monitoring
 * 
 * Run from MCC (Manager) account - iterates through all defined accounts.
 * 
 * @version 3.0
 * @author Honza Brzák PPC Freelancer
 * @license MIT
 * 
 * Setup:
 * 1. Create a Google Sheet for logging
 * 2. Update CONFIG section with your account IDs and settings
 * 3. Schedule to run daily from your MCC account
 */

// ============ CONFIG ============
const CONFIG = {
  // Google Sheet URL for logging issues
  SPREADSHEET_URL: 'YOUR_GOOGLE_SHEET_URL_HERE',
  
  // Email for notifications
  EMAIL: 'your-email@example.com',
  
  // Accounts to monitor (Customer ID without dashes)
  MONITORED_ACCOUNTS: [
    '1234567890', // Account 1
    '2345678901', // Account 2
    '3456789012', // Account 3
  ],
  
  // Monthly budgets in your currency (key = Customer ID without dashes)
  // Leave empty {} if you don't want budget monitoring
  MONTHLY_BUDGETS: {
    '1234567890': 10000, // Account 1 - 10,000/month
    '2345678901': 5000,  // Account 2 - 5,000/month
    '3456789012': 20000, // Account 3 - 20,000/month
  },
  
  // Budget thresholds (in %)
  BUDGET_THRESHOLDS: {
    UNDERSPEND_WARNING: 60,  // Alert if projected spend < 60%
    OVERSPEND_WARNING: 90,   // Alert if projected spend > 90%
    OVERSPEND_CRITICAL: 100  // Critical if projected spend > 100%
  },
  
  // Max PNO (cost/revenue ratio) per account
  // PNO 0.2 = 20% = ROAS 500%
  // Leave empty {} if you don't want PNO monitoring
  MAX_PNO: {
    '1234567890': 0.25,  // Account 1 - max 25% PNO (ROAS 400%)
    '2345678901': 0.20,  // Account 2 - max 20% PNO (ROAS 500%)
  },
  
  // === TREND TRACKING ===
  TREND_TRACKING: {
    ENABLED: true,
    // Reduce severity if trend is improving
    REDUCE_SEVERITY_ON_POSITIVE_TREND: true,
    // Threshold for "significant" trend (%)
    SIGNIFICANT_TREND_PCT: 10
  },
  
  // === POLICY CHECKS ===
  POLICY_CHECKS: {
    ENABLED: true,
    // Accounts to ignore for policy issues
    IGNORED_ACCOUNTS: [],
    // Campaigns to ignore
    IGNORED_CAMPAIGNS: [],
    // Issue types to ignore globally
    IGNORED_ISSUE_TYPES: []
  },
  
  // === CONVERSION TRACKING CHECK ===
  CONVERSION_CHECK: {
    ENABLED: true,
    MIN_SPEND_FOR_ALERT: 1000,  // Alert only if spend > this amount
    LOOKBACK_DAYS: 14
  },
  
  // === AD STRENGTH CHECK ===
  AD_STRENGTH_CHECK: {
    ENABLED: true,
    ALERT_ON: ['POOR'],  // Options: POOR, AVERAGE, GOOD, EXCELLENT
    IGNORED_CAMPAIGNS: []
  },
  
  // === QUALITY SCORE CHECK ===
  QS_CHECK: {
    ENABLED: false,  // Default OFF - can be noisy
    MIN_QS_THRESHOLD: 5,
    MIN_IMPRESSIONS: 100
  }
};

// ============ MAIN ============
function main() {
  const startTime = new Date();
  Logger.log('=== Anomaly Detector v3.0 (MCC) ===');
  Logger.log(`Date: ${startTime.toISOString()}`);
  
  const issues = [];
  let accountCount = 0;
  let campaignCount = 0;
  let errors = 0;
  
  const accountIterator = AdsManagerApp.accounts().get();
  
  while (accountIterator.hasNext()) {
    const account = accountIterator.next();
    const customerId = account.getCustomerId().replace(/-/g, '');
    
    if (!CONFIG.MONITORED_ACCOUNTS.includes(customerId)) {
      continue;
    }
    
    accountCount++;
    AdsManagerApp.select(account);
    const accountName = account.getName();
    Logger.log(`\n${'='.repeat(50)}`);
    Logger.log(`Account: ${accountName} (${customerId})`);
    Logger.log('='.repeat(50));
    
    try {
      // Basic campaign health checks
      campaignCount += checkCampaignHealth(accountName, customerId, issues);
      
      // GAQL-based checks
      checkBudgetLimitation(accountName, customerId, issues);
      checkCampaignStatus(accountName, customerId, issues);
      
      // Budget spend with trend tracking
      checkBudgetSpendWithTrend(accountName, customerId, issues);
      
      // PNO check
      checkPNO(accountName, customerId, issues);
      
      // Policy checks
      if (CONFIG.POLICY_CHECKS.ENABLED && 
          !CONFIG.POLICY_CHECKS.IGNORED_ACCOUNTS.includes(customerId)) {
        checkDisapprovedAds(accountName, customerId, issues);
        checkDisapprovedKeywords(accountName, customerId, issues);
        checkDisapprovedAssets(accountName, customerId, issues);
      }
      
      // Conversion tracking check
      if (CONFIG.CONVERSION_CHECK.ENABLED) {
        checkConversionTracking(accountName, customerId, issues);
      }
      
      // Ad strength check
      if (CONFIG.AD_STRENGTH_CHECK.ENABLED) {
        checkAdStrength(accountName, customerId, issues);
      }
      
      // Quality score check
      if (CONFIG.QS_CHECK.ENABLED) {
        checkQualityScore(accountName, customerId, issues);
      }
      
    } catch (e) {
      errors++;
      Logger.log(`ERROR processing account: ${e.message}`);
      Logger.log(e.stack);
    }
  }
  
  // Summary
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);
  
  Logger.log(`\n${'='.repeat(50)}`);
  Logger.log('SUMMARY');
  Logger.log('='.repeat(50));
  Logger.log(`Accounts: ${accountCount}`);
  Logger.log(`Campaigns: ${campaignCount}`);
  Logger.log(`Issues: ${issues.length}`);
  Logger.log(`Errors: ${errors}`);
  Logger.log(`Duration: ${duration}s`);
  
  // Write to sheet
  Logger.log('\nWriting to sheet...');
  writeToSheet(issues, startTime);
  Logger.log('Sheet OK');
  
  // Email notification
  if (issues.length > 0) {
    Logger.log('Sending email...');
    sendAlert(issues, startTime);
    Logger.log('Email sent');
  }
  
  Logger.log('=== DONE ===');
}

// ============ CAMPAIGN HEALTH CHECKS ============

function checkCampaignHealth(accountName, customerId, issues) {
  let campaignCount = 0;
  
  // Search & Display campaigns
  const campaigns = AdsApp.campaigns()
    .withCondition('Status = ENABLED')
    .withCondition('campaign.experiment_type != EXPERIMENT')
    .get();
  
  while (campaigns.hasNext()) {
    const campaign = campaigns.next();
    campaignCount++;
    const stats = campaign.getStatsFor('LAST_7_DAYS');
    
    const impressions = stats.getImpressions();
    const clicks = stats.getClicks();
    
    Logger.log(`  ${campaign.getName()}: ${impressions} imp, ${clicks} clicks`);
    
    if (impressions === 0) {
      Logger.log('    -> PROBLEM: Zero impressions');
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaign.getName(),
        issue: 'Zero Impressions (7 days)',
        detail: 'Campaign not serving',
        severity: 'CRITICAL'
      });
    }
    
    if (clicks === 0 && impressions > 0) {
      Logger.log('    -> PROBLEM: Zero clicks');
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaign.getName(),
        issue: 'Zero Clicks (7 days)',
        detail: `${impressions} impressions, 0 clicks`,
        severity: 'CRITICAL'
      });
    }
  }
  
  // Performance Max campaigns
  const pmaxCampaigns = AdsApp.performanceMaxCampaigns()
    .withCondition('Status = ENABLED')
    .withCondition('campaign.experiment_type != EXPERIMENT')
    .get();
  
  while (pmaxCampaigns.hasNext()) {
    const campaign = pmaxCampaigns.next();
    campaignCount++;
    const stats = campaign.getStatsFor('LAST_7_DAYS');
    
    const impressions = stats.getImpressions();
    const clicks = stats.getClicks();
    
    Logger.log(`  [PMAX] ${campaign.getName()}: ${impressions} imp, ${clicks} clicks`);
    
    if (impressions === 0) {
      Logger.log('    -> PROBLEM: Zero impressions');
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaign.getName() + ' [PMAX]',
        issue: 'Zero Impressions (7 days)',
        detail: 'Campaign not serving',
        severity: 'CRITICAL'
      });
    }
    
    if (clicks === 0 && impressions > 0) {
      Logger.log('    -> PROBLEM: Zero clicks');
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaign.getName() + ' [PMAX]',
        issue: 'Zero Clicks (7 days)',
        detail: `${impressions} impressions, 0 clicks`,
        severity: 'CRITICAL'
      });
    }
  }
  
  return campaignCount;
}

// ============ BUDGET LIMITATION CHECK ============

function checkBudgetLimitation(accountName, customerId, issues) {
  Logger.log('  -> Checking budget lost impression share...');
  
  const report = AdsApp.report(
    'SELECT campaign.name, campaign.advertising_channel_type, ' +
    '       metrics.search_budget_lost_impression_share ' +
    'FROM campaign ' +
    'WHERE campaign.status = "ENABLED" ' +
    '  AND campaign.experiment_type != "EXPERIMENT" ' +
    '  AND segments.date DURING LAST_7_DAYS ' +
    '  AND metrics.search_budget_lost_impression_share > 0.10'
  );
  
  const rows = report.rows();
  while (rows.hasNext()) {
    const row = rows.next();
    const campaignName = row['campaign.name'];
    const lostIS = parseFloat(row['metrics.search_budget_lost_impression_share']);
    const channelType = row['campaign.advertising_channel_type'];
    
    const campaignLabel = channelType === 'PERFORMANCE_MAX' ? 
      `${campaignName} [PMAX]` : campaignName;
    
    Logger.log(`    -> INFO: Budget limited (${(lostIS * 100).toFixed(1)}% lost IS)`);
    issues.push({
      account: accountName,
      customerId: customerId,
      campaign: campaignLabel,
      issue: 'Budget Lost Impression Share',
      detail: `${(lostIS * 100).toFixed(1)}% impression share lost due to budget`,
      severity: 'INFO'
    });
  }
}

// ============ CAMPAIGN STATUS CHECK ============

function checkCampaignStatus(accountName, customerId, issues) {
  Logger.log('  -> Checking campaign status reasons...');
  
  const query = `
    SELECT 
      campaign.name,
      campaign.advertising_channel_type,
      campaign.primary_status,
      campaign.primary_status_reasons
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.experiment_type != 'EXPERIMENT'
      AND segments.date DURING LAST_7_DAYS
  `;
  
  const report = AdsApp.report(query);
  const rows = report.rows();
  
  while (rows.hasNext()) {
    const row = rows.next();
    const campaignName = row['campaign.name'];
    const primaryStatus = row['campaign.primary_status'];
    const statusReasons = row['campaign.primary_status_reasons'];
    const channelType = row['campaign.advertising_channel_type'];
    
    const campaignLabel = channelType === 'PERFORMANCE_MAX' ? 
      `${campaignName} [PMAX]` : campaignName;
    
    if (statusReasons && statusReasons.includes('BUDGET_CONSTRAINED')) {
      Logger.log(`    -> PROBLEM: Budget constrained (${campaignName})`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'Campaign Status: Limited by Budget',
        detail: `Primary status: ${primaryStatus}`,
        severity: 'HIGH'
      });
    }
    
    if (statusReasons && statusReasons.includes('BIDDING_STRATEGY_CONSTRAINED')) {
      Logger.log(`    -> INFO: Bidding constrained (${campaignName})`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'Campaign Status: Limited by Bidding Strategy',
        detail: `Primary status: ${primaryStatus}`,
        severity: 'MEDIUM'
      });
    }
  }
}

// ============ BUDGET SPEND WITH TREND ============

function checkBudgetSpendWithTrend(accountName, customerId, issues) {
  if (!CONFIG.MONTHLY_BUDGETS[customerId]) {
    Logger.log('  -> Budget monitoring disabled for this account');
    return;
  }
  
  Logger.log('  -> Checking budget spend with trend...');
  
  const expectedMonthlyBudget = CONFIG.MONTHLY_BUDGETS[customerId];
  
  // Get current week spend
  const currentSpend = getSpendForPeriod('LAST_7_DAYS');
  
  // Get previous week spend for trend calculation
  const previousSpend = getSpendForPeriod('LAST_14_DAYS') - currentSpend;
  
  // Calculate trend
  let trendPct = 0;
  let trendDirection = 'STABLE';
  if (previousSpend > 0) {
    trendPct = ((currentSpend - previousSpend) / previousSpend) * 100;
    if (trendPct > CONFIG.TREND_TRACKING.SIGNIFICANT_TREND_PCT) {
      trendDirection = 'UP';
    } else if (trendPct < -CONFIG.TREND_TRACKING.SIGNIFICANT_TREND_PCT) {
      trendDirection = 'DOWN';
    }
  }
  
  // Project monthly spend based on current week
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonthlySpend = (currentSpend / 7) * daysInMonth;
  const spendPercent = (projectedMonthlySpend / expectedMonthlyBudget) * 100;
  
  Logger.log(`    Current week: ${currentSpend.toFixed(0)}`);
  Logger.log(`    Previous week: ${previousSpend.toFixed(0)}`);
  Logger.log(`    Trend: ${trendDirection} (${trendPct.toFixed(1)}%)`);
  Logger.log(`    Projected monthly: ${projectedMonthlySpend.toFixed(0)} / ${expectedMonthlyBudget} (${spendPercent.toFixed(1)}%)`);
  
  // Underspending
  if (spendPercent < CONFIG.BUDGET_THRESHOLDS.UNDERSPEND_WARNING) {
    if (trendDirection === 'UP' && CONFIG.TREND_TRACKING.REDUCE_SEVERITY_ON_POSITIVE_TREND) {
      Logger.log(`    -> INFO: Underspend but improving (trend ${trendPct.toFixed(1)}%)`);
    } else {
      Logger.log(`    -> WARNING: Underspending (${spendPercent.toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: 'ACCOUNT TOTAL',
        issue: 'Budget Underspend',
        detail: `Projected ${projectedMonthlySpend.toFixed(0)} / ${expectedMonthlyBudget.toFixed(0)} (${spendPercent.toFixed(1)}%) | Trend: ${trendDirection} (${trendPct.toFixed(1)}%)`,
        severity: 'MEDIUM'
      });
    }
  }
  
  // Overspending - CRITICAL
  else if (spendPercent > CONFIG.BUDGET_THRESHOLDS.OVERSPEND_CRITICAL) {
    if (trendDirection === 'DOWN' && CONFIG.TREND_TRACKING.REDUCE_SEVERITY_ON_POSITIVE_TREND) {
      Logger.log(`    -> WARNING: Overspend but improving (trend ${trendPct.toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: 'ACCOUNT TOTAL',
        issue: 'Budget Overspend (Improving)',
        detail: `Projected ${projectedMonthlySpend.toFixed(0)} / ${expectedMonthlyBudget.toFixed(0)} (${spendPercent.toFixed(1)}%) | Trend: ${trendDirection} (${trendPct.toFixed(1)}%)`,
        severity: 'HIGH'
      });
    } else {
      Logger.log(`    -> CRITICAL: Overspending (${spendPercent.toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: 'ACCOUNT TOTAL',
        issue: 'Budget Overspend (CRITICAL)',
        detail: `Projected ${projectedMonthlySpend.toFixed(0)} / ${expectedMonthlyBudget.toFixed(0)} (${spendPercent.toFixed(1)}%) | Trend: ${trendDirection} (${trendPct.toFixed(1)}%)`,
        severity: 'CRITICAL'
      });
    }
  }
  
  // Overspending - WARNING
  else if (spendPercent > CONFIG.BUDGET_THRESHOLDS.OVERSPEND_WARNING) {
    if (trendDirection === 'DOWN' && CONFIG.TREND_TRACKING.REDUCE_SEVERITY_ON_POSITIVE_TREND) {
      Logger.log(`    -> INFO: High spend but improving - no alert`);
    } else {
      Logger.log(`    -> WARNING: High spending (${spendPercent.toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: 'ACCOUNT TOTAL',
        issue: 'Budget Overspend Warning',
        detail: `Projected ${projectedMonthlySpend.toFixed(0)} / ${expectedMonthlyBudget.toFixed(0)} (${spendPercent.toFixed(1)}%) | Trend: ${trendDirection} (${trendPct.toFixed(1)}%)`,
        severity: 'HIGH'
      });
    }
  }
}

/**
 * Get spend for a given period
 */
function getSpendForPeriod(dateRange) {
  const query = `
    SELECT metrics.cost_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.experiment_type != 'EXPERIMENT'
      AND segments.date DURING ${dateRange}
  `;
  
  const report = AdsApp.report(query);
  const rows = report.rows();
  
  let totalSpendMicros = 0;
  while (rows.hasNext()) {
    const row = rows.next();
    totalSpendMicros += parseFloat(row['metrics.cost_micros'] || 0);
  }
  
  return totalSpendMicros / 1000000;
}

// ============ PNO CHECK ============

function checkPNO(accountName, customerId, issues) {
  if (!CONFIG.MAX_PNO[customerId]) {
    Logger.log('  -> PNO monitoring disabled for this account');
    return;
  }
  
  Logger.log('  -> Checking PNO (30 days)...');
  
  const maxPNO = CONFIG.MAX_PNO[customerId];
  
  const query = `
    SELECT 
      campaign.name,
      campaign.advertising_channel_type,
      metrics.cost_micros,
      metrics.conversions_value
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.experiment_type != 'EXPERIMENT'
      AND segments.date DURING LAST_30_DAYS
      AND metrics.conversions_value > 0
  `;
  
  const report = AdsApp.report(query);
  const rows = report.rows();
  
  // Aggregate per campaign
  const campaignData = {};
  
  while (rows.hasNext()) {
    const row = rows.next();
    const campaignName = row['campaign.name'];
    const channelType = row['campaign.advertising_channel_type'];
    const costMicros = parseFloat(row['metrics.cost_micros'] || 0);
    const conversionValue = parseFloat(row['metrics.conversions_value'] || 0);
    
    if (!campaignData[campaignName]) {
      campaignData[campaignName] = {
        channelType: channelType,
        totalCost: 0,
        totalRevenue: 0
      };
    }
    
    campaignData[campaignName].totalCost += costMicros;
    campaignData[campaignName].totalRevenue += conversionValue;
  }
  
  // Analyze per campaign
  for (const campaignName in campaignData) {
    const data = campaignData[campaignName];
    const cost = data.totalCost / 1000000;
    const revenue = data.totalRevenue;
    const pno = cost / revenue;
    const roas = revenue / cost;
    
    const campaignLabel = data.channelType === 'PERFORMANCE_MAX' ? 
      `${campaignName} [PMAX]` : campaignName;
    
    Logger.log(`    ${campaignName}: PNO = ${(pno * 100).toFixed(1)}% (ROAS ${(roas * 100).toFixed(0)}%)`);
    
    if (pno > maxPNO * 1.5) {
      Logger.log(`    -> CRITICAL: Very high PNO (${(pno * 100).toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'PNO Critical',
        detail: `PNO ${(pno * 100).toFixed(1)}% (max ${(maxPNO * 100).toFixed(0)}%) - ROAS ${(roas * 100).toFixed(0)}%`,
        severity: 'HIGH'
      });
    } else if (pno > maxPNO) {
      Logger.log(`    -> WARNING: High PNO (${(pno * 100).toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'PNO Warning',
        detail: `PNO ${(pno * 100).toFixed(1)}% (max ${(maxPNO * 100).toFixed(0)}%) - ROAS ${(roas * 100).toFixed(0)}%`,
        severity: 'MEDIUM'
      });
    }
  }
}

// ============ POLICY CHECKS ============

function checkDisapprovedAds(accountName, customerId, issues) {
  Logger.log('  -> Checking disapproved ads...');
  
  try {
    const query = `
      SELECT 
        campaign.name,
        ad_group.name,
        ad_group_ad.ad.id,
        ad_group_ad.policy_summary.approval_status
      FROM ad_group_ad
      WHERE ad_group_ad.status != 'REMOVED'
        AND campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED', 'AREA_OF_INTEREST_ONLY', 'APPROVED_LIMITED')
    `;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    const disapprovedAds = [];
    while (rows.hasNext()) {
      const row = rows.next();
      const campaignName = row['campaign.name'];
      
      if (CONFIG.POLICY_CHECKS.IGNORED_CAMPAIGNS.includes(campaignName)) continue;
      if (CONFIG.POLICY_CHECKS.IGNORED_ISSUE_TYPES.includes('DISAPPROVED_AD')) continue;
      
      disapprovedAds.push({
        campaign: campaignName,
        adGroup: row['ad_group.name'],
        status: row['ad_group_ad.policy_summary.approval_status']
      });
    }
    
    if (disapprovedAds.length > 0) {
      Logger.log(`    -> Found ${disapprovedAds.length} disapproved/limited ads`);
      
      const campaigns = [...new Set(disapprovedAds.map(a => a.campaign))];
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaigns.join(', '),
        issue: 'Disapproved Ads',
        detail: `${disapprovedAds.length} ad(s) disapproved or limited`,
        severity: 'HIGH'
      });
    }
  } catch (e) {
    Logger.log(`    -> Error checking disapproved ads: ${e.message}`);
  }
}

function checkDisapprovedKeywords(accountName, customerId, issues) {
  Logger.log('  -> Checking disapproved keywords...');
  
  try {
    const query = `
      SELECT 
        campaign.name,
        ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.approval_status
      FROM keyword_view
      WHERE ad_group_criterion.status = 'ENABLED'
        AND campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND ad_group_criterion.approval_status = 'DISAPPROVED'
    `;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    const disapprovedKWs = [];
    while (rows.hasNext()) {
      const row = rows.next();
      const campaignName = row['campaign.name'];
      
      if (CONFIG.POLICY_CHECKS.IGNORED_CAMPAIGNS.includes(campaignName)) continue;
      if (CONFIG.POLICY_CHECKS.IGNORED_ISSUE_TYPES.includes('DISAPPROVED_KEYWORD')) continue;
      
      disapprovedKWs.push({
        campaign: campaignName,
        keyword: row['ad_group_criterion.keyword.text']
      });
    }
    
    if (disapprovedKWs.length > 0) {
      Logger.log(`    -> Found ${disapprovedKWs.length} disapproved keywords`);
      
      const campaigns = [...new Set(disapprovedKWs.map(k => k.campaign))];
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaigns.join(', '),
        issue: 'Disapproved Keywords',
        detail: `${disapprovedKWs.length} keyword(s) disapproved`,
        severity: 'MEDIUM'
      });
    }
  } catch (e) {
    Logger.log(`    -> Error checking disapproved keywords: ${e.message}`);
  }
}

function checkDisapprovedAssets(accountName, customerId, issues) {
  Logger.log('  -> Checking disapproved assets...');
  
  try {
    const query = `
      SELECT 
        asset.name,
        asset.type,
        asset.policy_summary.approval_status
      FROM asset
      WHERE asset.policy_summary.approval_status IN ('DISAPPROVED', 'AREA_OF_INTEREST_ONLY', 'APPROVED_LIMITED')
    `;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    let disapprovedCount = 0;
    while (rows.hasNext()) {
      if (CONFIG.POLICY_CHECKS.IGNORED_ISSUE_TYPES.includes('DISAPPROVED_ASSET')) continue;
      rows.next();
      disapprovedCount++;
    }
    
    if (disapprovedCount > 0) {
      Logger.log(`    -> Found ${disapprovedCount} disapproved/limited assets`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: 'ACCOUNT LEVEL',
        issue: 'Disapproved Assets',
        detail: `${disapprovedCount} asset(s) disapproved or limited`,
        severity: 'MEDIUM'
      });
    }
  } catch (e) {
    Logger.log(`    -> Error checking disapproved assets: ${e.message}`);
  }
}

// ============ CONVERSION TRACKING CHECK ============

function checkConversionTracking(accountName, customerId, issues) {
  Logger.log('  -> Checking conversion tracking...');
  
  const minSpend = CONFIG.CONVERSION_CHECK.MIN_SPEND_FOR_ALERT;
  const lookbackDays = CONFIG.CONVERSION_CHECK.LOOKBACK_DAYS;
  
  try {
    const query = `
      SELECT 
        campaign.name,
        campaign.advertising_channel_type,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE campaign.status = 'ENABLED'
        AND campaign.experiment_type != 'EXPERIMENT'
        AND segments.date DURING LAST_${lookbackDays}_DAYS
    `;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    // Aggregate per campaign
    const campaignData = {};
    while (rows.hasNext()) {
      const row = rows.next();
      const campaignName = row['campaign.name'];
      const channelType = row['campaign.advertising_channel_type'];
      const costMicros = parseFloat(row['metrics.cost_micros'] || 0);
      const conversions = parseFloat(row['metrics.conversions'] || 0);
      
      if (!campaignData[campaignName]) {
        campaignData[campaignName] = {
          channelType: channelType,
          totalCost: 0,
          totalConversions: 0
        };
      }
      
      campaignData[campaignName].totalCost += costMicros;
      campaignData[campaignName].totalConversions += conversions;
    }
    
    // Check each campaign
    for (const campaignName in campaignData) {
      const data = campaignData[campaignName];
      const cost = data.totalCost / 1000000;
      
      if (cost > minSpend && data.totalConversions === 0) {
        const campaignLabel = data.channelType === 'PERFORMANCE_MAX' ? 
          `${campaignName} [PMAX]` : campaignName;
        
        Logger.log(`    -> WARNING: ${campaignName} - ${cost.toFixed(0)} spend, 0 conversions`);
        issues.push({
          account: accountName,
          customerId: customerId,
          campaign: campaignLabel,
          issue: 'No Conversions',
          detail: `Spend ${cost.toFixed(0)} in ${lookbackDays} days with 0 conversions - check tracking`,
          severity: 'HIGH'
        });
      }
    }
  } catch (e) {
    Logger.log(`    -> Error checking conversion tracking: ${e.message}`);
  }
}

// ============ AD STRENGTH CHECK ============

function checkAdStrength(accountName, customerId, issues) {
  Logger.log('  -> Checking ad strength...');
  
  const alertOn = CONFIG.AD_STRENGTH_CHECK.ALERT_ON;
  
  try {
    const query = `
      SELECT 
        campaign.name,
        ad_group.name,
        ad_group_ad.ad_strength
      FROM ad_group_ad
      WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
        AND campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND ad_group_ad.status = 'ENABLED'
    `;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    const weakAds = [];
    while (rows.hasNext()) {
      const row = rows.next();
      const campaignName = row['campaign.name'];
      const adStrength = row['ad_group_ad.ad_strength'];
      
      if (CONFIG.AD_STRENGTH_CHECK.IGNORED_CAMPAIGNS.includes(campaignName)) continue;
      
      if (alertOn.includes(adStrength)) {
        weakAds.push({
          campaign: campaignName,
          adGroup: row['ad_group.name'],
          strength: adStrength
        });
      }
    }
    
    if (weakAds.length > 0) {
      Logger.log(`    -> Found ${weakAds.length} ads with weak strength`);
      
      const campaigns = [...new Set(weakAds.map(a => a.campaign))];
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaigns.join(', '),
        issue: 'Weak Ad Strength',
        detail: `${weakAds.length} RSA(s) with ${alertOn.join('/')} strength`,
        severity: 'INFO'
      });
    }
  } catch (e) {
    Logger.log(`    -> Error checking ad strength: ${e.message}`);
  }
}

// ============ QUALITY SCORE CHECK ============

function checkQualityScore(accountName, customerId, issues) {
  Logger.log('  -> Checking quality scores...');
  
  const minQS = CONFIG.QS_CHECK.MIN_QS_THRESHOLD;
  const minImpressions = CONFIG.QS_CHECK.MIN_IMPRESSIONS;
  
  try {
    const query = `
      SELECT 
        campaign.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.quality_info.quality_score,
        metrics.impressions
      FROM keyword_view
      WHERE ad_group_criterion.status = 'ENABLED'
        AND campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND segments.date DURING LAST_30_DAYS
    `;
    
    const report = AdsApp.report(query);
    const rows = report.rows();
    
    // Aggregate per keyword
    const keywordData = {};
    while (rows.hasNext()) {
      const row = rows.next();
      const kwText = row['ad_group_criterion.keyword.text'];
      const campaign = row['campaign.name'];
      const qs = row['ad_group_criterion.quality_info.quality_score'];
      const impressions = parseInt(row['metrics.impressions'] || 0);
      
      const key = `${campaign}|${kwText}`;
      if (!keywordData[key]) {
        keywordData[key] = {
          campaign: campaign,
          keyword: kwText,
          qs: qs ? parseInt(qs) : null,
          impressions: 0
        };
      }
      keywordData[key].impressions += impressions;
    }
    
    // Find low QS keywords
    let lowQSCount = 0;
    const affectedCampaigns = new Set();
    
    for (const key in keywordData) {
      const data = keywordData[key];
      if (data.qs !== null && data.qs < minQS && data.impressions >= minImpressions) {
        lowQSCount++;
        affectedCampaigns.add(data.campaign);
      }
    }
    
    if (lowQSCount > 0) {
      Logger.log(`    -> Found ${lowQSCount} keywords with QS < ${minQS}`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: Array.from(affectedCampaigns).join(', '),
        issue: 'Low Quality Score',
        detail: `${lowQSCount} keyword(s) with QS < ${minQS} in ${affectedCampaigns.size} campaign(s)`,
        severity: 'INFO'
      });
    }
  } catch (e) {
    Logger.log(`    -> Error checking quality scores: ${e.message}`);
  }
}

// ============ OUTPUT FUNCTIONS ============

function writeToSheet(issues, timestamp) {
  if (!CONFIG.SPREADSHEET_URL || CONFIG.SPREADSHEET_URL === 'YOUR_GOOGLE_SHEET_URL_HERE') {
    Logger.log('WARN: SPREADSHEET_URL not configured');
    return;
  }
  
  try {
    const sheet = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL).getActiveSheet();
    
    // Header if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Date', 'Time', 'Account', 'Customer ID', 'Campaign', 'Issue', 'Detail', 'Severity']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4a86e8').setFontColor('white');
      sheet.setFrozenRows(1);
    }
    
    const timezone = AdsApp.currentAccount().getTimeZone();
    
    if (issues.length === 0) {
      sheet.appendRow([
        Utilities.formatDate(timestamp, timezone, 'yyyy-MM-dd'),
        Utilities.formatDate(timestamp, timezone, 'HH:mm:ss'),
        'N/A',
        'N/A',
        'N/A',
        'No issues found',
        'All campaigns OK',
        'OK'
      ]);
      sheet.getRange(sheet.getLastRow(), 1, 1, 8).setBackground('#d9ead3');
    } else {
      issues.forEach(issue => {
        sheet.appendRow([
          Utilities.formatDate(timestamp, timezone, 'yyyy-MM-dd'),
          Utilities.formatDate(timestamp, timezone, 'HH:mm:ss'),
          issue.account,
          issue.customerId,
          issue.campaign,
          issue.issue,
          issue.detail,
          issue.severity
        ]);
        
        const row = sheet.getLastRow();
        if (issue.severity === 'CRITICAL') {
          sheet.getRange(row, 1, 1, 8).setBackground('#f4cccc');
        } else if (issue.severity === 'HIGH') {
          sheet.getRange(row, 1, 1, 8).setBackground('#fce5cd');
        } else if (issue.severity === 'MEDIUM') {
          sheet.getRange(row, 1, 1, 8).setBackground('#fff2cc');
        } else if (issue.severity === 'INFO') {
          sheet.getRange(row, 1, 1, 8).setBackground('#d9ead3');
        }
      });
    }
    
    sheet.autoResizeColumns(1, 8);
    
  } catch (e) {
    Logger.log(`ERROR writing to sheet: ${e.message}`);
  }
}

function sendAlert(issues, timestamp) {
  if (!CONFIG.EMAIL || CONFIG.EMAIL === 'your-email@example.com') {
    Logger.log('WARN: EMAIL not configured');
    return;
  }
  
  const timezone = AdsApp.currentAccount().getTimeZone();
  const dateStr = Utilities.formatDate(timestamp, timezone, 'yyyy-MM-dd HH:mm');
  
  // Group by severity
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');
  const info = issues.filter(i => i.severity === 'INFO');
  
  let body = `Google Ads Anomaly Detector - ${dateStr}\n`;
  body += `${'='.repeat(50)}\n\n`;
  body += `Total: ${issues.length} issue(s)\n`;
  body += `CRITICAL: ${critical.length}\n`;
  body += `HIGH: ${high.length}\n`;
  body += `MEDIUM: ${medium.length}\n`;
  body += `INFO: ${info.length}\n\n`;
  
  if (critical.length > 0) {
    body += `${'='.repeat(50)}\n`;
    body += `CRITICAL\n`;
    body += `${'='.repeat(50)}\n\n`;
    critical.forEach(issue => {
      body += formatIssue(issue);
    });
  }
  
  if (high.length > 0) {
    body += `${'='.repeat(50)}\n`;
    body += `HIGH\n`;
    body += `${'='.repeat(50)}\n\n`;
    high.forEach(issue => {
      body += formatIssue(issue);
    });
  }
  
  if (medium.length > 0) {
    body += `${'='.repeat(50)}\n`;
    body += `MEDIUM\n`;
    body += `${'='.repeat(50)}\n\n`;
    medium.forEach(issue => {
      body += formatIssue(issue);
    });
  }
  
  if (info.length > 0) {
    body += `${'='.repeat(50)}\n`;
    body += `INFO\n`;
    body += `${'='.repeat(50)}\n\n`;
    info.forEach(issue => {
      body += formatIssue(issue);
    });
  }
  
  if (CONFIG.SPREADSHEET_URL && CONFIG.SPREADSHEET_URL !== 'YOUR_GOOGLE_SHEET_URL_HERE') {
    body += `\nFull report: ${CONFIG.SPREADSHEET_URL}`;
  }
  
  // Subject based on highest severity
  let subjectPrefix = 'INFO';
  if (critical.length > 0) {
    subjectPrefix = 'CRITICAL';
  } else if (high.length > 0) {
    subjectPrefix = 'HIGH';
  } else if (medium.length > 0) {
    subjectPrefix = 'MEDIUM';
  }
  
  MailApp.sendEmail({
    to: CONFIG.EMAIL,
    subject: `[${subjectPrefix}] Google Ads Alert - ${issues.length} issue(s) - ${dateStr}`,
    body: body
  });
}

function formatIssue(issue) {
  let text = `> ${issue.account}\n`;
  text += `  Campaign: ${issue.campaign}\n`;
  text += `  Issue: ${issue.issue}\n`;
  text += `  Detail: ${issue.detail}\n\n`;
  return text;
}
