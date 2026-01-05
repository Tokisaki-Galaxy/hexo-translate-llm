/**
 * Hexo Injector module
 * Handles CSS and JavaScript injection for language switching
 */

/**
 * Returns the CSS styles for language-based content display
 * @returns {string} - CSS style block
 */
function getLanguageStyles() {
    return `
<style>
    .hexo-llm-zh { display: none; }
    .hexo-llm-en { display: block; }
    html[lang^="zh"] .hexo-llm-en { display: none !important; }
    html[lang^="zh"] .hexo-llm-zh { display: block !important; }
</style>
`;
}

/**
 * Creates the body-end script generator function
 * @param {Array} globalTitlePairs - Array of title pairs from current process
 * @param {object} storage - Storage instance for accessing cache
 * @returns {function} - Function that returns the script tag
 */
function createTitlePairsScriptGenerator(globalTitlePairs, storage) {
    return () => {
        const pairsMap = new Map();

        // 1. Add from memory (current process)
        globalTitlePairs.forEach(p => {
            if (p.en && p.zh) pairsMap.set(p.en.trim(), p.zh);
        });

        // 2. Supplement from cache (historical translations)
        if (storage.cache) {
            Object.values(storage.cache).forEach(item => {
                if (item.originalTitle && item.translatedTitle) {
                    const en = item.translatedTitle.trim();
                    if (!pairsMap.has(en)) {
                        pairsMap.set(en, item.originalTitle);
                    }
                }
            });
        }

        if (pairsMap.size === 0) return '';

        const pairs = [];
        pairsMap.forEach((zh, en) => {
            pairs.push({ en, zh });
        });

        return `<script>window._hexo_title_pairs = ${JSON.stringify(pairs)};</script>`;
    };
}

/**
 * Returns the language detection and title replacement script
 * @returns {string} - JavaScript for language detection and title replacement
 */
function getLanguageDetectionScript() {
    return `
<script>
(function() {
    var userLang = navigator.language || navigator.userLanguage;
    if (userLang && userLang.startsWith('zh')) {
        document.documentElement.setAttribute('lang', 'zh-CN');
        window.addEventListener('DOMContentLoaded', function() {
            // 1. Handle article page title and H1
            if (window._zh_title && window._en_title) {
                // Precisely detect: find English title in current title and replace with Chinese
                if (document.title.includes(window._en_title)) {
                    document.title = document.title.replace(window._en_title, window._zh_title);
                } else {
                    // Fallback: if theme handles title specially (e.g., truncation), replace directly
                    document.title = window._zh_title;
                }
                // Replace article page h1 title
                // Consider different theme selectors, find first h1 tag for replacement
                var h1 = document.querySelector('h1');
                if (h1 && window._zh_title) {
                    h1.textContent = window._zh_title;
                }
            }
            // 2. Replace all title elements with data-zh-title and data-en-title attributes on homepage or list pages
            var titleElements = document.querySelectorAll('[data-zh-title][data-en-title]');
            titleElements.forEach(function(el) {
                var zhTitle = el.getAttribute('data-zh-title');
                var enTitle = el.getAttribute('data-en-title');
                if (zhTitle && enTitle) {
                    // Replace element text content
                    if (el.textContent.trim() === enTitle.trim()) {
                        el.textContent = zhTitle;
                    }
                    // If it's a link element, also check its title attribute
                    if (el.hasAttribute('title') && el.getAttribute('title').trim() === enTitle.trim()) {
                        el.setAttribute('title', zhTitle);
                    }
                }
            });
            // 3. Replace article titles on homepage/list pages (using global title mapping)
            if (window._hexo_title_pairs && window._hexo_title_pairs.length > 0) {
                // Create English to Chinese mapping
                var titleMap = {};
                window._hexo_title_pairs.forEach(function(pair) {
                    titleMap[pair.en.trim()] = pair.zh;
                });
                // Helper function to replace article titles, supports exact match and contains match
                var replaceTitle = function(el) {
                    var text = el.textContent.trim();
                    // Prefer exact match
                    if (titleMap[text]) {
                        el.textContent = titleMap[text];
                        return;
                    }
                    // Try contains match (handle cases with extra spaces or child elements)
                    for (var enTitle in titleMap) {
                        if (text === enTitle || text.indexOf(enTitle) !== -1) {
                            // Only replace when text is highly similar to title (avoid false replacements)
                            if (text.length <= enTitle.length * 1.5) {
                                el.textContent = titleMap[enTitle];
                                return;
                            }
                        }
                    }
                };
                // Find title elements within article card/list containers (limit search scope for performance)
                var containers = document.querySelectorAll('main, article, .post, .posts, .post-list, .article-list, .card, .content, #content, #main');
                if (containers.length === 0) {
                    containers = [document.body];
                }
                containers.forEach(function(container) {
                    var titleSelectors = 'h1, h2, h3, .post-title, .article-title, .entry-title, .card-title, a[rel="bookmark"]';
                    var potentialTitleElements = container.querySelectorAll(titleSelectors);
                    potentialTitleElements.forEach(replaceTitle);
                });
            }
        });
    } else {
        document.documentElement.setAttribute('lang', 'en');
    }
})();
</script>
`;
}

/**
 * Registers all injectors with Hexo
 * @param {object} hexo - Hexo instance
 * @param {Array} globalTitlePairs - Array of title pairs from current process
 * @param {object} storage - Storage instance
 */
function registerInjectors(hexo, globalTitlePairs, storage) {
    // Inject CSS in head
    hexo.extend.injector.register('head_end', getLanguageStyles(), 'default');

    // Inject title pairs script in body end
    hexo.extend.injector.register(
        'body_end',
        createTitlePairsScriptGenerator(globalTitlePairs, storage),
        'default'
    );

    // Inject language detection script in head begin
    hexo.extend.injector.register('head_begin', getLanguageDetectionScript(), 'default');
}

module.exports = {
    getLanguageStyles,
    createTitlePairsScriptGenerator,
    getLanguageDetectionScript,
    registerInjectors
};
