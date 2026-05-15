const NoufarApp = (() => {
  const STORAGE_KEY = "noufar_recent_uploads_v1";
  const MAX_UPLOADS = 12;
  const IDB_NAME = "noufar_uploads_db";
  const IDB_VERSION = 1;
  const IDB_STORE = "upload_rows";

  let _db = null;

  const openIDB = () => new Promise((resolve) => {
    if (_db) { resolve(_db); return; }
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(IDB_STORE, { keyPath: "uploadId" });
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });

  const idbPut = async (uploadId, rows) => {
    const db = await openIDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put({ uploadId, rows });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      } catch { resolve(); }
    });
  };

  const idbDelete = async (uploadId) => {
    const db = await openIDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(uploadId);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      } catch { resolve(); }
    });
  };

  const initRowStorage = async () => {
    const db = await openIDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => {
          for (const { uploadId, rows } of req.result || []) {
            rowCache.set(uploadId, rows);
          }
          resolve();
        };
        req.onerror = resolve;
      } catch { resolve(); }
    });
  };

  const sampleUploads = [
    {
      id: "seed-emissions",
      name: "emissions.csv",
      size: 3072,
      uploadedAt: "2026-04-19T09:15:00.000Z",
      sheetName: "Dataset",
      columns: [
        "Patient ID",
        "Name",
        "Age",
        "Consultation reason",
        "Stress",
        "Palpitations",
        "Goiter",
        "TSH",
        "FT4",
        "TSI",
        "TSI level",
        "Ultrasound",
        "Scintigraphy",
        "Duration of treatment",
      ],
      rows: [
        {
          "Patient ID": "PT-84920",
          Name: "A. Benali",
          Age: 29,
          "Consultation reason": "DYSTHYROIDIE",
          Stress: "Yes",
          Palpitations: "Yes",
          Goiter: "Yes",
          TSH: 0.2,
          FT4: 2.1,
          TSI: "Positive",
          "TSI level": 3.1,
          Ultrasound: "Goiter + nodules",
          Scintigraphy: "High uptake",
          "Duration of treatment": 8,
        },
        {
          "Patient ID": "PT-62118",
          Name: "M. Haddad",
          Age: 42,
          "Consultation reason": "Compression signs",
          Stress: "No",
          Palpitations: "No",
          Goiter: "No",
          TSH: 0.9,
          FT4: 1.2,
          TSI: "Negative",
          "TSI level": 0.4,
          Ultrasound: "Normal volume",
          Scintigraphy: "Normal uptake",
          "Duration of treatment": 24,
        },
        {
          "Patient ID": "PT-33901",
          Name: "S. Karim",
          Age: 34,
          "Consultation reason": "Tumefaction",
          Stress: "Yes",
          Palpitations: "No",
          Goiter: "Yes",
          TSH: 0.35,
          FT4: 1.9,
          TSI: "Positive",
          "TSI level": 1.9,
          Ultrasound: "Goiter",
          Scintigraphy: "Hot nodule",
          "Duration of treatment": 14,
        },
        {
          "Patient ID": "PT-11029",
          Name: "R. Naceur",
          Age: 48,
          "Consultation reason": "Other",
          Stress: "No",
          Palpitations: "No",
          Goiter: "No",
          TSH: 1.4,
          FT4: 1.0,
          TSI: "Negative",
          "TSI level": 0.2,
          Ultrasound: "Normal volume",
          Scintigraphy: "Normal uptake",
          "Duration of treatment": 36,
        },
      ],
    },
    {
      id: "seed-hyperthyroidie",
      name: "data_hyperthyroidie_V1.xlsx",
      size: 15360,
      uploadedAt: "2026-04-18T16:10:00.000Z",
      sheetName: "Hyperthyroidism",
      columns: [
        "Patient ID",
        "Full Name",
        "Age",
        "Consultation reason",
        "Stress",
        "Tremors",
        "Goiter classification",
        "Anti-TPO",
        "TSH",
        "FT4",
        "TSI",
        "TSI level",
        "Ultrasound",
        "Scintigraphy",
        "Duration of treatment",
        "Surgery",
      ],
      rows: [
        {
          "Patient ID": "PT-90112",
          "Full Name": "L. Farhat",
          Age: 31,
          "Consultation reason": "DYSTHYROIDIE",
          Stress: "Yes",
          Tremors: "Yes",
          "Goiter classification": "2",
          "Anti-TPO": "Positive",
          TSH: 0.25,
          FT4: 2.2,
          TSI: "Positive",
          "TSI level": 2.7,
          Ultrasound: "Goiter + nodules",
          Scintigraphy: "High uptake",
          "Duration of treatment": 10,
          Surgery: "No",
        },
        {
          "Patient ID": "PT-90113",
          "Full Name": "T. Mansouri",
          Age: 46,
          "Consultation reason": "Other",
          Stress: "No",
          Tremors: "No",
          "Goiter classification": "0",
          "Anti-TPO": "Negative",
          TSH: 1.2,
          FT4: 1.1,
          TSI: "Negative",
          "TSI level": 0.3,
          Ultrasound: "Normal volume",
          Scintigraphy: "Normal uptake",
          "Duration of treatment": 28,
          Surgery: "No",
        },
        {
          "Patient ID": "PT-90114",
          "Full Name": "N. Chikhi",
          Age: 27,
          "Consultation reason": "Tumefaction",
          Stress: "Yes",
          Tremors: "Yes",
          "Goiter classification": "3",
          "Anti-TPO": "Positive",
          TSH: 0.18,
          FT4: 2.4,
          TSI: "Positive",
          "TSI level": 3.4,
          Ultrasound: "Goiter",
          Scintigraphy: "Hot nodule",
          "Duration of treatment": 7,
          Surgery: "No",
        },
        {
          "Patient ID": "PT-90115",
          "Full Name": "C. Belaid",
          Age: 52,
          "Consultation reason": "Compression signs",
          Stress: "No",
          Tremors: "No",
          "Goiter classification": "1A",
          "Anti-TPO": "Negative",
          TSH: 1.5,
          FT4: 0.9,
          TSI: "Negative",
          "TSI level": 0.1,
          Ultrasound: "Normal volume",
          Scintigraphy: "Normal uptake",
          "Duration of treatment": 48,
          Surgery: "Yes",
        },
      ],
    },
  ];

  const normalizeKey = (value) =>
    String(value ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ");

  const ANTI_TPO_TOTAL_ALIASES = [
    "anti tpo total",
    "anti-tpo total",
    "anti_tpo_total",
    "antiTpoTotal",
    "antiTPOtotal",
    "AntiTPOTOTAL",
    "anti tpo taux",
    "anti-tpo taux",
    "anti_tpo_taux",
    "AntiTPO taux",
    "AntiTPOTAUX",
    "AntiTPO_TAUX",
    "anti tpo level",
    "anti-tpo level",
    "anti tpo value",
    "anti tpo titer",
    "anti tpo titre",
    "anti tpo total ui ml",
    "anti tpo total iu ml",
    "anti tpo total ui/ml",
    "anti tpo total iu/ml",
  ];

  const TSI_LEVEL_ALIASES = [
    "tsi level",
    "tsiLevel",
    "TSILevel",
    "tsi_level",
    "tsi taux",
    "TSItaux",
    "TSI_taux",
    "tsi titer",
    "tsi titre",
    "tsi value",
    "tsi total",
    "tsi index",
  ];

  const REQUIRED_DATASET_COLUMNS = [
    { label: "Name", aliases: ["name", "full name", "patient name", "nom", "patient"] },
    { label: "Age", aliases: ["age", "patient age", "AGE"] },
    { label: "Sex", aliases: ["sex", "gender", "sexe"] },
    { label: "Consultation reason", aliases: ["consultation reason", "reason", "motif consultation"] },
    { label: "TSH", aliases: ["tsh", "tsh level", "thyroid stimulating hormone"] },
    { label: "FT4", aliases: ["ft4", "ft 4", "free t4", "freeT4", "free thyroxine"] },
    { label: "Anti-TPO", aliases: ["anti tpo", "anti-tpo", "anti tpo status", "AntiTPO_POSITIFS", "AntiTPO_NEGATIFS"] },
    {
      label: "Anti-TPO total",
      aliases: ANTI_TPO_TOTAL_ALIASES,
    },
    { label: "Anti-Tg", aliases: ["anti tg", "anti-tg", "anti tg status", "AntiTg_POSITIFS", "AntiTg_NEGATIFS"] },
    { label: "TSI", aliases: ["tsi", "tsi status", "TSI_POSITIFS", "TSI_NEGATIFS"] },
    { label: "TSI level", aliases: TSI_LEVEL_ALIASES },
    { label: "Ultrasound", aliases: ["ultrasound", "thyroid ultrasound", "echographie"] },
    { label: "Scintigraphy", aliases: ["scintigraphy", "thyroid scintigraphy"] },
    { label: "Therapy", aliases: ["therapy", "treatment", "treatment type"] },
    { label: "Duration of treatment", aliases: ["duration of treatment", "treatment duration", "duration", "duree ats", "dureeATS"] },
  ];

  const assertDatasetHasRequiredColumns = (columns = []) => {
    const normalizedColumns = new Set(columns.map(normalizeKey));
    const missing = REQUIRED_DATASET_COLUMNS.filter((field) =>
      field.aliases.every((alias) => !normalizedColumns.has(normalizeKey(alias)))
    ).map((field) => field.label);

    if (missing.length) {
      throw new Error(
        `Import rejected. Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`
      );
    }
  };

  const createId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const withRowIds = (upload) => ({
    ...upload,
    rows: (upload.rows || []).map((row, index) => ({
      __rowId: row.__rowId || `row-${index + 1}`,
      ...row,
    })),
  });

  const ensureUploads = () => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleUploads.map(withRowIds)));
    }
  };

  const loadUploads = () => {
    ensureUploads();
    const uploads = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map((u) => {
      // If rows were stripped from localStorage, restore from in-memory cache
      if (!u.rows && rowCache.has(u.id)) {
        u = { ...u, rows: rowCache.get(u.id) };
      }
      return withRowIds(u);
    });
    return uploads;
  };

  // In-memory row cache — rows are NOT stored in localStorage to avoid quota errors
  const rowCache = new Map();

  const saveUploads = (uploads) => {
    // Strip rows before persisting — only metadata goes to localStorage
    const metadata = uploads.slice(0, MAX_UPLOADS).map(({ rows, ...meta }) => meta);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    } catch {
      // If still too large, trim oldest entries one by one
      let trimmed = metadata;
      while (trimmed.length > 0) {
        trimmed = trimmed.slice(0, trimmed.length - 1);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
          break;
        } catch { /* continue trimming */ }
      }
    }
  };

  const addUpload = (upload) => {
    if (upload.rows) {
      rowCache.set(upload.id, upload.rows);
      idbPut(upload.id, upload.rows); // persist to IndexedDB (async, fire-and-forget)
    }
    const uploads = loadUploads().filter((entry) => entry.id !== upload.id);
    uploads.unshift(upload);
    saveUploads(uploads);
    return upload;
  };

  const getUploadById = (id) => {
    const upload = loadUploads().find((entry) => entry.id === id) || null;
    if (upload && !upload.rows && rowCache.has(id)) {
      upload.rows = rowCache.get(id);
    }
    return upload;
  };

  const deleteUpload = (id) => {
    rowCache.delete(id);
    idbDelete(id); // async, fire-and-forget
    const uploads = loadUploads().filter((entry) => entry.id !== id);
    saveUploads(uploads);
  };

  const formatFileSize = (size) => {
    if (!size && size !== 0) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const paginate = (items, page = 1, pageSize = 8) => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const start = (currentPage - 1) * pageSize;

    return {
      items: items.slice(start, start + pageSize),
      currentPage,
      totalPages,
      totalItems: items.length,
    };
  };

  const filterRows = (rows, searchTerm) => {
    const term = normalizeKey(searchTerm);
    if (!term) return rows;

    return rows.filter((row) =>
      Object.values(row).some((value) => normalizeKey(value).includes(term))
    );
  };

  const parseCsvLine = (line) => {
    const cells = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          current += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
  };

  const parseCsvFile = async (file) => {
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");

    const headers =
      parseCsvLine(lines[0] || "").map((header, index) => header || `Column ${index + 1}`) || [];

    const rows = lines.slice(1).map((line, index) => {
      const cells = parseCsvLine(line);
      const entry = { __rowId: `row-${index + 1}` };

      headers.forEach((header, columnIndex) => {
        entry[header] = cells[columnIndex] ?? "";
      });

      return entry;
    });

    assertDatasetHasRequiredColumns(headers);

    return {
      sheetName: "CSV Import",
      columns: headers,
      rows,
    };
  };

  const parseWorkbookFile = async (file) => {
    if (file.name.toLowerCase().endsWith(".csv")) {
      return parseCsvFile(file);
    }

    if (typeof XLSX === "undefined") {
      throw new Error("Spreadsheet parser is unavailable. Please retry the upload.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headers =
      matrix[0]?.map((header, index) => {
        const value = String(header ?? "").trim();
        return value || `Column ${index + 1}`;
      }) || [];

    const rows = matrix
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
      .map((row, index) => {
        const entry = { __rowId: `row-${index + 1}` };
        headers.forEach((header, colIndex) => {
          entry[header] = row[colIndex] ?? "";
        });
        return entry;
      });

    assertDatasetHasRequiredColumns(headers);

    return {
      sheetName: firstSheetName,
      columns: headers,
      rows,
    };
  };

  const createUploadRecord = (file, dataset) => ({
    id: createId(),
    name: file.name,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    sheetName: dataset.sheetName,
    columns: dataset.columns,
    rows: dataset.rows,
  });

  const valueFromInput = (source, aliases) => {
    const entries = source instanceof FormData ? Object.fromEntries(source.entries()) : source;
    const normalizedAliases = aliases.map(normalizeKey);

    for (const [key, value] of Object.entries(entries || {})) {
      if (normalizedAliases.includes(normalizeKey(key))) {
        return value;
      }
    }

    return "";
  };

  const numberValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const boolValue = (value) => {
    const normalized = normalizeKey(value);
    return ["yes", "positive", "true", "1"].includes(normalized);
  };

  const computePrediction = (source) => {
    let score = 0.18;
    const contributions = [];

    const patientName =
      valueFromInput(source, ["name", "full name", "patient name"]) || "This patient";
    const consultationReason =
      valueFromInput(source, ["consultation reason", "reason"]) || "Not specified";
    const age = numberValue(valueFromInput(source, ["age", "patient age"]));
    const tsh = numberValue(valueFromInput(source, ["tsh"]));
    const ft4 = numberValue(valueFromInput(source, ["ft4", "free t4"]));
    const tsiLevel = numberValue(valueFromInput(source, ["tsi level"]));
    const duration = numberValue(
      valueFromInput(source, ["duration of treatment", "duration", "treatment duration"])
    );

    const applyContribution = (label, amount, condition) => {
      if (!condition) return;
      score += amount;
      contributions.push({ label, amount });
    };

    applyContribution("Age below 30 years", 0.05, age > 0 && age < 30);
    applyContribution("Reported stress", 0.05, boolValue(valueFromInput(source, ["stress"])));
    applyContribution(
      "Palpitations present",
      0.05,
      boolValue(valueFromInput(source, ["palpitations"]))
    );
    applyContribution("Tremors present", 0.04, boolValue(valueFromInput(source, ["tremors"])));
    applyContribution(
      "Muscle weakness",
      0.04,
      boolValue(valueFromInput(source, ["muscle weakness"]))
    );
    applyContribution("Goiter on examination", 0.08, boolValue(valueFromInput(source, ["goiter"])));
    applyContribution(
      "Advanced goiter classification",
      0.06,
      ["2", "3"].includes(String(valueFromInput(source, ["goiter classification"])).trim())
    );
    applyContribution(
      "Positive Anti-TPO",
      0.04,
      boolValue(valueFromInput(source, ["anti tpo", "anti-tpo"]))
    );
    applyContribution("Positive TSI", 0.1, boolValue(valueFromInput(source, ["tsi"])));
    applyContribution("Elevated TSI level", 0.08, tsiLevel > 2);
    applyContribution("Elevated FT4", 0.08, ft4 > 1.8);
    applyContribution("Suppressed TSH", 0.08, tsh < 0.4 && tsh !== 0);
    applyContribution(
      "Ultrasound: goiter with nodules",
      0.07,
      normalizeKey(valueFromInput(source, ["ultrasound"])) === "goiter nodules"
    );
    applyContribution(
      "Scintigraphy: high uptake",
      0.07,
      normalizeKey(valueFromInput(source, ["scintigraphy"])) === "high uptake"
    );
    applyContribution(
      "Scintigraphy: hot nodule",
      0.06,
      normalizeKey(valueFromInput(source, ["scintigraphy"])) === "hot nodule"
    );
    applyContribution(
      "Block and replace therapy",
      0.03,
      boolValue(valueFromInput(source, ["block and replace", "block replace"]))
    );
    applyContribution("Longer treatment duration", -0.05, duration >= 18 && duration <= 96);
    applyContribution("Surgery performed", -0.09, boolValue(valueFromInput(source, ["surgery"])));
    applyContribution(
      "Radioactive iodine performed",
      -0.08,
      boolValue(valueFromInput(source, ["radioactive iodine"]))
    );

    const probability = Math.max(8, Math.min(92, Math.round(score * 100)));
    const relapse = probability >= 50;
    const sortedContributions = contributions
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 5);

    return {
      patientName,
      consultationReason,
      duration,
      probability,
      relapse,
      contributions: sortedContributions,
    };
  };

  const predictionBadge = (result) => {
    if (!result.relapse) {
      return {
        label: "Will Not Relapse",
        tone: "safe",
      };
    }

    return {
      label: "Will Relapse",
      tone: "relapse",
    };
  };

  return {
    clone,
    loadUploads,
    addUpload,
    getUploadById,
    deleteUpload,
    formatFileSize,
    paginate,
    filterRows,
    parseWorkbookFile,
    createUploadRecord,
    computePrediction,
    predictionBadge,
    initRowStorage,
  };
})();

window.NoufarApp = NoufarApp;
