// PDF Generation Utility
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core'); // We must use puppeteer-core
const QRCode = require('qrcode');
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

/**
 * Generates a QR code as a base64 data URL from a given URL.
 * @param {string} url - The URL to encode in the QR code.
 * @param {object} [options] - QR code generation options.
 * @returns {Promise<string>} A promise that resolves to the base64 data URL of the QR code.
 */
const generateQRCode = async (url, options = {}) => {
    if (!url) {
        logger.warn('generateQRCode called without URL');
        return null;
    }

    try {
        const qrOptions = {
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 200,
            ...options
        };

        logger.info(`Generating QR code for URL: ${url}`);
        const qrCodeDataUrl = await QRCode.toDataURL(url, qrOptions);
        
        logger.info('QR code generated successfully');
        return qrCodeDataUrl;
        
    } catch (error) {
        logger.error('Error generating QR code:', error);
        return null;
    }
};

module.exports = {
    loadTemplate,
    populateTemplate,
    generatePdf,
    generateQRCode
};