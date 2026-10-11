/**
 * CSV Shield - Interactive Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const tabFile = document.getElementById('tab-file');
  const tabPaste = document.getElementById('tab-paste');
  const viewFile = document.getElementById('view-file');
  const viewPaste = document.getElementById('view-paste');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const fileNameDisplay = document.getElementById('file-name-display');
  const pasteInput = document.getElementById('paste-input');

  const btnLoadSample = document.getElementById('btn-load-sample');
  const btnClear = document.getElementById('btn-clear');
  const btnSanitize = document.getElementById('btn-sanitize');

  // Options
  const selectDelimiter = document.getElementById('select-delimiter');
  const chkQuotes = document.getElementById('chk-quotes');
  const chkWhitespace = document.getElementById('chk-whitespace');
  const chkDedupe = document.getElementById('chk-dedupe');
  const chkEmpty = document.getElementById('chk-empty');
  const chkNormalize = document.getElementById('chk-normalize');
  const chkMaskEmail = document.getElementById('chk-mask-email');
  const chkMaskPhone = document.getElementById('chk-mask-phone');
  const chkMaskCard = document.getElementById('chk-mask-card');

  // Results Section
  const resultsSection = document.getElementById('results-section');
  const statInputRows = document.getElementById('stat-input-rows');
  const statOutputRows = document.getElementById('stat-output-rows');
  const statRepaired = document.getElementById('stat-repaired');
  const statDeduped = document.getElementById('stat-deduped');
  const statPii = document.getElementById('stat-pii');
  const statTime = document.getElementById('stat-time');

  // Table Preview
  const tableHead = document.getElementById('table-head');
  const tableBody = document.getElementById('table-body');
  const filterInput = document.getElementById('filter-input');
  const paginationInfo = document.getElementById('pagination-info');

  // Export Buttons
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const btnExportMd = document.getElementById('btn-export-md');
  const btnExportSql = document.getElementById('btn-export-sql');
  const btnCopy = document.getElementById('btn-copy');
  const copyBtnText = document.getElementById('copy-btn-text');

  // Modals
  const btnShowInspector = document.getElementById('btn-show-inspector');
  const inspectorModal = document.getElementById('inspector-modal');
  const btnCloseInspector = document.getElementById('btn-close-inspector');

  const btnProModal = document.getElementById('btn-pro-modal');
  const proModal = document.getElementById('pro-modal');
  const btnClosePro = document.getElementById('btn-close-pro');

  // Application State
  let rawText = '';
  let activeTab = 'file';
  let lastProcessedData = null;
  let activeFileName = 'sanitized_data';

  // Sample Corrupted Data for 1-Click Demo
  const SAMPLE_CORRUPTED_CSV = `id,customer_name,email,phone,notes,amount,transaction_date
1,Alice Johnson,alice.j@enterprise.com,+1 (555) 234-5678,Standard quarterly subscription renewal,99.00,2026-01-15
2,Bob "The Builder" Smith,bob.smith@construct.io,555-987-6543,"Ordered "heavy duty" industrial drill bits with expedited delivery",450.50,2026-01-16
1,Alice Johnson,alice.j@enterprise.com,+1 (555) 234-5678,Standard quarterly subscription renewal,99.00,2026-01-15
3,Charlie Davis,charlie.d@gmail.com,1-800-555-0199,"Requires urgent follow-up on invoice #892",120.00,2026-01-18

4,Diana Prince,diana@themyscira.gov,+1-555-321-7654,"Urgent shipment: "Golden Lasso" accessories - card 4532-8901-2345-6789 on file",1500.00,2026-01-20
 5 , Evan Wright , evan@wright.org , (555) 888-2233 , "Consulting session - 2 hours" , 300.00 , 2026-01-22 `;

  // Tab Switching
  tabFile.addEventListener('click', () => {
    activeTab = 'file';
    tabFile.classList.add('active');
    tabPaste.classList.remove('active');
    viewFile.classList.add('active');
    viewPaste.classList.remove('active');
  });

  tabPaste.addEventListener('click', () => {
    activeTab = 'paste';
    tabPaste.classList.add('active');
    tabFile.classList.remove('active');
    viewPaste.classList.add('active');
    viewFile.classList.remove('active');
  });

  // Dropzone Events
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    activeFileName = file.name.replace(/\.[^/.]+$/, '');
    fileNameDisplay.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    const reader = new FileReader();
    reader.onload = (e) => {
      rawText = e.target.result;
    };
    reader.readAsText(file);
  }

  // Load Sample Data
  btnLoadSample.addEventListener('click', () => {
    rawText = SAMPLE_CORRUPTED_CSV;
    activeFileName = 'corrupted_sample';
    pasteInput.value = SAMPLE_CORRUPTED_CSV;
    fileNameDisplay.textContent = 'Loaded: corrupted_sample.csv (7 rows)';
    // Switch to paste view so user can immediately see what got loaded
    tabPaste.click();
  });

  // Clear
  btnClear.addEventListener('click', () => {
    rawText = '';
    pasteInput.value = '';
    fileInput.value = '';
    fileNameDisplay.textContent = '';
    resultsSection.style.display = 'none';
    lastProcessedData = null;
  });

  // Sanitize Execution
  btnSanitize.addEventListener('click', () => {
    const textToProcess = activeTab === 'paste' ? pasteInput.value : rawText;

    if (!textToProcess || textToProcess.trim().length === 0) {
      alert('Please select a file or paste CSV text first.');
      return;
    }

    const options = {
      delimiter: selectDelimiter.value,
      fixQuotes: chkQuotes.checked,
      trimWhitespace: chkWhitespace.checked,
      deduplicate: chkDedupe.checked,
      removeEmptyRows: chkEmpty.checked,
      normalizeColumns: chkNormalize.checked,
      maskEmail: chkMaskEmail.checked,
      maskPhone: chkMaskPhone.checked,
      maskCreditCard: chkMaskCard.checked
    };

    const result = CSVSanitizer.process(textToProcess, options);
    lastProcessedData = result;

    renderResults(result);
  });

  // Render Results & Metrics
  function renderResults(result) {
    resultsSection.style.display = 'block';

    statInputRows.textContent = result.stats.totalRowsInput;
    statOutputRows.textContent = result.rows.length;
    statRepaired.textContent = result.stats.repairedRows;
    statDeduped.textContent = result.stats.duplicatesRemoved;
    statPii.textContent = result.stats.piiMaskedCount;
    statTime.textContent = `${result.stats.durationMs} ms`;

    renderTable(result.headers, result.rows);

    // Scroll to results smoothly
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Render Table
  function renderTable(headers, rows, filterText = '') {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    if (!headers || headers.length === 0) return;

    // Header Row
    const trHead = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trHead.appendChild(th);
    });
    tableHead.appendChild(trHead);

    // Filter Rows
    let filteredRows = rows;
    if (filterText.trim().length > 0) {
      const q = filterText.toLowerCase();
      filteredRows = rows.filter(r => r.some(cell => String(cell).toLowerCase().includes(q)));
    }

    const maxDisplay = 50;
    const displayRows = filteredRows.slice(0, maxDisplay);

    displayRows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(cell => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tableBody.appendChild(tr);
    });

    paginationInfo.textContent = `Showing ${Math.min(displayRows.length, filteredRows.length)} of ${filteredRows.length} rows (preview limited to 50)`;
  }

  // Filter Input Listener
  filterInput.addEventListener('input', (e) => {
    if (lastProcessedData) {
      renderTable(lastProcessedData.headers, lastProcessedData.rows, e.target.value);
    }
  });

  // Exporters Helper
  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  btnExportCsv.addEventListener('click', () => {
    if (!lastProcessedData) return;
    const csv = CSVSanitizer.toCSV(lastProcessedData.headers, lastProcessedData.rows, lastProcessedData.stats.delimiter);
    triggerDownload(csv, `${activeFileName}_clean.csv`, 'text/csv;charset=utf-8;');
  });

  btnExportJson.addEventListener('click', () => {
    if (!lastProcessedData) return;
    const json = CSVSanitizer.toJSON(lastProcessedData.headers, lastProcessedData.rows);
    triggerDownload(json, `${activeFileName}_clean.json`, 'application/json;charset=utf-8;');
  });

  btnExportMd.addEventListener('click', () => {
    if (!lastProcessedData) return;
    const md = CSVSanitizer.toMarkdown(lastProcessedData.headers, lastProcessedData.rows);
    triggerDownload(md, `${activeFileName}_clean.md`, 'text/markdown;charset=utf-8;');
  });

  btnExportSql.addEventListener('click', () => {
    if (!lastProcessedData) return;
    const sql = CSVSanitizer.toSQL(activeFileName, lastProcessedData.headers, lastProcessedData.rows);
    triggerDownload(sql, `${activeFileName}_clean.sql`, 'text/plain;charset=utf-8;');
  });

  btnCopy.addEventListener('click', () => {
    if (!lastProcessedData) return;
    const csv = CSVSanitizer.toCSV(lastProcessedData.headers, lastProcessedData.rows, lastProcessedData.stats.delimiter);
    navigator.clipboard.writeText(csv).then(() => {
      copyBtnText.textContent = 'Copied!';
      setTimeout(() => {
        copyBtnText.textContent = 'Copy CSV';
      }, 2000);
    });
  });

  // Inspector Modal
  btnShowInspector.addEventListener('click', () => {
    inspectorModal.style.display = 'flex';
  });
  btnCloseInspector.addEventListener('click', () => {
    inspectorModal.style.display = 'none';
  });

  // Pro Modal
  btnProModal.addEventListener('click', () => {
    proModal.style.display = 'flex';
  });
  btnClosePro.addEventListener('click', () => {
    proModal.style.display = 'none';
  });

  // Close modals on clicking backdrop
  window.addEventListener('click', (e) => {
    if (e.target === inspectorModal) inspectorModal.style.display = 'none';
    if (e.target === proModal) proModal.style.display = 'none';
  });
});
