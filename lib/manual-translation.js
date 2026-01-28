/**
 * Manual Translation module
 * Handles detection and loading of manual translation files (.en.md)
 */

const fs = require('fs');
const path = require('path');

/**
 * Parses front matter from markdown content
 * @param {string} content - Raw markdown content with potential front matter
 * @returns {{ frontMatter: object|null, body: string }} - Parsed front matter and body content
 */
function parseFrontMatter(content) {
    const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontMatterMatch) {
        return { frontMatter: null, body: content };
    }

    const frontMatterStr = frontMatterMatch[1];
    const body = frontMatterMatch[2];

    // Simple YAML parsing for title
    const frontMatter = {};
    const titleMatch = frontMatterStr.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
    if (titleMatch) {
        frontMatter.title = titleMatch[1].trim();
    }

    return { frontMatter, body };
}

/**
 * Gets the manual translation file path for a source file
 * @param {string} sourceFilePath - Path to the source markdown file (e.g., _posts/hello.md)
 * @param {string} sourceDir - Hexo source directory path
 * @returns {string} - Full path to the manual translation file
 */
function getManualTranslationPath(sourceFilePath, sourceDir) {
    // sourceFilePath is relative like '_posts/hello.md'
    // We need to construct the .en.md path
    const ext = path.extname(sourceFilePath);
    const basePath = sourceFilePath.slice(0, -ext.length);
    const manualTranslationFile = `${basePath}.en${ext}`;
    return path.join(sourceDir, manualTranslationFile);
}

/**
 * Checks if a manual translation file exists for the given source
 * @param {string} sourceFilePath - Path to the source markdown file
 * @param {string} sourceDir - Hexo source directory path
 * @returns {boolean} - True if manual translation file exists
 */
function hasManualTranslation(sourceFilePath, sourceDir) {
    const manualPath = getManualTranslationPath(sourceFilePath, sourceDir);
    return fs.existsSync(manualPath);
}

/**
 * Loads manual translation content from .en.md file
 * @param {string} sourceFilePath - Path to the source markdown file
 * @param {string} sourceDir - Hexo source directory path
 * @returns {{ translatedTitle: string|null, translatedContent: string }|null} - Translated title and content, or null if not found
 */
function loadManualTranslation(sourceFilePath, sourceDir) {
    const manualPath = getManualTranslationPath(sourceFilePath, sourceDir);
    
    if (!fs.existsSync(manualPath)) {
        return null;
    }

    try {
        const rawContent = fs.readFileSync(manualPath, 'utf-8');
        const { frontMatter, body } = parseFrontMatter(rawContent);
        
        return {
            translatedTitle: frontMatter?.title || null,
            translatedContent: body.trim()
        };
    } catch (error) {
        return null;
    }
}

module.exports = {
    parseFrontMatter,
    getManualTranslationPath,
    hasManualTranslation,
    loadManualTranslation
};
