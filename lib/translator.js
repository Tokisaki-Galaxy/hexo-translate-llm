/**
 * AI Translation module
 * Handles prompt generation and API communication for translation
 */

const { fetchWithRetry } = require('./concurrency');

/**
 * Builds the translation prompt for the AI model
 * @returns {string} - The system prompt for translation
 */
function buildTranslationPrompt() {
    return `You are a professional technical translator.
1. Translate the following Markdown content to English.
2. DO NOT translate or modify placeholders like [CODE_BLOCK_N]. Keep them exactly as they are.
3. DO NOT translate technical identifiers or Hexo tags (like {% note %}, {% tabs %}, {% codeblock %}, etc.). Keep ALL {% ... %} and {% ... %}...{% end... %} tag pairs EXACTLY as they are.
4. DO NOT modify any HTML tags or their attributes (e.g., keep <span class="xxx"> as it is).
5. Maintain all Markdown formatting.
6. Also translate the title provided.
7. Output ONLY the translated text. NO explanations, NO notes, NO meta-comments.
Format your response as: [TITLE_START]translated title[TITLE_END][CONTENT_START]translated content[CONTENT_END]`;
}

/**
 * Extracts code blocks from content and replaces them with placeholders
 * @param {string} content - The original content
 * @returns {{ contentWithPlaceholders: string, codeBlocks: string[] }}
 */
function extractCodeBlocks(content) {
    const codeBlocks = [];
    const contentWithPlaceholders = content.replace(/```[\s\S]*?```/g, (match) => {
        const placeholder = `[CODE_BLOCK_${codeBlocks.length}]`;
        codeBlocks.push(match);
        return placeholder;
    });
    return { contentWithPlaceholders, codeBlocks };
}

/**
 * Restores code blocks from placeholders in translated content
 * @param {string} translatedContent - Content with placeholders
 * @param {string[]} codeBlocks - Original code blocks
 * @returns {string} - Content with restored code blocks
 */
function restoreCodeBlocks(translatedContent, codeBlocks) {
    let result = translatedContent;
    codeBlocks.forEach((originalCode, index) => {
        const placeholder = `[CODE_BLOCK_${index}]`;
        result = result.split(placeholder).join(originalCode);
    });
    return result;
}

/**
 * Validates translated content for common LLM errors
 * @param {string} content - Translated content to validate
 * @throws {Error} - If validation fails
 */
function validateTranslatedContent(content) {
    // Check for malformed HTML attributes
    if (/<[a-zA-Z]+\s+[^>]*\s*[a-zA-Z]+">/g.test(content)) {
        throw new Error('LLM generated malformed HTML attributes (e.g. class">)');
    }

    // Check Hexo tag pairs
    const tagsToCheck = ['note', 'tabs', 'codeblock'];
    for (const tag of tagsToCheck) {
        const openCount = (content.match(new RegExp(`\\{%\\s*${tag}`, 'g')) || []).length;
        const closeCount = (content.match(new RegExp(`\\{%\\s*end${tag}`, 'g')) || []).length;
        if (openCount !== closeCount) {
            throw new Error(`Mismatched Hexo tag: ${tag} (open: ${openCount}, close: ${closeCount})`);
        }
    }
}

/**
 * Sanitizes content to escape malformed Hexo tags
 * @param {string} content - Content to sanitize
 * @returns {string} - Sanitized content
 */
function sanitizeHexoTags(content) {
    return content.replace(/\{%(?!\s*\/?\w[\w-]*)/g, '&#123;%');
}

/**
 * Wraps original and translated content in language-specific containers
 * @param {string} originalContent - Original content
 * @param {string} translatedContent - Translated content
 * @param {string} originalTitle - Original title
 * @param {string} translatedTitle - Translated title
 * @returns {string} - Wrapped content with language containers and script
 */
function wrapContent(originalContent, translatedContent, originalTitle, translatedTitle) {
    const titleScript = `<script>
window._zh_title = ${JSON.stringify(originalTitle)};
window._en_title = ${JSON.stringify(translatedTitle)};
</script>\n\n`;

    return `${titleScript}
<div class="hexo-llm-zh">

${originalContent}

</div>
<div class="hexo-llm-en">

${translatedContent}

</div>`;
}

/**
 * Translates content using the configured AI model
 * @param {object} options - Translation options
 * @param {string} options.title - Title to translate
 * @param {string} options.content - Content to translate
 * @param {string} options.apiKey - API key for authentication
 * @param {string} options.endpoint - API endpoint URL
 * @param {string} options.model - Model identifier
 * @param {number} options.timeout - Request timeout in milliseconds
 * @returns {Promise<{ translatedTitle: string, translatedContent: string } | null>}
 */
async function translateContent({ title, content, apiKey, endpoint, model, timeout }) {
    const { contentWithPlaceholders, codeBlocks } = extractCodeBlocks(content);
    const prompt = buildTranslationPrompt();

    const result = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        timeout,
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: `Title: ${title}\n\nContent: ${contentWithPlaceholders}` }
            ]
        })
    });

    const raw = result.choices?.[0]?.message?.content;
    if (!raw) return null;

    const translatedTitle = raw.match(/\[TITLE_START\](.*?)\[TITLE_END\]/s)?.[1] || title;
    let translatedContent = raw.match(/\[CONTENT_START\](.*?)\[CONTENT_END\]/s)?.[1] || '';

    if (!translatedContent) return null;

    // Post-process the translated content
    translatedContent = restoreCodeBlocks(translatedContent, codeBlocks);
    validateTranslatedContent(translatedContent);
    translatedContent = sanitizeHexoTags(translatedContent);

    return { translatedTitle, translatedContent };
}

module.exports = {
    buildTranslationPrompt,
    extractCodeBlocks,
    restoreCodeBlocks,
    validateTranslatedContent,
    sanitizeHexoTags,
    wrapContent,
    translateContent
};
