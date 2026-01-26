import { test, expect, Page, FrameLocator } from '@playwright/test';
import scenariosData from '../test-data/card-scenarios.json';

// Configuration for capture-test.html iframe
const CONFIG = {
  PCI_HOST: 'https://service.pcibooking.net',
  IFRAME_SELECTOR: '#iframePayment',
  DEFAULT_IFRAME_HEIGHT: 300,
  THREEDS_IFRAME_HEIGHT: 600,
  SCREENSHOTS_DIR: './screenshots',
};

interface CardScenario {
  id: string;
  name: string;
  brand: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  cardholderName: string;
  expectedResult: string;
  threeDS: boolean;
  flow?: string;
  otp?: string;
  description: string;
}

const scenarios: CardScenario[] = scenariosData.scenarios;

// Debug mode - set to true to enable page.pause()
const DEBUG_MODE = process.env.DEBUG === 'true';

/**
 * Wait for iframe to be ready
 */
async function waitForIframeReady(page: Page, timeout = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      const iframe = document.querySelector('#iframePayment') as HTMLIFrameElement;
      return iframe && iframe.src && !iframe.src.includes('about:blank');
    },
    { timeout }
  );
  await page.waitForTimeout(2000);
}

/**
 * Get the PCI Booking iframe frame locator
 */
function getIframe(page: Page): FrameLocator {
  return page.frameLocator(CONFIG.IFRAME_SELECTOR);
}

/**
 * Fill card data into the PCI Booking iframe
 */
async function fillCardData(
  page: Page,
  scenario: CardScenario
): Promise<void> {
  const iframe = getIframe(page);

  // Parse expiry (format: MM/YY)
  const [expiryMonth, expiryYear] = scenario.expiry.split('/');
  const fullYear = `20${expiryYear}`;

  console.log(`Filling card data for scenario: ${scenario.name}`);
  console.log(`  Card: ${scenario.cardNumber}`);
  console.log(`  Expiry: ${expiryMonth}/${fullYear}`);
  console.log(`  CVV: ${scenario.cvv}`);
  console.log(`  Name: ${scenario.cardholderName}`);
  console.log(`  3DS: ${scenario.threeDS ? 'Yes' : 'No'}${scenario.flow ? ' (' + scenario.flow + ')' : ''}`);
  if (scenario.otp) {
    console.log(`  OTP: ${scenario.otp}`);
  }

  // Fill card number - find visible input
  const cardNumberField = iframe.locator('input:visible').first();
  await cardNumberField.waitFor({ state: 'visible', timeout: 10000 });
  await cardNumberField.click();
  await cardNumberField.fill(scenario.cardNumber);
  console.log('  Filled card number');

  // Find all selects for month and year
  const selects = iframe.locator('select');
  const selectCount = await selects.count();

  if (selectCount >= 2) {
    // Fill expiry month
    const monthSelect = selects.nth(0);
    await monthSelect.waitFor({ state: 'visible', timeout: 5000 });

    const monthValues = await monthSelect.locator('option').evaluateAll(opts =>
      opts.map((o: HTMLOptionElement) => o.value)
    );

    const monthNum = parseInt(expiryMonth, 10);
    const paddedMonth = expiryMonth.padStart(2, '0');
    let monthToSelect = paddedMonth;

    if (monthValues.includes(paddedMonth)) {
      monthToSelect = paddedMonth;
    } else if (monthValues.includes(String(monthNum))) {
      monthToSelect = String(monthNum);
    }

    await monthSelect.selectOption(monthToSelect);
    console.log(`  Filled expiry month: ${monthToSelect}`);

    // Fill expiry year
    const yearSelect = selects.nth(1);
    await yearSelect.waitFor({ state: 'visible', timeout: 5000 });

    const yearOptions = await yearSelect.locator('option').allTextContents();

    let yearToSelect = fullYear;
    if (!yearOptions.some(y => y.includes(fullYear) || y.includes(expiryYear))) {
      const validYears = yearOptions.filter(y => /20\d{2}/.test(y));
      if (validYears.length > 0) {
        yearToSelect = validYears[0].match(/20\d{2}/)?.[0] || fullYear;
        console.log(`  Year ${fullYear} not available, using ${yearToSelect}`);
      }
    }

    try {
      await yearSelect.selectOption(yearToSelect);
      console.log(`  Filled expiry year: ${yearToSelect}`);
    } catch {
      const validYears = yearOptions.filter(y => /20\d{2}/.test(y));
      if (validYears.length > 0) {
        const fallbackYear = validYears[0].match(/20\d{2}/)?.[0] || '2027';
        await yearSelect.selectOption(fallbackYear);
        console.log(`  Year fallback: ${fallbackYear}`);
      }
    }
  }

  // Fill CVV and Name
  const visibleInputs = iframe.locator('input:visible');
  const visibleInputCount = await visibleInputs.count();

  if (visibleInputCount >= 2) {
    const cvvField = visibleInputs.nth(1);
    await cvvField.waitFor({ state: 'visible', timeout: 5000 });
    await cvvField.click();
    await cvvField.fill(scenario.cvv);
    console.log('  Filled CVV');
  }

  if (visibleInputCount >= 3) {
    const nameField = visibleInputs.nth(2);
    await nameField.waitFor({ state: 'visible', timeout: 5000 });
    await nameField.click();
    await nameField.fill(scenario.cardholderName);
    console.log('  Filled cardholder name');
  }

  console.log(`Card data filled successfully for: ${scenario.name}`);
}

/**
 * Take a screenshot
 */
async function takeScreenshot(page: Page, name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${CONFIG.SCREENSHOTS_DIR}/${name}_${timestamp}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`Screenshot saved: ${filename}`);
}

// Test suite for all card scenarios
test.describe('PCI Booking Card Fill Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to capture-test.html (at root level in GitHub repo)
    await page.goto('/capture-test.html');

    // Click "Generate Token" to get a session token
    await page.click('button:has-text("Generate Token")');
    await page.waitForTimeout(2000);

    // Click "Load Iframe" to load the PCI Booking iframe
    await page.click('button:has-text("Load Iframe")');

    // Wait for iframe to be loaded and ready
    await waitForIframeReady(page);
  });

  // Generate tests for each scenario
  for (const scenario of scenarios) {
    test(`Fill card data - ${scenario.id}: ${scenario.description}`, async ({ page }) => {
      console.log(`\n=== Testing scenario: ${scenario.id} ===`);
      console.log(`Name: ${scenario.name}`);
      console.log(`Expected result: ${scenario.expectedResult}`);
      console.log(`3DS: ${scenario.threeDS ? 'Yes' : 'No'}${scenario.flow ? ' (' + scenario.flow + ')' : ''}`);
      if (scenario.otp) {
        console.log(`OTP for 3DS Challenge: ${scenario.otp}`);
      }

      if (DEBUG_MODE) {
        await page.pause();
      }

      // Fill the card data
      await fillCardData(page, scenario);

      // Take screenshot after filling
      await takeScreenshot(page, `filled_${scenario.id}`);

      // Verify the card number field contains data
      const iframe = getIframe(page);
      const cardNumberField = iframe.locator('input:visible').first();
      const cardValue = await cardNumberField.inputValue();

      expect(cardValue.length).toBeGreaterThan(0);

      console.log(`=== Scenario ${scenario.id} completed ===\n`);

      if (DEBUG_MODE) {
        await page.pause();
      }
    });
  }
});

// Standalone test for manual debugging
test('Debug: Manual card fill inspection', async ({ page }) => {
  test.skip(!DEBUG_MODE, 'Debug mode not enabled');

  await page.goto('/capture-test.html');

  await page.click('button:has-text("Generate Token")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Load Iframe")');
  await waitForIframeReady(page);

  const scenario = scenarios[0];
  await fillCardData(page, scenario);

  await page.pause();
});
