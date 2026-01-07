#!/usr/bin/env node
/**
 * PCI Booking Automated Test Runner
 *
 * Runs automated tests against the PCI Booking card capture iframe
 * using Puppeteer for browser automation.
 *
 * Usage:
 *   npm test                    - Run all tests headless
 *   npm run test:headed         - Run with visible browser
 *   npm run test:specific -- --test=3ds-visa-challenge-success
 *   npm run test:report         - Generate HTML report
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ==================== TEST CONFIGURATION ====================
const CONFIG = {
  baseUrl: 'https://service-pilot.pcibooking.net/api/payments/capturecard',
  defaultParams: {
    brand: 'ArekSandbox',
    language: 'en',
    css: 'boutiquesirenuse',
    cvv: 'true',
    autoDetectCardType: 'true',
    submitWithPostMessage: 'true',
    postMessageHost: 'about:blank',
    success: 'https://pcib2.free.beeceptor.com/Success.aspx?cardToken={cardToken}',
    failure: 'https://pcib2.free.beeceptor.com/failure'
  },
  timeouts: {
    navigation: 30000,
    iframeReady: 15000,
    cardEntry: 5000,
    submission: 30000,
    threeDS: 60000
  }
};

// ==================== TEST CARDS ====================
const TEST_CARDS = {
  // Frictionless 3DS
  visa_frictionless: {
    number: '4761739000060016',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'visa',
    flow: 'frictionless'
  },
  mc_frictionless: {
    number: '5455330200000016',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'mastercard',
    flow: 'frictionless'
  },

  // Device Fingerprint
  visa_dfp: {
    number: '4761739001010010',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'visa',
    flow: 'dfp'
  },
  mc_dfp: {
    number: '5185520050000010',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'mastercard',
    flow: 'dfp'
  },

  // Challenge
  visa_challenge: {
    number: '4018810000150015',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'visa',
    flow: 'challenge',
    successOtp: '0101',
    failOtp: '3333'
  },
  mc_challenge: {
    number: '5299910010000015',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'mastercard',
    flow: 'challenge',
    successOtp: '4445',
    failOtp: '9999'
  },

  // DFP + Challenge
  visa_dfp_challenge: {
    number: '4018810000190011',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'visa',
    flow: 'dfp_challenge',
    successOtp: '0101',
    failOtp: '3333'
  },
  mc_dfp_challenge: {
    number: '5420711000401011',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Three DS test',
    type: 'mastercard',
    flow: 'dfp_challenge',
    successOtp: '4445',
    failOtp: '9999'
  },

  // Invalid cards
  invalid_luhn: {
    number: '4111111111111112',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Test User',
    type: 'unknown',
    flow: 'none'
  },
  invalid_bin: {
    number: '0000000000000000',
    expiry: { month: '12', year: '28' },
    cvv: '123',
    name: 'Test User',
    type: 'unknown',
    flow: 'none'
  }
};

// ==================== TEST SCENARIOS ====================
const TEST_SCENARIOS = [
  // Non-3DS Tests
  {
    id: 'non3ds-visa-success',
    name: 'Visa - Successful Tokenization (No 3DS)',
    description: 'Valid Visa card without 3DS, should tokenize successfully',
    card: TEST_CARDS.visa_frictionless,
    config: { ThreeDS: 'false', useCustomValidation: 'false' },
    expectedOutcome: 'success',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitSuccess' },
      { type: 'field', field: 'cardToken', check: 'exists' }
    ]
  },
  {
    id: 'non3ds-mc-success',
    name: 'Mastercard - Successful Tokenization (No 3DS)',
    description: 'Valid Mastercard without 3DS, should tokenize successfully',
    card: TEST_CARDS.mc_frictionless,
    config: { ThreeDS: 'false', useCustomValidation: 'false' },
    expectedOutcome: 'success',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitSuccess' }
    ]
  },
  {
    id: 'non3ds-invalid-luhn',
    name: 'Invalid Card - Luhn Check Failure',
    description: 'Card fails Luhn validation, should show error',
    card: TEST_CARDS.invalid_luhn,
    config: { ThreeDS: 'false', useCustomValidation: 'false' },
    expectedOutcome: 'validation-error',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'no-event', event: 'CardSubmitSuccess' }
    ]
  },

  // 3DS Frictionless Tests
  {
    id: '3ds-visa-frictionless',
    name: 'Visa - 3DS Frictionless Success',
    description: '3DS frictionless flow, no challenge required',
    card: TEST_CARDS.visa_frictionless,
    config: { ThreeDS: 'true', email: 'test@test.com', amount: '1000', useCustomValidation: 'false' },
    expectedOutcome: 'success',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitSuccess' }
    ]
  },
  {
    id: '3ds-mc-frictionless',
    name: 'Mastercard - 3DS Frictionless Success',
    description: '3DS frictionless flow with Mastercard',
    card: TEST_CARDS.mc_frictionless,
    config: { ThreeDS: 'true', email: 'test@test.com', amount: '1000', useCustomValidation: 'false' },
    expectedOutcome: 'success',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitSuccess' }
    ]
  },

  // 3DS Challenge Tests
  {
    id: '3ds-visa-challenge-success',
    name: 'Visa - 3DS Challenge Success (OTP: 0101)',
    description: '3DS challenge with correct OTP',
    card: TEST_CARDS.visa_challenge,
    otp: '0101',
    config: { ThreeDS: 'true', email: 'test@test.com', amount: '1000', useCustomValidation: 'false' },
    expectedOutcome: 'success',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitSuccess' }
    ]
  },
  {
    id: '3ds-visa-challenge-fail',
    name: 'Visa - 3DS Challenge Failure (OTP: 3333)',
    description: '3DS challenge with wrong OTP should fail',
    card: TEST_CARDS.visa_challenge,
    otp: '3333',
    config: { ThreeDS: 'true', email: 'test@test.com', amount: '1000', useCustomValidation: 'false' },
    expectedOutcome: 'failure',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitFailure' }
    ]
  },
  {
    id: '3ds-mc-challenge-success',
    name: 'Mastercard - 3DS Challenge Success (OTP: 4445)',
    description: '3DS challenge with correct OTP for Mastercard',
    card: TEST_CARDS.mc_challenge,
    otp: '4445',
    config: { ThreeDS: 'true', email: 'test@test.com', amount: '1000', useCustomValidation: 'false' },
    expectedOutcome: 'success',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitSuccess' }
    ]
  },
  {
    id: '3ds-mc-challenge-fail',
    name: 'Mastercard - 3DS Challenge Failure (OTP: 9999)',
    description: '3DS challenge with wrong OTP should fail',
    card: TEST_CARDS.mc_challenge,
    otp: '9999',
    config: { ThreeDS: 'true', email: 'test@test.com', amount: '1000', useCustomValidation: 'false' },
    expectedOutcome: 'failure',
    assertions: [
      { type: 'event', event: 'ready' },
      { type: 'event', event: 'CardSubmitFailure' }
    ]
  }
];

// ==================== TEST RUNNER CLASS ====================
class PCIBookingTestRunner {
  constructor(options = {}) {
    this.options = {
      headed: options.headed || false,
      slowMo: options.slowMo || 0,
      screenshotOnFailure: options.screenshotOnFailure !== false,
      videoRecord: options.videoRecord || false,
      reportDir: options.reportDir || './test-reports'
    };

    this.browser = null;
    this.results = [];
    this.currentTest = null;
  }

  async init() {
    console.log('\n🚀 Initializing PCI Booking Test Runner...\n');

    this.browser = await puppeteer.launch({
      headless: this.options.headed ? false : 'new',
      slowMo: this.options.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    // Ensure report directory exists
    if (!fs.existsSync(this.options.reportDir)) {
      fs.mkdirSync(this.options.reportDir, { recursive: true });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  buildUrl(testConfig) {
    const params = new URLSearchParams();

    // Add default params
    Object.entries(CONFIG.defaultParams).forEach(([key, value]) => {
      params.set(key, value);
    });

    // Add test-specific config
    if (testConfig) {
      Object.entries(testConfig).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.set(key, value);
        }
      });
    }

    return `${CONFIG.baseUrl}?${params.toString()}`;
  }

  async runTest(scenario) {
    const startTime = Date.now();
    this.currentTest = scenario;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Test: ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log(`${'='.repeat(60)}`);

    const result = {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      startTime: new Date().toISOString(),
      events: [],
      assertions: [],
      passed: false,
      error: null,
      duration: 0,
      screenshots: []
    };

    const page = await this.browser.newPage();

    try {
      // Set viewport
      await page.setViewport({ width: 1280, height: 800 });

      // Capture console messages
      page.on('console', msg => {
        if (msg.type() === 'log') {
          console.log(`   [Console] ${msg.text()}`);
        }
      });

      // Build and navigate to URL
      const url = this.buildUrl(scenario.config);
      console.log(`\n📍 Loading iframe URL...`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeouts.navigation
      });

      // Wait for the form to be ready
      console.log(`⏳ Waiting for form to load...`);
      await this.waitForFormReady(page);
      result.events.push({ type: 'ready', timestamp: Date.now() });
      console.log(`✅ Form is ready`);

      // Fill card details
      console.log(`\n💳 Entering card details...`);
      await this.fillCardDetails(page, scenario.card);
      console.log(`   Card: ${scenario.card.number}`);
      console.log(`   Expiry: ${scenario.card.expiry.month}/${scenario.card.expiry.year}`);
      console.log(`   Name: ${scenario.card.name}`);

      // Submit the form
      console.log(`\n📤 Submitting form...`);
      await this.submitForm(page);

      // Handle 3DS if needed
      if (scenario.config.ThreeDS === 'true' && scenario.otp) {
        console.log(`\n🔐 Handling 3DS challenge...`);
        await this.handle3DSChallenge(page, scenario.otp);
        result.events.push({ type: 'ThreeDsChallengeLoaded', timestamp: Date.now() });
      }

      // Wait for result
      console.log(`\n⏳ Waiting for result...`);
      const outcome = await this.waitForOutcome(page, scenario);
      result.events.push({ type: outcome.type, data: outcome.data, timestamp: Date.now() });

      // Validate assertions
      result.assertions = this.validateAssertions(scenario, result.events, outcome);
      result.passed = result.assertions.every(a => a.passed);

      if (result.passed) {
        console.log(`\n✅ TEST PASSED`);
        if (outcome.data?.cardToken) {
          console.log(`   Token: ${outcome.data.cardToken.substring(0, 30)}...`);
        }
      } else {
        console.log(`\n❌ TEST FAILED`);
        result.assertions.filter(a => !a.passed).forEach(a => {
          console.log(`   ✗ ${a.description}`);
        });
      }

    } catch (error) {
      result.error = error.message;
      result.passed = false;
      console.log(`\n❌ TEST ERROR: ${error.message}`);

      // Take screenshot on failure
      if (this.options.screenshotOnFailure) {
        const screenshotPath = path.join(
          this.options.reportDir,
          `${scenario.id}-error-${Date.now()}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshots.push(screenshotPath);
        console.log(`   📸 Screenshot saved: ${screenshotPath}`);
      }
    } finally {
      result.duration = Date.now() - startTime;
      result.endTime = new Date().toISOString();
      this.results.push(result);
      await page.close();
    }

    return result;
  }

  async waitForFormReady(page) {
    // Wait for the card number input to be visible
    await page.waitForSelector('input[name="cardNumber"], input[id*="card"], input[placeholder*="card" i]', {
      visible: true,
      timeout: CONFIG.timeouts.iframeReady
    });

    // Additional wait for form to be fully interactive
    await page.waitForTimeout(1000);
  }

  async fillCardDetails(page, card) {
    // Try different selectors for card number
    const cardNumberSelectors = [
      'input[name="cardNumber"]',
      'input[id*="cardNumber" i]',
      'input[placeholder*="card number" i]',
      'input[data-field="cardNumber"]',
      '#cardNumber',
      'input[autocomplete="cc-number"]'
    ];

    let cardNumberInput = null;
    for (const selector of cardNumberSelectors) {
      try {
        cardNumberInput = await page.$(selector);
        if (cardNumberInput) break;
      } catch (e) {}
    }

    if (cardNumberInput) {
      await cardNumberInput.click({ clickCount: 3 });
      await cardNumberInput.type(card.number, { delay: 50 });
    } else {
      // Fallback: find input by traversing
      await page.evaluate((cardNum) => {
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          if (input.maxLength >= 16 || input.placeholder?.toLowerCase().includes('card')) {
            input.value = cardNum;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, card.number);
    }

    // Fill expiry month
    const monthSelectors = [
      'select[name*="month" i]',
      'select[id*="month" i]',
      '#expiryMonth',
      'select[data-field="expiryMonth"]'
    ];

    for (const selector of monthSelectors) {
      try {
        const monthSelect = await page.$(selector);
        if (monthSelect) {
          await page.select(selector, card.expiry.month);
          break;
        }
      } catch (e) {}
    }

    // Fill expiry year
    const yearSelectors = [
      'select[name*="year" i]',
      'select[id*="year" i]',
      '#expiryYear',
      'select[data-field="expiryYear"]'
    ];

    for (const selector of yearSelectors) {
      try {
        const yearSelect = await page.$(selector);
        if (yearSelect) {
          // Try both 2-digit and 4-digit year
          try {
            await page.select(selector, card.expiry.year);
          } catch {
            await page.select(selector, '20' + card.expiry.year);
          }
          break;
        }
      } catch (e) {}
    }

    // Fill CVV
    const cvvSelectors = [
      'input[name*="cvv" i]',
      'input[name*="cvc" i]',
      'input[name*="securityCode" i]',
      'input[id*="cvv" i]',
      '#cvv',
      'input[autocomplete="cc-csc"]'
    ];

    for (const selector of cvvSelectors) {
      try {
        const cvvInput = await page.$(selector);
        if (cvvInput) {
          await cvvInput.click({ clickCount: 3 });
          await cvvInput.type(card.cvv, { delay: 50 });
          break;
        }
      } catch (e) {}
    }

    // Fill cardholder name
    const nameSelectors = [
      'input[name*="cardHolder" i]',
      'input[name*="name" i]',
      'input[id*="cardHolder" i]',
      '#cardHolderName',
      'input[autocomplete="cc-name"]'
    ];

    for (const selector of nameSelectors) {
      try {
        const nameInput = await page.$(selector);
        if (nameInput) {
          await nameInput.click({ clickCount: 3 });
          await nameInput.type(card.name, { delay: 30 });
          break;
        }
      } catch (e) {}
    }

    // Wait for any auto-detection to complete
    await page.waitForTimeout(500);
  }

  async submitForm(page) {
    // Try to find and click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[id*="submit" i]',
      'button:contains("Submit")',
      '.submit-btn',
      '#submitButton'
    ];

    for (const selector of submitSelectors) {
      try {
        const submitBtn = await page.$(selector);
        if (submitBtn) {
          await submitBtn.click();
          return;
        }
      } catch (e) {}
    }

    // Fallback: press Enter
    await page.keyboard.press('Enter');
  }

  async handle3DSChallenge(page, otp) {
    try {
      // Wait for 3DS iframe/challenge to appear
      await page.waitForTimeout(3000);

      // Look for OTP input in the page or any iframes
      const frames = page.frames();

      for (const frame of frames) {
        try {
          // Wait for OTP input
          const otpInput = await frame.$('input[type="text"], input[type="password"], input[name*="otp" i], input[id*="otp" i]');

          if (otpInput) {
            console.log(`   Found OTP input, entering: ${otp}`);
            await otpInput.type(otp, { delay: 100 });

            // Find and click submit/verify button
            const submitBtn = await frame.$('button[type="submit"], input[type="submit"], button:contains("Submit"), button:contains("Verify")');
            if (submitBtn) {
              await submitBtn.click();
            } else {
              await frame.keyboard.press('Enter');
            }

            return;
          }
        } catch (e) {}
      }

      // If no OTP input found in frames, try main page
      const otpInputMain = await page.$('input[type="text"][maxlength="4"], input[type="text"][maxlength="6"]');
      if (otpInputMain) {
        await otpInputMain.type(otp, { delay: 100 });
        await page.keyboard.press('Enter');
      }

    } catch (error) {
      console.log(`   ⚠️ 3DS handling: ${error.message}`);
    }
  }

  async waitForOutcome(page, scenario) {
    const timeout = scenario.config.ThreeDS === 'true'
      ? CONFIG.timeouts.threeDS
      : CONFIG.timeouts.submission;

    try {
      // Wait for URL change (redirect to success/failure URL)
      await page.waitForFunction(
        (successUrl, failureUrl) => {
          const url = window.location.href;
          return url.includes('Success') || url.includes('failure') || url.includes('cardToken');
        },
        { timeout },
        CONFIG.defaultParams.success,
        CONFIG.defaultParams.failure
      );

      const finalUrl = page.url();

      if (finalUrl.includes('Success') || finalUrl.includes('cardToken')) {
        // Extract token from URL
        const urlParams = new URLSearchParams(new URL(finalUrl).search);
        return {
          type: 'CardSubmitSuccess',
          data: {
            cardToken: urlParams.get('cardToken'),
            cardType: urlParams.get('cardType'),
            url: finalUrl
          }
        };
      } else {
        return {
          type: 'CardSubmitFailure',
          data: { url: finalUrl }
        };
      }
    } catch (error) {
      // Timeout or error - check current state
      const currentUrl = page.url();

      if (scenario.expectedOutcome === 'validation-error') {
        return { type: 'ValidationError', data: { message: 'Form validation failed' } };
      }

      return {
        type: 'Timeout',
        data: { message: error.message, url: currentUrl }
      };
    }
  }

  validateAssertions(scenario, events, outcome) {
    return scenario.assertions.map(assertion => {
      let passed = false;
      let description = '';

      switch (assertion.type) {
        case 'event':
          passed = events.some(e => e.type === assertion.event);
          description = `Event '${assertion.event}' received`;
          break;

        case 'no-event':
          passed = !events.some(e => e.type === assertion.event);
          description = `Event '${assertion.event}' NOT received`;
          break;

        case 'field':
          if (outcome.data && assertion.check === 'exists') {
            passed = !!outcome.data[assertion.field];
            description = `Field '${assertion.field}' exists in response`;
          }
          break;
      }

      return { ...assertion, passed, description };
    });
  }

  async runAllTests(filter = null) {
    console.log('\n' + '═'.repeat(60));
    console.log('🧪 PCI BOOKING AUTOMATED TEST SUITE');
    console.log('═'.repeat(60));

    let scenarios = TEST_SCENARIOS;

    if (filter) {
      scenarios = scenarios.filter(s => s.id.includes(filter));
      console.log(`\nRunning filtered tests: ${filter}`);
    }

    console.log(`\nTotal tests to run: ${scenarios.length}\n`);

    for (const scenario of scenarios) {
      await this.runTest(scenario);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.printSummary();
    await this.generateReport();
  }

  printSummary() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`\n   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total:  ${total}`);
    console.log(`   ⏱️  Duration: ${this.results.reduce((acc, r) => acc + r.duration, 0)}ms`);

    if (failed > 0) {
      console.log('\n   Failed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.name}: ${r.error || 'Assertion failed'}`);
      });
    }

    console.log('\n' + '═'.repeat(60) + '\n');
  }

  async generateReport() {
    const report = {
      generated: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        duration: this.results.reduce((acc, r) => acc + r.duration, 0)
      },
      results: this.results
    };

    // Save JSON report
    const jsonPath = path.join(this.options.reportDir, `report-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON Report: ${jsonPath}`);

    // Generate HTML report
    const htmlPath = path.join(this.options.reportDir, `report-${Date.now()}.html`);
    const html = this.generateHtmlReport(report);
    fs.writeFileSync(htmlPath, html);
    console.log(`📄 HTML Report: ${htmlPath}`);
  }

  generateHtmlReport(report) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>PCI Booking Test Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .header { background: #333; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 20px; }
    .stat { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .stat-value { font-size: 36px; font-weight: bold; }
    .stat-value.passed { color: #4caf50; }
    .stat-value.failed { color: #f44336; }
    .stat-label { color: #666; margin-top: 5px; }
    .test { background: white; padding: 20px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .test-header { display: flex; justify-content: space-between; align-items: center; }
    .test-name { font-weight: 600; }
    .test-status { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .test-status.passed { background: #4caf50; color: white; }
    .test-status.failed { background: #f44336; color: white; }
    .test-details { margin-top: 10px; font-size: 14px; color: #666; }
    .assertions { margin-top: 10px; }
    .assertion { padding: 5px 0; display: flex; align-items: center; gap: 8px; }
    .assertion-icon { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; color: white; }
    .assertion-icon.pass { background: #4caf50; }
    .assertion-icon.fail { background: #f44336; }
  </style>
</head>
<body>
  <div class="header">
    <h1>PCI Booking Test Report</h1>
    <p>Generated: ${new Date(report.generated).toLocaleString()}</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="stat-value">${report.summary.total}</div>
      <div class="stat-label">Total Tests</div>
    </div>
    <div class="stat">
      <div class="stat-value passed">${report.summary.passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat">
      <div class="stat-value failed">${report.summary.failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat">
      <div class="stat-value">${(report.summary.duration / 1000).toFixed(1)}s</div>
      <div class="stat-label">Duration</div>
    </div>
  </div>

  ${report.results.map(r => `
    <div class="test">
      <div class="test-header">
        <span class="test-name">${r.name}</span>
        <span class="test-status ${r.passed ? 'passed' : 'failed'}">${r.passed ? 'PASSED' : 'FAILED'}</span>
      </div>
      <div class="test-details">
        ${r.description}<br>
        Duration: ${r.duration}ms
        ${r.error ? `<br><strong>Error:</strong> ${r.error}` : ''}
      </div>
      <div class="assertions">
        ${r.assertions.map(a => `
          <div class="assertion">
            <span class="assertion-icon ${a.passed ? 'pass' : 'fail'}">${a.passed ? '✓' : '✗'}</span>
            <span>${a.description}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('')}
</body>
</html>`;
  }
}

// ==================== CLI ====================
async function main() {
  const args = process.argv.slice(2);
  const options = {
    headed: args.includes('--headed'),
    slowMo: args.includes('--slow') ? 100 : 0
  };

  // Check for specific test filter
  const testArg = args.find(a => a.startsWith('--test='));
  const testFilter = testArg ? testArg.split('=')[1] : null;

  const runner = new PCIBookingTestRunner(options);

  try {
    await runner.init();
    await runner.runAllTests(testFilter);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await runner.close();
  }

  // Exit with appropriate code
  const failed = runner.results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
