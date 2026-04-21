  // ===== HELPER FUNCTIONS =====

  /**
   * Replace placeholders in a template string
   * @param {string} template - Template with placeholders like {itemQid}, {itemLabel}, etc.
   * @param {Object} replacements - Key-value pairs for replacements
   * @returns {string} Template with placeholders replaced
   */
  function replacePlaceholders(template, replacements) {
    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replaceAll(`{${key}}`, value || "");
    }
    return result;
  }

  /**
   * Encode a query string for use in URLs
   * @param {string} query - The SPARQL query
   * @returns {string} URL-encoded query with # prefix
   */
  function encodeQueryString(query) {
    return "#" + encodeURIComponent(query);
  }
