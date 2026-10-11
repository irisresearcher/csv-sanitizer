/**
 * ClientSide CSV Sanitizer & Formatter Engine
 * Zero external dependencies. 100% Client-Side.
 * Compatible with both Browser (window/ESM) and Node.js environments.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CSVSanitizer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Auto-detect delimiter from sample lines
  function detectDelimiter(text) {
    const delimiters = [',', ';', '\t', '|'];
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0).slice(0, 15);
    
    if (lines.length === 0) return ',';

    const scores = {};
    for (const d of delimiters) {
      scores[d] = { counts: [], variance: 0, total: 0 };
      for (const line of lines) {
        // Count delimiters not enclosed in standard quotes
        let count = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === d && !inQuotes) count++;
        }
        scores[d].counts.push(count);
        scores[d].total += count;
      }

      // Calculate consistency (mean and variance)
      const counts = scores[d].counts;
      const mean = scores[d].total / counts.length;
      if (mean === 0) {
        scores[d].variance = Infinity;
      } else {
        const sumSq = counts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
        scores[d].variance = sumSq / counts.length;
      }
    }

    // Pick delimiter with lowest variance and highest non-zero mean
    let bestDelimiter = ',';
    let bestScore = -Infinity;

    for (const d of delimiters) {
      if (scores[d].total > 0) {
        // Lower variance is better; higher total count gives confidence
        const consistencyScore = (scores[d].total / lines.length) / (1 + scores[d].variance);
        if (consistencyScore > bestScore) {
          bestScore = consistencyScore;
          bestDelimiter = d;
        }
      }
    }

    return bestDelimiter;
  }

  // Pre-process and repair unescaped quotes in a raw line or stream
  function repairUnescapedQuotes(line, delimiter) {
    if (!line.includes('"')) return line;

    const chars = line.split('');
    let inQuotedField = false;
    let fieldStartIndex = 0;
    const repaired = [];

    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const prev = i > 0 ? chars[i - 1] : null;
      const next = i < chars.length - 1 ? chars[i + 1] : null;

      if (c === '"') {
        const atFieldBoundaryStart = (i === fieldStartIndex || prev === delimiter || (prev === ' ' && (i === 1 || chars[i - 2] === delimiter)));
        const atFieldBoundaryEnd = (next === null || next === delimiter || next === '\r' || next === '\n' || (next === ' ' && chars[i + 2] === delimiter));

        if (!inQuotedField) {
          if (atFieldBoundaryStart) {
            inQuotedField = true;
            repaired.push(c);
          } else {
            // Stray quote in unquoted field -> escape as double quote
            repaired.push('""');
          }
        } else {
          // Inside a quoted field
          if (atFieldBoundaryEnd) {
            inQuotedField = false;
            repaired.push(c);
          } else if (next === '"') {
            // Already an escaped quote pair
            repaired.push('""');
            i++; // skip next quote
          } else {
            // Unescaped inner quote -> double it to escape properly per RFC 4180
            repaired.push('""');
          }
        }
      } else {
        if (!inQuotedField && c === delimiter) {
          fieldStartIndex = i + 1;
        }
        repaired.push(c);
      }
    }

    // If an unclosed quote remained at line end, close it
    if (inQuotedField) {
      repaired.push('"');
    }

    return repaired.join('');
  }

  // Tokenize and parse a sanitized CSV string into a 2D array
  function parseCSV(text, delimiter, fixQuotes = true) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    let repairedLinesCount = 0;

    let source = text;
    if (fixQuotes) {
      const rawLines = text.split(/\r?\n/);
      const repairedLines = rawLines.map(line => {
        const rep = repairUnescapedQuotes(line, delimiter);
        if (rep !== line) repairedLinesCount++;
        return rep;
      });
      source = repairedLines.join('\n');
    }

    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      const next = source[i + 1];

      if (c === '"') {
        if (inQuotes && next === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') i++;
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += c;
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return { rows, repairedLinesCount };
  }

  // PII Masking Utilities
  function maskEmail(val) {
    if (typeof val !== 'string') return val;
    return val.replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g, '$1***@$2');
  }

  function maskPhone(val) {
    if (typeof val !== 'string') return val;
    // Matches formats: (555) 123-4567, 555-123-4567, +1-555-123-4567, 1-800-555-0199
    return val.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?(\d{4})\b/g, '(***) ***-$1');
  }

  function maskCreditCard(val) {
    if (typeof val !== 'string') return val;
    // Matches 13-19 digit credit cards separated by dashes or spaces
    return val.replace(/\b(?:\d{4}[-\s]?){3}(\d{4})\b/g, '****-****-****-$1');
  }

  // Master Sanitization Routine
  function process(rawText, options = {}) {
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    const opts = {
      delimiter: options.delimiter || 'auto',
      fixQuotes: options.fixQuotes !== false,
      trimWhitespace: options.trimWhitespace !== false,
      deduplicate: options.deduplicate !== false,
      removeEmptyRows: options.removeEmptyRows !== false,
      normalizeColumns: options.normalizeColumns !== false,
      maskEmail: !!options.maskEmail,
      maskPhone: !!options.maskPhone,
      maskCreditCard: !!options.maskCreditCard
    };

    const effectiveDelimiter = (opts.delimiter === 'auto') ? detectDelimiter(rawText) : opts.delimiter;
    const { rows: rawRows, repairedLinesCount } = parseCSV(rawText, effectiveDelimiter, opts.fixQuotes);

    let cleanRows = [];
    let emptyRowsRemoved = 0;
    let duplicatesRemoved = 0;
    let piiMaskedCount = 0;

    // Remove empty rows
    for (const row of rawRows) {
      const isBlank = row.every(cell => !cell || cell.trim().length === 0);
      if (opts.removeEmptyRows && isBlank) {
        emptyRowsRemoved++;
        continue;
      }
      cleanRows.push(row);
    }

    if (cleanRows.length === 0) {
      return {
        headers: [],
        rows: [],
        stats: {
          totalRowsInput: rawRows.length,
          totalRowsOutput: 0,
          repairedRows: 0,
          duplicatesRemoved: 0,
          emptyRowsRemoved,
          piiMaskedCount: 0,
          delimiter: effectiveDelimiter,
          durationMs: 0
        }
      };
    }

    // Determine target column count based on header
    const headers = cleanRows[0].map(h => opts.trimWhitespace ? h.trim() : h);
    const targetCols = headers.length;
    const dataRows = cleanRows.slice(1);

    const processedData = [];
    const seenHashes = new Set();

    for (let r = 0; r < dataRows.length; r++) {
      let row = dataRows[r];

      // Trim whitespace
      if (opts.trimWhitespace) {
        row = row.map(cell => cell.trim());
      }

      // Normalize column count
      if (opts.normalizeColumns) {
        if (row.length < targetCols) {
          while (row.length < targetCols) row.push('');
        } else if (row.length > targetCols) {
          // Extra columns condensed into last column or truncated
          const extra = row.slice(targetCols - 1).join(', ');
          row = row.slice(0, targetCols - 1);
          row.push(extra);
        }
      }

      // PII Masking
      if (opts.maskEmail || opts.maskPhone || opts.maskCreditCard) {
        row = row.map(cell => {
          let updated = cell;
          if (opts.maskEmail) {
            const masked = maskEmail(updated);
            if (masked !== updated) { piiMaskedCount++; updated = masked; }
          }
          if (opts.maskPhone) {
            const masked = maskPhone(updated);
            if (masked !== updated) { piiMaskedCount++; updated = masked; }
          }
          if (opts.maskCreditCard) {
            const masked = maskCreditCard(updated);
            if (masked !== updated) { piiMaskedCount++; updated = masked; }
          }
          return updated;
        });
      }

      // Deduplication
      if (opts.deduplicate) {
        const rowHash = JSON.stringify(row);
        if (seenHashes.has(rowHash)) {
          duplicatesRemoved++;
          continue;
        }
        seenHashes.add(rowHash);
      }

      processedData.push(row);
    }

    const endTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const durationMs = Math.round((endTime - startTime) * 100) / 100;

    return {
      headers,
      rows: processedData,
      stats: {
        totalRowsInput: rawRows.length,
        totalRowsOutput: processedData.length + 1,
        repairedRows: repairedLinesCount,
        duplicatesRemoved,
        emptyRowsRemoved,
        piiMaskedCount,
        delimiter: effectiveDelimiter,
        durationMs
      }
    };
  }

  // Exporters
  function toCSV(headers, rows, delimiter = ',') {
    function escapeCell(val) {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }

    const lines = [];
    lines.push(headers.map(escapeCell).join(delimiter));
    for (const row of rows) {
      lines.push(row.map(escapeCell).join(delimiter));
    }
    return lines.join('\r\n');
  }

  function toJSON(headers, rows, pretty = true) {
    const list = rows.map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h || `col_${idx + 1}`] = row[idx] !== undefined ? row[idx] : null;
      });
      return obj;
    });
    return pretty ? JSON.stringify(list, null, 2) : JSON.stringify(list);
  }

  function toMarkdown(headers, rows, maxRows = 200) {
    if (!headers || headers.length === 0) return '';
    const headerLine = '| ' + headers.map(h => (h || '').replace(/\|/g, '\\|')).join(' | ') + ' |';
    const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |';
    const rowLines = rows.slice(0, maxRows).map(row => {
      return '| ' + row.map(c => String(c || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')).join(' | ') + ' |';
    });
    return [headerLine, separatorLine, ...rowLines].join('\n');
  }

  function toSQL(tableName, headers, rows) {
    const safeTable = (tableName || 'sanitized_data').replace(/[^a-zA-Z0-9_]/g, '_');
    const cols = headers.map(h => '`' + (h || 'col').replace(/`/g, '') + '`').join(', ');
    
    const statements = rows.map(row => {
      const vals = row.map(val => {
        if (val === null || val === undefined || val === '') return 'NULL';
        // Check if numeric
        if (!isNaN(val) && val.trim() !== '') return Number(val);
        // String escaping
        const escaped = String(val).replace(/'/g, "''");
        return `'${escaped}'`;
      }).join(', ');
      return `INSERT INTO ${safeTable} (${cols}) VALUES (${vals});`;
    });

    return statements.join('\n');
  }

  return {
    detectDelimiter,
    repairUnescapedQuotes,
    parseCSV,
    process,
    toCSV,
    toJSON,
    toMarkdown,
    toSQL
  };
});
