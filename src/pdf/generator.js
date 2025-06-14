// PDF Generation Utility
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core'); // We must use puppeteer-core
const logger = require('../utils/logger');

/**
 * Loads the HTML template and your logo, and prepares them for injection.
 * @returns {{templateHtml: string, logoBase64: string}}
 */
function loadTemplate() {
    const templatePath = path.join(__dirname, '..', 'templates', 'invoice.html');
    const templateHtml = fs.readFileSync(templatePath, 'utf8');

    const logoPath = path.join(__dirname, '..', 'templates', 'logo.png'); 
    const logoBase64 = fs.readFileSync(logoPath, 'base64');

    return { templateHtml, logoBase64 };
}

/**
 * Populates the HTML template with dynamic data.
 * @param {string} html - The HTML template content.
 * @param {object} data - The invoice data.
 * @returns {string} The populated HTML string.
 */
function populateTemplate(html, data) {
    let populated = html;
    for (const key in data) {
        const regex = new RegExp(`{{{\\s*${key}\\s*}}}|{{\\s*${key}\\s*}}`, 'g');
        populated = populated.replace(regex, data[key]);
    }
    return populated;
}

/**
 * Generates a PDF from an HTML string using the @sparticuz/chromium library.
 * @param {string} htmlContent - The final, populated HTML.
 * @returns {Promise<Buffer>} A promise that resolves to the PDF buffer.
 */
const generatePdf = async (htmlContent) => {
    let browser = null;
    try {
        // Dynamic import for chromium
        const chromium = await import('@sparticuz/chromium');
        
        browser = await puppeteer.launch({
            args: chromium.default.args,           // Note the .default
            defaultViewport: chromium.default.defaultViewport,
            executablePath: await chromium.default.executablePath(),
            headless: chromium.default.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        return pdfBuffer;

    } catch (error) {
        logger.error('Error generating PDF with puppeteer:', error);
        throw error;
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }
};

module.exports = {
    loadTemplate,
    populateTemplate,
    generatePdf
};