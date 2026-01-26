import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Interactive Card Fill Test for GitHub Pages
 *
 * Opens capture-test.html, lets you select a scenario,
 * then automatically fills the iframe form with Playwright.
 *
 * Run with: npm run test:interactive
 */

const CONFIG = {
  CAPTURE_URL: '/capture-test.html',
  IFRAME_SELECTOR: '#iframePayment',
};

test('Interactive: Select scenario and auto-fill @Interactive', async ({ page }) => {
  // Increase timeout for interactive use
  test.setTimeout(300000); // 5 minutes

  console.log('\n========================================');
  console.log('INTERACTIVE MODE - GitHub Pages');
  console.log('========================================');
  console.log('1. Select a test scenario from the list');
  console.log('2. Generate a token and load iframe');
  console.log('3. Playwright will auto-fill the card form');
  console.log('========================================\n');

  // Go to capture-test.html
  await page.goto(CONFIG.CAPTURE_URL);
  console.log('Opened capture-test.html. Select a scenario...\n');

  // Wait for user to select scenario and load iframe
  // The iframe loads when user clicks "Load Iframe" button
  await page.waitForFunction(
    () => {
      const iframe = document.querySelector('#iframePayment') as HTMLIFrameElement;
      return iframe && iframe.src && !iframe.src.includes('about:blank');
    },
    { timeout: 120000 }
  );
  console.log('Detected iframe loaded');

  await page.waitForTimeout(2000); // Extra time for iframe content

  // Get selected scenario from the page's state
  const scenario = await page.evaluate(() => {
    // Access the page's state object
    const stateObj = (window as any).state;
    return stateObj?.selectedScenario || null;
  });

  if (!scenario) {
    console.log('No scenario selected - using manual entry mode');
    console.log('Fill the form manually or pause here...');
    await page.pause();
    return;
  }

  console.log(`\nFilling card data for: ${scenario.name || scenario.id}`);
  console.log(`  Card: ${scenario.card}`);
  console.log(`  3DS: ${scenario.threeDS ? 'Yes' : 'No'}${scenario.flow ? ' (' + scenario.flow + ')' : ''}`);
  if (scenario.otp) {
    console.log(`  OTP for 3DS Challenge: ${scenario.otp}`);
  }

  // Get future expiry
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear() + 2).slice(-2);
  const expiry = scenario.expiry || `${month}/${year}`;
  const [expiryMonth, expiryYear] = expiry.split('/');
  const fullYear = `20${expiryYear}`;

  // Get iframe
  const iframe = page.frameLocator(CONFIG.IFRAME_SELECTOR);

  // Fill card number
  const cardInput = iframe.locator('input:visible').first();
  await cardInput.waitFor({ state: 'visible', timeout: 10000 });
  await cardInput.click();
  await cardInput.fill(scenario.card);
  console.log('  ✓ Card number filled');

  // Fill month and year selects
  const selects = iframe.locator('select');
  const selectCount = await selects.count();

  if (selectCount >= 2) {
    const monthSelect = selects.nth(0);
    const monthValues = await monthSelect.locator('option').evaluateAll(opts =>
      opts.map((o: HTMLOptionElement) => o.value)
    );

    const monthNum = parseInt(expiryMonth, 10);
    let monthToSelect = expiryMonth;
    if (monthValues.includes(String(monthNum))) {
      monthToSelect = String(monthNum);
    }

    await monthSelect.selectOption(monthToSelect);
    console.log(`  ✓ Month filled: ${monthToSelect}`);

    const yearSelect = selects.nth(1);
    const yearOptions = await yearSelect.locator('option').allTextContents();

    let yearToSelect = fullYear;
    if (!yearOptions.some(y => y.includes(fullYear))) {
      const validYears = yearOptions.filter(y => /20\d{2}/.test(y));
      if (validYears.length > 0) {
        yearToSelect = validYears[0].match(/20\d{2}/)?.[0] || fullYear;
        console.log(`  ! Year ${fullYear} unavailable, using ${yearToSelect}`);
      }
    }

    try {
      await yearSelect.selectOption(yearToSelect);
      console.log(`  ✓ Year filled: ${yearToSelect}`);
    } catch {
      const fallbackYear = yearOptions.find(y => /20\d{2}/.test(y))?.match(/20\d{2}/)?.[0] || '2027';
      await yearSelect.selectOption(fallbackYear);
      console.log(`  ✓ Year filled (fallback): ${fallbackYear}`);
    }
  }

  // Fill CVV and Name
  const visibleInputs = iframe.locator('input:visible');
  const inputCount = await visibleInputs.count();

  if (inputCount >= 2) {
    const cvvField = visibleInputs.nth(1);
    await cvvField.click();
    await cvvField.fill('123');
    console.log('  ✓ CVV filled');
  }

  if (inputCount >= 3) {
    const nameField = visibleInputs.nth(2);
    await nameField.click();
    await nameField.fill('Three DS test');
    console.log('  ✓ Name filled');
  }

  console.log('\n========================================');
  console.log('FORM FILLED - Ready for submission');
  console.log('========================================\n');

  // Generate report
  const reportEntry = {
    date: new Date().toISOString(),
    scenario: scenario.id,
    cardNumber: scenario.card.replace(/(\d{4})\d{8}(\d{4})/, '$1****$2'),
    expectedResult: scenario.type,
    threeDS: scenario.threeDS,
    flow: scenario.flow || 'none',
    otp: scenario.otp || 'n/a'
  };

  // Write report to file
  const reportDir = path.join(process.cwd(), 'test-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportFile = path.join(reportDir, 'interactive-tests.json');
  let reports: any[] = [];

  if (fs.existsSync(reportFile)) {
    try {
      reports = JSON.parse(fs.readFileSync(reportFile, 'utf-8'));
    } catch {
      reports = [];
    }
  }

  reports.push(reportEntry);
  fs.writeFileSync(reportFile, JSON.stringify(reports, null, 2));

  console.log('Report saved to: test-reports/interactive-tests.json');
  console.log('\nPausing for manual inspection...');

  // Keep browser open for inspection
  await page.pause();
});
