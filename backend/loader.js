'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Order matters for the /api/health "sources" list and matches ARCHITECTURE.md §4.3.
const SOURCE_FILES = [
  'together-ai-complaints.json',
  'fireworks-ai-complaints.json',
  'tinker-api-complaints.json',
  'azure-kubernetes-service-complaints.json',
  'azure-machine-learning-complaints.json',
  'openai-complaints.json',
];

/**
 * Read the pre-collected JSON files from disk and return the combined raw
 * complaints, each tagged with the top-level `provider` from its file.
 *
 * @param {string} [dataDir] override the data directory (used by tests)
 * @returns {{ provider: string, raw: object }[]}
 */
function loadRaw(dataDir = DATA_DIR) {
  const records = [];

  for (const file of SOURCE_FILES) {
    const fullPath = path.join(dataDir, file);
    if (!fs.existsSync(fullPath)) continue; // a configured source file may not exist in every dataset (e.g. test fixtures)
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const provider = parsed.provider;
    const complaints = Array.isArray(parsed.complaints) ? parsed.complaints : [];

    for (const raw of complaints) {
      records.push({ provider, raw });
    }
  }

  return records;
}

module.exports = { loadRaw, SOURCE_FILES, DATA_DIR };
