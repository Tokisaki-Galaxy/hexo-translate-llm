/**
 * Concurrency control utilities
 * Provides rate limiting and retry functionality for API calls
 */

/**
 * Creates a concurrency limiter that queues requests when limit is exceeded
 * @param {number} limit - Maximum concurrent operations
 * @returns {function} - Function that wraps async operations with concurrency control
 */
function createConcurrencyLimiter(limit = 2) {
    let activeCount = 0;
    const waitingQueue = [];

    return async (fn) => {
        if (activeCount >= limit) {
            await new Promise(resolve => waitingQueue.push(resolve));
        }
        activeCount++;
        try {
            return await fn();
        } finally {
            activeCount--;
            if (waitingQueue.length > 0) {
                const nextResolve = waitingQueue.shift();
                nextResolve();
            }
        }
    };
}

/**
 * Fetches with retry logic for resilient API calls
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options including timeout
 * @param {number} retries - Number of retry attempts
 * @returns {Promise<object>} - Parsed JSON response
 */
async function fetchWithRetry(url, options, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = options.timeout;
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            if (i === retries) throw err;
            const delay = (i + 1) * 2000 + Math.random() * 1000;
            console.warn(`[AI Translate] Retry ${i + 1}/${retries} after ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

module.exports = {
    createConcurrencyLimiter,
    fetchWithRetry
};
