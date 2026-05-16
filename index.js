const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright-core');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/autofill', async (req, res) => {
  const { url, profile } = req.body;

  if (!url || !profile) {
    return res.status(400).json({ message: 'URL and profile required' });
  }

  let browser = null;

  try {
    browser = await chromium.launch({ 
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ],
      headless: true
    });

    const page = await browser.newPage();
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
      else if (matches(combined, ['graduation', 'passing year', 'batch', 'grad year'])) value = profile.gradYear;
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
        console.log('Field fill error:', e.message);
      }
    }

    const screenshot = await page.screenshot({ type: 'png', fullPage: false });
    const base64 = screenshot.toString('base64');
    await browser.close();

    res.json({
      success: true,
      filled: fillMap.length,
      screenshot: `data:image/png;base64,${base64}`,
      message: `Successfully filled ${fillMap.length} fields!`
    });

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: err.message });
  }
});

function matches(text, keywords) {
  return keywords.some(k => text.includes(k));
}

app.get('/', (req, res) => res.json({ status: 'Playwright service running!' }));

app.listen(3001, () => console.log('Playwright service on port 3001'));