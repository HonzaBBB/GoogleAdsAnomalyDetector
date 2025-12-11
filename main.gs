// === CONFIG ===
const SPREADSHEET_URL = 'YOUR_GOOGLE_SHEET_URL_HERE';
const EMAIL = 'your-email@example.com';

const MONITORED_ACCOUNTS = [
  '123-456-7890', // Account 1
  '234-567-8901', // Account 2
  '345-678-9012', // Account 3
  '456-789-0123', // Account 4
  '567-890-1234', // Account 5
  '678-901-2345'  // Account 6
];

// Měsíční budgety v CZK (pokud účet není v seznamu, budget se nemonitoruje)
const MONTHLY_BUDGETS = {
  '123-456-7890': 10000, // Account 1
  '234-567-8901': 8000,  // Account 2
  '345-678-9012': 30000  // Account 3
  // Ostatní účty nemají budget monitoring
};

// Prahy pro všechny účty stejné
const BUDGET_THRESHOLDS = {
  UNDERSPEND_WARNING: 60,  // <60%
  OVERSPEND_WARNING: 90,   // >90%
  OVERSPEND_CRITICAL: 100  // >100%
};

// Max PNO v % (pokud účet není v seznamu, PNO se nemonitoruje)
const MAX_PNO = {
  '123-456-7890': 0.25,  // Account 1 - max 25% PNO (ROAS 4)
  '234-567-8901': 0.30,  // Account 2 - max 30% PNO (ROAS 3.33)
  '345-678-9012': 0.20   // Account 3 - max 20% PNO (ROAS 5)
  // Ostatní účty nemají PNO monitoring
};

function main() {
  Logger.log('=== START ===');
  
  const issues = [];
  const timestamp = new Date();
  
  const accountIterator = AdsManagerApp.accounts().get();
  
  let accountCount = 0;
  let campaignCount = 0;
  
  while (accountIterator.hasNext()) {
    const account = accountIterator.next();
    const customerId = account.getCustomerId();
    
    if (!MONITORED_ACCOUNTS.includes(customerId)) {
      continue;
    }
    
    accountCount++;
    AdsManagerApp.select(account);
    const accountName = account.getName();
    Logger.log(`\nUcet: ${accountName}`);
    
    // === SEARCH & DISPLAY KAMPANE ===
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
      
      // Zero impressions za 7 dní
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
      
      // Zero clicks za 7 dní (ale impressions > 0)
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
    
    // === PMAX KAMPANE ===
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
      
      // Zero impressions za 7 dní
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
      
      // Zero clicks za 7 dní (ale impressions > 0)
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
    
    // === GAQL CHECKS ===
    checkBudgetLimitation(accountName, customerId, issues);
    checkCampaignStatus(accountName, customerId, issues);
    checkBudgetSpend(accountName, customerId, issues);
    checkPNO(accountName, customerId, issues);
  }
  
  Logger.log(`\n=== SUMMARY ===`);
  Logger.log(`Ucty: ${accountCount}`);
  Logger.log(`Kampane: ${campaignCount}`);
  Logger.log(`Problemy: ${issues.length}`);
  
  Logger.log('\nZapisuji do sheetu...');
  writeToSheet(issues, timestamp);
  Logger.log('Sheet OK');
  
  if (issues.length > 0) {
    Logger.log('Posilam email...');
    sendAlert(issues, timestamp);
    Logger.log('Email odeslan');
  }
  
  Logger.log('=== HOTOVO ===');
}

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
    
    // Kontrola "Omezeno rozpočtem"
    if (statusReasons && statusReasons.includes('BUDGET_CONSTRAINED')) {
      Logger.log(`    -> PROBLEM: Campaign status = LIMITED BY BUDGET (${campaignName})`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'Campaign Status: Limited by Budget',
        detail: `Primary status: ${primaryStatus}`,
        severity: 'HIGH'
      });
    }
    
    // Kontrola "Omezeno cílem" (bidding strategy limitation)
    if (statusReasons && statusReasons.includes('BIDDING_STRATEGY_CONSTRAINED')) {
      Logger.log(`    -> INFO: Campaign limited by bidding strategy (${campaignName})`);
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

function checkBudgetSpend(accountName, customerId, issues) {
  // Pokud účet nemá nastavený měsíční budget, přeskoč monitoring
  if (!MONTHLY_BUDGETS[customerId]) {
    Logger.log('  -> Budget monitoring disabled for this account');
    return;
  }
  
  Logger.log('  -> Checking budget spend (30 days)...');
  
  const expectedMonthlyBudget = MONTHLY_BUDGETS[customerId];
  
  const query = `
    SELECT 
      metrics.cost_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND campaign.experiment_type != 'EXPERIMENT'
      AND segments.date DURING LAST_30_DAYS
  `;
  
  const report = AdsApp.report(query);
  const rows = report.rows();
  
  let totalSpendMicros = 0;
  
  while (rows.hasNext()) {
    const row = rows.next();
    totalSpendMicros += parseFloat(row['metrics.cost_micros'] || 0);
  }
  
  const actualSpend = totalSpendMicros / 1000000; // Convert to CZK
  const spendPercent = (actualSpend / expectedMonthlyBudget) * 100;
  
  Logger.log(`    Account spend: ${actualSpend.toFixed(0)} Kč / ${expectedMonthlyBudget} Kč (${spendPercent.toFixed(1)}%)`);
  
  // Underspending
  if (spendPercent < BUDGET_THRESHOLDS.UNDERSPEND_WARNING) {
    Logger.log(`    -> WARNING: Underspending (${spendPercent.toFixed(1)}%)`);
    issues.push({
      account: accountName,
      customerId: customerId,
      campaign: 'ACCOUNT TOTAL',
      issue: 'Budget Underspend',
      detail: `Spending ${spendPercent.toFixed(1)}% of monthly budget (${actualSpend.toFixed(0)} Kč / ${expectedMonthlyBudget} Kč expected)`,
      severity: 'MEDIUM'
    });
  }
  
  // Overspending - CRITICAL
  else if (spendPercent > BUDGET_THRESHOLDS.OVERSPEND_CRITICAL) {
    Logger.log(`    -> CRITICAL: Overspending (${spendPercent.toFixed(1)}%)`);
    issues.push({
      account: accountName,
      customerId: customerId,
      campaign: 'ACCOUNT TOTAL',
      issue: 'Budget Overspend (CRITICAL)',
      detail: `Spending ${spendPercent.toFixed(1)}% of monthly budget (${actualSpend.toFixed(0)} Kč / ${expectedMonthlyBudget} Kč expected)`,
      severity: 'CRITICAL'
    });
  }
  
  // Overspending - WARNING
  else if (spendPercent > BUDGET_THRESHOLDS.OVERSPEND_WARNING) {
    Logger.log(`    -> WARNING: High spending (${spendPercent.toFixed(1)}%)`);
    issues.push({
      account: accountName,
      customerId: customerId,
      campaign: 'ACCOUNT TOTAL',
      issue: 'Budget Overspend Warning',
      detail: `Spending ${spendPercent.toFixed(1)}% of monthly budget (${actualSpend.toFixed(0)} Kč / ${expectedMonthlyBudget} Kč expected)`,
      severity: 'HIGH'
    });
  }
}

function checkPNO(accountName, customerId, issues) {
  // Pokud účet nemá nastavený max PNO, přeskoč monitoring
  if (!MAX_PNO[customerId]) {
    Logger.log('  -> PNO monitoring disabled for this account');
    return;
  }
  
  Logger.log('  -> Checking PNO (30 days)...');
  
  const maxPNO = MAX_PNO[customerId];
  
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
  
  // Agregace per campaign
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
  
  // Analýza per campaign
  for (const campaignName in campaignData) {
    const data = campaignData[campaignName];
    const cost = data.totalCost / 1000000; // Convert to CZK
    const revenue = data.totalRevenue;
    const pno = cost / revenue;
    const roas = revenue / cost;
    
    const campaignLabel = data.channelType === 'PERFORMANCE_MAX' ? 
      `${campaignName} [PMAX]` : campaignName;
    
    Logger.log(`    ${campaignName}: PNO = ${(pno * 100).toFixed(1)}% (ROAS ${roas.toFixed(2)})`);
    
    // PNO vysoké (>150% max)
    if (pno > maxPNO * 1.5) {
      Logger.log(`    -> CRITICAL: Very high PNO (${(pno * 100).toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'PNO Critical',
        detail: `PNO ${(pno * 100).toFixed(1)}% (max ${(maxPNO * 100).toFixed(0)}%) - ROAS ${roas.toFixed(2)}`,
        severity: 'HIGH'
      });
    }
    
    // PNO nad limitem (>100% max)
    else if (pno > maxPNO) {
      Logger.log(`    -> WARNING: High PNO (${(pno * 100).toFixed(1)}%)`);
      issues.push({
        account: accountName,
        customerId: customerId,
        campaign: campaignLabel,
        issue: 'PNO Warning',
        detail: `PNO ${(pno * 100).toFixed(1)}% (max ${(maxPNO * 100).toFixed(0)}%) - ROAS ${roas.toFixed(2)}`,
        severity: 'MEDIUM'
      });
    }
  }
}

function writeToSheet(issues, timestamp) {
  const sheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL).getActiveSheet();
  
  // Header pokud je prázdný
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date', 'Time', 'Account', 'Customer ID', 'Campaign', 'Issue', 'Detail', 'Severity']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4a86e8').setFontColor('white');
  }
  
  if (issues.length === 0) {
    sheet.appendRow([
      Utilities.formatDate(timestamp, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd'),
      Utilities.formatDate(timestamp, AdsApp.currentAccount().getTimeZone(), 'HH:mm:ss'),
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
        Utilities.formatDate(timestamp, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd'),
        Utilities.formatDate(timestamp, AdsApp.currentAccount().getTimeZone(), 'HH:mm:ss'),
        issue.account,
        issue.customerId,
        issue.campaign,
        issue.issue,
        issue.detail,
        issue.severity
      ]);
      
      const row = sheet.getLastRow();
      if (issue.severity === 'CRITICAL') {
        sheet.getRange(row, 1, 1, 8).setBackground('#f4cccc'); // Červená
      } else if (issue.severity === 'HIGH') {
        sheet.getRange(row, 1, 1, 8).setBackground('#fce5cd'); // Oranžová
      } else if (issue.severity === 'MEDIUM') {
        sheet.getRange(row, 1, 1, 8).setBackground('#fff2cc'); // Žlutá
      } else if (issue.severity === 'INFO') {
        sheet.getRange(row, 1, 1, 8).setBackground('#d9ead3'); // Světle zelená
      }
    });
  }
  
  sheet.autoResizeColumns(1, 8);
}

function sendAlert(issues, timestamp) {
  const dateStr = Utilities.formatDate(timestamp, AdsApp.currentAccount().getTimeZone(), 'yyyy-MM-dd HH:mm');
  
  let body = `Google Ads Alert - ${dateStr}\n\n`;
  body += `Nalezeno ${issues.length} problém(ů):\n\n`;
  body += '═══════════════════════════════════════\n\n';
  
  issues.forEach(issue => {
    body += `${issue.account}\n`;
    body += `   Kampaň: ${issue.campaign}\n`;
    body += `   Problém: ${issue.issue}\n`;
    body += `   Detail: ${issue.detail}\n`;
    body += `   Severity: ${issue.severity}\n\n`;
  });
  
  body += `\nFull report: ${SPREADSHEET_URL}`;
  
  MailApp.sendEmail({
    to: EMAIL,
    subject: `[Google Ads] ${issues.length} problém(ů) - ${dateStr}`,
    body: body
  });
}
