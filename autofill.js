const { chromium } = require('playwright');

async function main() {
  const url = process.env.JOB_URL;
  const profile = JSON.parse(process.env.PROFILE);
  const callbackUrl = process.env.CALLBACK_URL;

  if (!url || !profile) {
    console.log('Missing URL or profile');
    process.exit(1);
  }

  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log('Opening:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const fields = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea, select');
      return Array.from(inputs).map((el, i) => ({
        index: i,
        id: el.id || '',
        name: el.name || '',
        placeholder: el.placeholder || '',
        type: el.type || '',
        label: (() => {
          if (el.id) {
            const lbl = document.querySelector(`label[for="${el.id}"]`);
            if (lbl) return lbl.textContent.trim();
          }
          const parent = el.closest('label');
          if (parent) return parent.textContent.trim();
          if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
          const prev = el.previousElementSibling;
          if (prev) return prev.textContent.trim();
          return '';
        })()
      }));
    });

    const fillMap = [];
    fields.forEach(field => {
      const combined = `${field.id} ${field.name} ${field.placeholder} ${field.label}`.toLowerCase();
      let value = null;

      if (matches(combined, ['full name', 'fullname', 'your name', 'candidate name'])) value = `${profile.firstName} ${profile.lastName}`;
      else if (matches(combined, ['first name', 'firstname', 'fname'])) value = profile.firstName;
      else if (matches(combined, ['last name', 'lastname', 'lname', 'surname'])) value = profile.lastName;
      else if (matches(combined, ['email', 'e-mail', 'mail'])) value = profile.email;
      else if (matches(combined, ['phone', 'mobile', 'contact', 'cell'])) value = profile.phone;
      else if (matches(combined, ['college', 'university', 'institution'])) value = profile.college;
      else if (matches(combined, ['degree', 'qualification'])) value = profile.degree;
      else if (matches(combined, ['cgpa', 'gpa', 'grade'])) value = profile.cgpa;
      else if (matches(combined, ['graduation', 'passing year', 'batch'])) value = profile.gradYear;
      else if (matches(combined, ['city', 'location', 'place'])) value = profile.city;
      else if (matches(combined, ['linkedin'])) value = profile.linkedin;
      else if (matches(combined, ['skill', 'technologies'])) value = profile.skills;

      if (value) fillMap.push({ index: field.index, value });
    });

    for (const fill of fillMap) {
      try {
        await page.evaluate(({ index, value }) => {
          const inputs = document.querySelectorAll('input, textarea, select');
          const el = inputs[index];
          if (el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, fill);
      } catch (e) {
        console.log('Fill error:', e.message);
      }
    }

    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    const base64 = screenshot.toString('base64');

    console.log('FILLED_COUNT:' + fillMap.length);
    console.log('SCREENSHOT:' + base64);

    if (callbackUrl) {
      const https = require('https');
      const http = require('http');
      const data = JSON.stringify({
        success: true,
        filled: fillMap.length,
        screenshot: `data:image/png;base64,${base64}`
      });

      const urlObj = new URL(callbackUrl);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = (urlObj.protocol === 'https:' ? https : http).request(options);
      req.write(data);
      req.end();
    }

    await browser.close();
    console.log('Done! Filled', fillMap.length, 'fields');

  } catch (err) {
    if (browser) await browser.close();
    console.error('Error:', err.message);
    process.exit(1);
  }
}

function matches(text, keywords) {
  return keywords.some(k => text.includes(k));
}

main();