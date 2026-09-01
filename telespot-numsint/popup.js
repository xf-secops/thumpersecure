/**
 * TELESPOT-NUMSINT - Phone Number Intelligence Search
 * Generates multiple phone number formats and searches Google for OSINT
 */

document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('phoneInput');
  const countryCode = document.getElementById('countryCode');
  const searchEngine = document.getElementById('searchEngine');
  const searchBtn = document.getElementById('searchBtn');
  const formatsPreview = document.getElementById('formatsPreview');
  const formatsList = document.getElementById('formatsList');
  const resultsSection = document.getElementById('resultsSection');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const summarySection = document.getElementById('summarySection');
  const summaryContent = document.getElementById('summaryContent');

  let searchResults = [];
  let currentSearchIndex = 0;
  let isSearching = false;

  // Parse phone number - extract only digits
  function parsePhoneNumber(input) {
    return input.replace(/\D/g, '');
  }

  // Generate the base search formats based on the phone number.
  // US (country === '1') uses the classic 3-3-4 (area/exchange/subscriber)
  // grouping; every other country uses generic international-shaped formats
  // that do NOT force a US-style split.
  function generateFormats(phoneDigits, country) {
    if (country === '1') {
      return generateUSFormats(phoneDigits, country);
    }
    return generateIntlFormats(phoneDigits, country);
  }

  // US-SPECIFIC formats: assumes the North American 3-3-4 split.
  // Example: 555-555-1234 with country code 1
  function generateUSFormats(phoneDigits, country) {
    let areaCode, exchange, subscriber;

    if (phoneDigits.length >= 10) {
      // Take last 10 digits (ignore country code if included)
      const last10 = phoneDigits.slice(-10);
      areaCode = last10.slice(0, 3);
      exchange = last10.slice(3, 6);
      subscriber = last10.slice(6, 10);
    } else if (phoneDigits.length === 7) {
      // No area code provided
      areaCode = '555'; // Default area code
      exchange = phoneDigits.slice(0, 3);
      subscriber = phoneDigits.slice(3, 7);
    } else {
      // Handle other lengths
      areaCode = phoneDigits.slice(0, 3) || '555';
      exchange = phoneDigits.slice(3, 6) || '555';
      subscriber = phoneDigits.slice(6, 10) || '1234';
    }

    const fullNumber = areaCode + exchange + subscriber;
    const fullWithCountry = country + fullNumber;

    // 10 formats matching the user's image (all US-specific grouping)
    return [
      {
        format: `+${fullWithCountry}`,
        description: 'International format (unquoted)'
      },
      {
        format: `"+${fullWithCountry}"`,
        description: 'International format (quoted)'
      },
      {
        format: `"(${areaCode}) ${exchange}-${subscriber}"`,
        description: 'US format with parens (quoted)'
      },
      {
        format: `"${country} (${areaCode}) ${exchange}-${subscriber}"`,
        description: 'Full US format with country (quoted)'
      },
      {
        format: `("${areaCode}-${exchange}-${subscriber}")`,
        description: 'Dashed format (parentheses + quoted)'
      },
      {
        format: `${areaCode}-${exchange}-${subscriber}`,
        description: 'Dashed format (unquoted)'
      },
      {
        format: `"${areaCode}-${exchange}-${subscriber}"`,
        description: 'Dashed format (quoted)'
      },
      {
        format: `(${fullNumber})`,
        description: 'Digits only (parentheses)'
      },
      {
        format: `"${fullNumber}"`,
        description: 'Digits only (quoted)'
      },
      {
        format: `("${fullNumber}")`,
        description: 'Digits only (parentheses + quoted)'
      }
    ];
  }

  // GENERIC international formats: no forced 3-3-4 grouping. We keep the full
  // national number intact and vary quoting / country-code prefixing, which is
  // the pragmatic convention for non-NANP numbers of unknown length.
  function generateIntlFormats(phoneDigits, country) {
    // Strip a leading country code if the user already typed it in.
    let national = phoneDigits;
    if (national.startsWith(country) && national.length > country.length) {
      national = national.slice(country.length);
    }

    const withCountry = country + national;

    // Generic, country-agnostic formats (no 3-3-4 assumption).
    return [
      {
        format: `+${withCountry}`,
        description: 'International format (unquoted)'
      },
      {
        format: `"+${withCountry}"`,
        description: 'International format (quoted)'
      },
      {
        format: `"+${country} ${national}"`,
        description: 'International w/ spaced country code (quoted)'
      },
      {
        format: `+${country} ${national}`,
        description: 'International w/ spaced country code (unquoted)'
      },
      {
        format: `${national}`,
        description: 'National number (unquoted)'
      },
      {
        format: `"${national}"`,
        description: 'National number (quoted)'
      },
      {
        format: `(${national})`,
        description: 'National number (parentheses)'
      },
      {
        format: `("${national}")`,
        description: 'National number (parentheses + quoted)'
      },
      {
        format: `"00${withCountry}"`,
        description: 'International 00-prefix dialing (quoted)'
      },
      {
        format: `00${withCountry}`,
        description: 'International 00-prefix dialing (unquoted)'
      }
    ];
  }

  // Search-engine URL builders (query already un-encoded here).
  const ENGINE_URLS = {
    google: 'https://www.google.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    bing: 'https://www.bing.com/search?q='
  };

  function getEngine() {
    return (searchEngine && ENGINE_URLS[searchEngine.value]) ? searchEngine.value : 'google';
  }

  // Build the full list of queries to run: the base phone formats, plus any
  // opted-in site: presets applied to each format (additive/optional).
  function buildQueries(formats) {
    const queries = formats.map(f => ({ query: f.format, description: f.description }));

    const sites = Array.from(document.querySelectorAll('.site-preset:checked'))
      .map(cb => cb.value);

    sites.forEach(site => {
      formats.forEach(f => {
        queries.push({
          query: `site:${site} ${f.format}`,
          description: `${site} - ${f.description}`
        });
      });
    });

    return queries;
  }

  // Display formats in the preview section
  function displayFormats(formats) {
    formatsList.innerHTML = '';

    formats.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'format-item';
      div.id = `format-${index}`;
      div.innerHTML = `
        <span class="format-number">${index + 1}.</span>
        <span class="format-value">${escapeHtml(item.format)}</span>
        <span class="format-status pending" id="status-${index}">○</span>
      `;
      formatsList.appendChild(div);
    });

    formatsPreview.classList.remove('hidden');
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Update format status indicator
  function updateFormatStatus(index, status) {
    const statusEl = document.getElementById(`status-${index}`);
    if (!statusEl) return;

    statusEl.className = `format-status ${status}`;
    switch (status) {
      case 'searching':
        statusEl.textContent = '◐';
        break;
      case 'complete':
        statusEl.textContent = '✓';
        break;
      case 'error':
        statusEl.textContent = '✗';
        break;
      default:
        statusEl.textContent = '○';
    }
  }

  // Update progress bar
  function updateProgress(completed, total) {
    const percent = (completed / total) * 100;
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${completed} / ${total} searches completed`;
  }

  // Perform a search for a single query on the selected engine.
  async function performSearch(format, index) {
    updateFormatStatus(index, 'searching');

    const query = encodeURIComponent(format);
    const searchUrl = `${ENGINE_URLS[getEngine()]}${query}`;

    try {
      // Open search in new tab
      const tab = await chrome.tabs.create({
        url: searchUrl,
        active: false
      });

      // Store result info
      searchResults.push({
        index,
        format,
        tabId: tab.id,
        url: searchUrl,
        status: 'opened'
      });

      updateFormatStatus(index, 'complete');
      return { success: true, tabId: tab.id };
    } catch (error) {
      console.error(`Search error for format ${index}:`, error);
      updateFormatStatus(index, 'error');
      // Record the actual failure so the summary counts real failures
      // rather than inferring them by subtraction.
      searchResults.push({
        index,
        format,
        tabId: null,
        url: searchUrl,
        status: 'error',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  // Run all queries sequentially with delay. `queries` is a list of
  // { query, description } objects from buildQueries().
  async function runAllSearches(queries) {
    searchResults = [];
    currentSearchIndex = 0;

    resultsSection.classList.remove('hidden');
    summarySection.classList.add('hidden');

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < queries.length; i++) {
      await performSearch(queries[i].query, i);
      updateProgress(i + 1, queries.length);

      // Small delay between searches to avoid rate limiting
      if (i < queries.length - 1) {
        await delay(500);
      }
    }

    // Show summary
    showSummary(queries);
  }

  // Display search summary
  function showSummary(queries) {
    const total = queries.length;
    const successCount = searchResults.filter(r => r.status === 'opened').length;
    // Count real failure records instead of inferring by subtraction.
    const errorCount = searchResults.filter(r => r.status === 'error').length;

    summaryContent.innerHTML = `
      <div class="summary-stat">
        <span class="stat-label">Total Searches</span>
        <span class="stat-value">${total}</span>
      </div>
      <div class="summary-stat">
        <span class="stat-label">Tabs Opened</span>
        <span class="stat-value ${successCount === total ? 'high' : 'medium'}">${successCount}</span>
      </div>
      ${errorCount > 0 ? `
      <div class="summary-stat">
        <span class="stat-label">Errors</span>
        <span class="stat-value low">${errorCount}</span>
      </div>
      ` : ''}
      <div class="summary-stat">
        <span class="stat-label">Status</span>
        <span class="stat-value ${successCount === total ? 'high' : 'medium'}">
          ${successCount === total ? 'Complete' : 'Partial'}
        </span>
      </div>
    `;

    summarySection.classList.remove('hidden');
    searchBtn.disabled = false;
    searchBtn.innerHTML = '<span class="btn-icon">&#128269;</span> Search Again';
  }

  // Main search handler
  async function handleSearch() {
    if (isSearching || searchBtn.disabled) {
      return;
    }

    const phone = phoneInput.value.trim();

    if (!phone) {
      phoneInput.focus();
      phoneInput.style.borderColor = '#ff3d00';
      setTimeout(() => {
        phoneInput.style.borderColor = '';
      }, 2000);
      return;
    }

    const digits = parsePhoneNumber(phone);

    if (digits.length < 7) {
      phoneInput.style.borderColor = '#ff3d00';
      phoneInput.setAttribute('title', 'Enter at least 7 digits');
      setTimeout(() => {
        phoneInput.style.borderColor = '';
        phoneInput.removeAttribute('title');
      }, 2000);
      return;
    }

    const country = countryCode.value;
    const formats = generateFormats(digits, country);

    displayFormats(formats);

    // Build the full run: base formats + any opted-in site: presets.
    const queries = buildQueries(formats);

    isSearching = true;
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="btn-icon">⏳</span> Searching...';

    try {
      await runAllSearches(queries);
    } catch (error) {
      console.error('Search run failed:', error);
      if (progressText) progressText.textContent = 'Search encountered an error. Please try again.';
    } finally {
      isSearching = false;
      if (searchBtn.disabled) {
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<span class="btn-icon">&#128269;</span> Search';
      }
    }
  }

  // Event listeners
  searchBtn.addEventListener('click', handleSearch);

  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isSearching) {
        void handleSearch();
      }
    }
  });

  // Live preview of formats as user types
  phoneInput.addEventListener('input', () => {
    const phone = phoneInput.value.trim();
    const digits = parsePhoneNumber(phone);

    if (digits.length >= 7) {
      const country = countryCode.value;
      const formats = generateFormats(digits, country);
      displayFormats(formats);
    } else {
      formatsPreview.classList.add('hidden');
    }
  });

  countryCode.addEventListener('change', () => {
    const phone = phoneInput.value.trim();
    const digits = parsePhoneNumber(phone);

    if (digits.length >= 7) {
      const country = countryCode.value;
      const formats = generateFormats(digits, country);
      displayFormats(formats);
    }
  });

  // Set example placeholder on load
  phoneInput.placeholder = '555-555-1234';
});
