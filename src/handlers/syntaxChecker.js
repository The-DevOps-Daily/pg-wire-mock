/**
 * SQL Syntax Error Detection Utilities
 * Provides basic SQL syntax checking for better error reporting
 */

/**
 * Simple SQL syntax validator
 * @param {string} query - SQL query to validate
 * @returns {Object|null} Error information if syntax error is detected, null otherwise
 */
function checkSyntaxErrors(query) {
  // Trim any whitespace
  const trimmedQuery = query.trim();

  // Empty query check
  if (!trimmedQuery) {
    return {
      code: 'SYNTAX_ERROR',
      message: 'Empty query',
      detail: 'The query string is empty',
      hint: 'Try entering a valid SQL command',
    };
  }

  // Check for unmatched quotes
  const singleQuoteCount = (trimmedQuery.match(/'/g) || []).length;
  const doubleQuoteCount = (trimmedQuery.match(/"/g) || []).length;

  if (singleQuoteCount % 2 !== 0) {
    return {
      code: 'SYNTAX_ERROR',
      message: 'Unterminated string literal',
      detail: 'The query contains an odd number of single quotes',
      hint: 'Check for missing closing quotes in string literals',
      position: findUnmatchedQuotePosition(trimmedQuery, '\''),
    };
  }

  if (doubleQuoteCount % 2 !== 0) {
    return {
      code: 'SYNTAX_ERROR',
      message: 'Unterminated identifier',
      detail: 'The query contains an odd number of double quotes',
      hint: 'Check for missing closing quotes in identifiers',
      position: findUnmatchedQuotePosition(trimmedQuery, '"'),
    };
  }

  // Check for unmatched parentheses
  const openParenCount = (trimmedQuery.match(/\(/g) || []).length;
  const closeParenCount = (trimmedQuery.match(/\)/g) || []).length;

  if (openParenCount !== closeParenCount) {
    return {
      code: 'SYNTAX_ERROR',
      message: 'Unmatched parentheses',
      detail: `The query has ${openParenCount} opening and ${closeParenCount} closing parentheses`,
      hint: 'Check for missing opening or closing parentheses',
      position: findUnmatchedParenPosition(trimmedQuery),
    };
  }

  // Check for missing semicolon at the end for certain statements
  // SQL commands that typically require a semicolon
  const sqlCmdRegex = /(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)/i;
  if (!trimmedQuery.endsWith(';') && sqlCmdRegex.test(trimmedQuery)) {
    return {
      code: 'SYNTAX_ERROR',
      message: 'Missing semicolon at end of statement',
      detail: 'SQL statements should end with a semicolon',
      hint: 'Add a semicolon (;) at the end of your query',
      position: trimmedQuery.length.toString(),
    };
  }

  // No syntax errors detected
  return null;
}

/**
 * Find the position of an unmatched quote in a string
 * @param {string} str - String to check
 * @param {string} quoteChar - Quote character to look for
 * @returns {string} Position of the problematic quote
 */
function findUnmatchedQuotePosition(str, quoteChar) {
  let inQuote = false;

  for (let i = 0; i < str.length; i++) {
    // Skip escaped quotes
    if (str[i] === '\\' && i < str.length - 1) {
      i++;
      continue;
    }

    if (str[i] === quoteChar) {
      inQuote = !inQuote;

      // If we're still in a quote at the end, this is likely the unmatched one
      if (inQuote && i === str.length - 1) {
        return i.toString();
      }
    }
  }

  // If we're still in a quote at the end, the last quote is unmatched
  if (inQuote) {
    const lastIndex = str.lastIndexOf(quoteChar);
    return lastIndex.toString();
  }

  // Default to the first quote position
  return str.indexOf(quoteChar).toString();
}

/**
 * Find the position of an unmatched parenthesis
 * @param {string} str - String to check
 * @returns {string} Position of the problematic parenthesis
 */
function findUnmatchedParenPosition(str) {
  const stack = [];

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') {
      stack.push(i);
    } else if (str[i] === ')') {
      if (stack.length === 0) {
        // Extra closing parenthesis
        return i.toString();
      }
      stack.pop();
    }
  }

  // If stack is not empty, we have unmatched opening parentheses
  if (stack.length > 0) {
    return stack[stack.length - 1].toString();
  }

  return '0';
}

module.exports = {
  checkSyntaxErrors,
};
