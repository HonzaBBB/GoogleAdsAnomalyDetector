# Google Ads Anomaly Detector

MCC-level Google Ads Script that monitors multiple accounts for common issues and sends alerts.

## Features

- **Zero Impressions/Clicks Detection** - Campaigns not serving
- **Budget Lost Impression Share** - Campaigns losing traffic due to budget
- **Campaign Status Issues** - Budget/bidding constrained campaigns
- **Budget Spend Monitoring with Trend Tracking** - Projected over/underspend with trend analysis
- **PNO Monitoring** - Cost-to-revenue ratio alerts
- **Policy Checks** - Disapproved ads, keywords, and assets
- **Conversion Tracking Issues** - High spend with zero conversions
- **RSA Ad Strength** - Alerts for POOR ad strength
- **Quality Score** - Low QS keyword detection (optional)

## Setup

### 1. Create Google Sheet

Create a new Google Sheet for logging. The script will automatically create headers on first run.

### 2. Configure the Script

Update the `CONFIG` section:

```javascript
const CONFIG = {
  // Your Google Sheet URL
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit',
  
  // Your email for alerts
  EMAIL: 'your-email@example.com',
  
  // Account IDs to monitor (without dashes)
  MONITORED_ACCOUNTS: [
    '1234567890',
    '2345678901',
  ],
  
  // Monthly budgets (optional)
  MONTHLY_BUDGETS: {
    '1234567890': 10000,
    '2345678901': 5000,
  },
  
  // Max PNO per account (optional)
  MAX_PNO: {
    '1234567890': 0.25,  // 25% = ROAS 400%
  },
  
  // ... other settings
};
```

### 3. Deploy to MCC

1. Go to your MCC account → Tools & Settings → Bulk Actions → Scripts
2. Create new script
3. Paste the code
4. Authorize the script
5. Schedule to run daily

## Configuration Options

### Budget Thresholds

```javascript
BUDGET_THRESHOLDS: {
  UNDERSPEND_WARNING: 60,   // Alert if projected < 60%
  OVERSPEND_WARNING: 90,    // Alert if projected > 90%
  OVERSPEND_CRITICAL: 100   // Critical if projected > 100%
}
```

### Trend Tracking

```javascript
TREND_TRACKING: {
  ENABLED: true,
  REDUCE_SEVERITY_ON_POSITIVE_TREND: true,  // Lower severity if trend is improving
  SIGNIFICANT_TREND_PCT: 10                  // Threshold for "significant" trend
}
```

### Policy Checks

```javascript
POLICY_CHECKS: {
  ENABLED: true,
  IGNORED_ACCOUNTS: ['1234567890'],     // Skip specific accounts
  IGNORED_CAMPAIGNS: ['Test Campaign'],  // Skip specific campaigns
  IGNORED_ISSUE_TYPES: ['DISAPPROVED_AD'] // Skip specific issue types
}
```

### Optional Checks

```javascript
// Conversion tracking (alerts when high spend + 0 conversions)
CONVERSION_CHECK: {
  ENABLED: true,
  MIN_SPEND_FOR_ALERT: 1000,
  LOOKBACK_DAYS: 14
}

// Ad strength check
AD_STRENGTH_CHECK: {
  ENABLED: true,
  ALERT_ON: ['POOR'],
  IGNORED_CAMPAIGNS: []
}

// Quality Score (off by default - can be noisy)
QS_CHECK: {
  ENABLED: false,
  MIN_QS_THRESHOLD: 5,
  MIN_IMPRESSIONS: 100
}
```

## Severity Levels

| Level | Description | Color |
|-------|-------------|-------|
| CRITICAL | Campaign not serving, severe overspend | Red |
| HIGH | Budget constrained, high overspend, no conversions | Orange |
| MEDIUM | Underspend, bidding constrained, PNO warning | Yellow |
| INFO | Lost IS, weak ad strength, low QS | Green |

## Output

### Google Sheet

The script logs all issues to the configured Google Sheet with:
- Date/Time
- Account Name
- Customer ID
- Campaign
- Issue Type
- Detail
- Severity

Rows are color-coded by severity.

### Email Alerts

When issues are found, an email is sent with:
- Summary counts by severity
- Issues grouped by severity (CRITICAL → INFO)
- Link to full report in Google Sheet

## Customization

### Adding New Accounts

Add the Customer ID (without dashes) to `MONITORED_ACCOUNTS`:

```javascript
MONITORED_ACCOUNTS: [
  '1234567890',
  '9876543210',  // New account
],
```

### Adding Budget Monitoring

Add the monthly budget to `MONTHLY_BUDGETS`:

```javascript
MONTHLY_BUDGETS: {
  '1234567890': 10000,
  '9876543210': 15000,  // New account budget
},
```

### Adding PNO Monitoring

Add the max PNO to `MAX_PNO`:

```javascript
MAX_PNO: {
  '1234567890': 0.25,  // 25% PNO = 400% ROAS
  '9876543210': 0.20,  // 20% PNO = 500% ROAS
},
```

## Troubleshooting

### Script Not Running

- Check MCC account permissions
- Verify account IDs are correct (no dashes)
- Check script authorization

### No Email Alerts

- Verify EMAIL is configured correctly
- Check MailApp quota limits
- Look for errors in script logs

### Sheet Not Updating

- Verify SPREADSHEET_URL is correct
- Check sheet sharing permissions
- Ensure script has edit access

## License

MIT License - feel free to modify and use as needed.

## Contributing

Pull requests welcome! Please test changes thoroughly before submitting.
