# Google Ads Campaign Monitoring Script

Automatizovaný monitorovací systém pro Google Ads kampaně s podporou více účtů, sledováním budgetu a emailovými alerty.

## Funkce

### Monitoring stavu kampaní
- ✅ **Detekce Zero Impressions** - Alert když kampaň nemá žádné zobrazení po dobu 7 dní
- ✅ **Detekce Zero Clicks** - Alert když kampaň má zobrazení, ale žádné kliky
- ✅ **Podpora Performance Max** - Plný monitoring PMax kampaní
- ✅ **Filtrování Experimentů** - Automaticky vyřazuje experimentální kampaně

### Monitoring Budgetu
- 💰 **Lost Impression Share** - Sleduje ztrátu impression share kvůli budgetu (>10%)
- 💰 **Detekce Statusu Kampaní** - Identifikuje kampaně omezené rozpočtem nebo bidding strategií
- 💰 **Měsíční Budget Tracking** - Monitoruje utrácení vs. očekávaný budget per účet
  - Alert při nízkém utrácení (<60%)
  - Varování při vysokém utrácení (>90%)
  - Kritický alert při přečerpání (>100%)

### Monitoring Výkonu
- 📊 **Sledování PNO** (Podíl Nákladů na Obratu)
  - Per-kampaň monitoring za 30 dní
  - Konfigurovatelné prahy per účet
  

## Úrovně Závažnosti

| Závažnost | Barva | Použití |
|----------|-------|---------|
| 🔴 **CRITICAL** | Červená | Zero impressions, přečerpání budgetu >100% |
| 🟠 **HIGH** | Oranžová | Zero clicks, omezení budgetem, budget >90%, PNO >150% max |
| 🟡 **MEDIUM** | Žlutá | Omezení bidding strategií, nízké utrácení <60%, PNO >100% max |
| 🟢 **INFO** | Zelená | Lost impression share kvůli budgetu |

## Požadavky

- Přístup k Google Ads Manager účtu (MCC)
- Autorizace Google Ads Scripts
- Google Sheet pro logování
- Emailová adresa pro alerty

## Instalace

1. **Vytvoř Google Sheet**
   - Vytvoř nový Google Sheet pro logování
   - Zkopíruj URL

2. **Vytvoř Google Ads Script**
   - Jdi do Google Ads → Nástroje → Skripty
   - Klikni "+" pro vytvoření nového scriptu
   - Vlož kód scriptu
   - Pojmenuj ho (např. "Campaign Monitor")

3. **Nakonfiguruj Script**
   - Uprav CONFIG sekci (viz Konfigurace níže)

4. **Autorizuj**
   - Klikni "Náhled" pro autorizaci scriptu
   - Uděl potřebná oprávnění

5. **Nastav Trigger**
   - Jdi do Skripty → vyber svůj script
   - Klikni "Spravovat" → "Spouštěče"
   - Vytvoř denní trigger (doporučeno: 9-10 ráno)

## Konfigurace

### 1. Základní Nastavení
```javascript
const SPREADSHEET_URL = 'TVOJE_GOOGLE_SHEET_URL';
const EMAIL = 'tvuj-email@example.com';

const MONITORED_ACCOUNTS = [
  '123-456-7890', // Účet 1
  '234-567-8901', // Účet 2
  '345-678-9012'  // Účet 3
];
```

### 2. Monitoring Budgetu (Volitelné)
```javascript
const MONTHLY_BUDGETS = {
  '123-456-7890': 10000, // Účet 1 - 10 000 Kč/měsíc
  '234-567-8901': 8000   // Účet 2 - 8 000 Kč/měsíc
  // Účty, které tu nejsou, nebudou monitorovány
};

const BUDGET_THRESHOLDS = {
  UNDERSPEND_WARNING: 60,  // Alert pokud utrácení <60%
  OVERSPEND_WARNING: 90,   // Alert pokud utrácení >90%
  OVERSPEND_CRITICAL: 100  // Kritický pokud utrácení >100%
};
```

### 3. Monitoring PNO (Volitelné)
```javascript
const MAX_PNO = {
  '123-456-7890': 0.25,  // Účet 1 - max 25% PNO (ROAS 4)
  '234-567-8901': 0.30   // Účet 2 - max 30% PNO (ROAS 3.33)
  // Účty, které tu nejsou, nebudou monitorovány
};
```

**Výpočet PNO:**
```
PNO = Náklady / Obrat
ROAS = Obrat / Náklady = 1 / PNO

Příklad: PNO 25% = ROAS 400
```

## Výstupy

### Google Sheet
- Automatické logování s barevným kódováním podle závažnosti
- Sloupce: Date, Time, Account, Customer ID, Campaign, Issue, Detail, Severity
- Denní "All OK" záznamy když nejsou žádné problémy

### Emailové Alerty
- Posílají se pouze když jsou detekovány problémy
- Přehled všech problémů s úrovněmi závažnosti
- Link na kompletní report v Google Sheet

## Monitorovací Období

| Kontrola | Období | Poznámky |
|----------|--------|----------|
| Zero Impressions/Clicks | 7 dní | Per kampaň |
| Lost Impression Share | 7 dní | Per kampaň, práh >10% |
| Status Kampaně | 7 dní | Aktuální status check |
| Utrácení Budgetu | 30 dní | Celkem za účet vs. očekávané |
| PNO | 30 dní | Per kampaň s konverzemi |

## Řešení Problémů

### Script Timeout
Pokud monitoruješ mnoho účtů/kampaní:
- Rozděl do více scriptů podle skupin účtů
- Zkrať monitorovací období (např. 3 dny místo 7)

### Chybějící Data
- **Budget data**: Ujisti se, že kampaně jsou aktivní v daném období
- **PNO data**: Vyžaduje nastavené sledování konverzí
- **Status data**: Zkontroluj API oprávnění

### Email Nepřišel
- Zkontroluj spam složku
- Ověř emailovou adresu v configu
- Potvrď že script běžel úspěšně (zkontroluj execution log)

## Přizpůsobení

### Přidání Vlastních Kontrol
Přidej nové monitorovací funkce podle tohoto vzoru:
```javascript
function checkCustomMetric(accountName, customerId, issues) {
  Logger.log('  -> Checking custom metric...');
  
  // Tvůj GAQL query
  const query = `SELECT ... FROM campaign WHERE ...`;
  const report = AdsApp.report(query);
  
  // Zpracuj výsledky a přidej do issues pole
  issues.push({
    account: accountName,
    customerId: customerId,
    campaign: 'Název Kampaně',
    issue: 'Typ Problému',
    detail: 'Detailní popis',
    severity: 'MEDIUM'
  });
}

// Přidej do main():
checkCustomMetric(accountName, customerId, issues);
```

### Úprava Prahů
Uprav prahy závažnosti v CONFIG sekci podle svých potřeb.

## Best Practices

1. **Testuj Nejdřív** - Spusť manuálně a ověř výsledky před nastavením denního triggeru
2. **Začni Jednoduše** - Zapni základní monitoring nejdřív, budget/PNO monitoring přidej později
3. **Pravidelně Kontroluj** - Zkontroluj Google Sheet týdně, jestli monitoring funguje
4. **Uprav Prahy** - Dolaď podle specifických potřeb svých kampaní
5. **Dokumentuj Změny** - Veď si přehled o změnách konfigurace pro své účty

## API Reference

Script používá:
- Google Ads Scripts API
- Google Apps Script (Sheets, Mail)
- GAQL (Google Ads Query Language)

## Přispívání

Neváhej poslat issues nebo pull requesty pro vylepšení.

## Licence

MIT License - klidně používej a upravuj pro své potřeby.

## Podpora

Pro dotazy nebo problémy:
1. Zkontroluj sekci Řešení Problémů
2. Projdi Google Ads Scripts dokumentaci
3. Otevři issue na GitHubu

---

**Poznámka:** Tento script monitoruje kampaně napříč více účty. Ujisti se, že máš odpovídající přístupová práva ke všem monitorovaným účtům.
