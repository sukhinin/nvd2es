const fs = require('fs');
const assert = require('assert').strict;

const cvssValuesMap = {
  'AV': {
    key: 'attack.vector',
    values: { 'P': 'physical', 'L': 'local', 'A': 'adjacent_network', 'N': 'network' }
  },
  'AC': {
    key: 'attack.complexity',
    values: { 'H': 'high', 'M': 'medium', 'L': 'low' }
  },
  'Au': {
    key: 'attack.authentication',
    values: { 'M': 'multiple', 'S': 'single', 'N': 'none' }
  },
  'PR': {
    key: 'attack.privileges_required',
    values: { 'H': 'high', 'L': 'low', 'N': 'none' }
  },
  'UI': {
    key: 'attack.user_interaction',
    values: { 'N': 'none', 'R': 'required' }
  },
  'S': {
    key: 'attack.scope',
    values: { 'U': 'unchanged', 'C': 'changed' }
  },
  'C': {
    key: 'impact.confidentiality',
    values: { 'N': 'none', 'L': 'low', 'H': 'high', 'P': 'partial', 'C': 'complete' }
  },
  'I': {
    key: 'impact.integrity',
    values: { 'N': 'none', 'L': 'low', 'H': 'high', 'P': 'partial', 'C': 'complete' }
  },
  'A': {
    key: 'impact.availability',
    values: { 'N': 'none', 'L': 'low', 'H': 'high', 'P': 'partial', 'C': 'complete' }
  }
};

function mapCveItem(item) {
  assert.strictEqual(item.cve.data_type, 'CVE');
  assert.strictEqual(item.cve.data_format, 'MITRE');
  assert.strictEqual(item.cve.data_version, '4.0');

  const cve = item.cve.CVE_data_meta.ID;
  const published = Date.parse(item.publishedDate);
  const updated = Date.parse(item.lastModifiedDate);

  const description = mapCveDescription(item);
  const impact = mapCveImpact(item);
  const products = mapCveAffectedProducts(item);

  return { cve, published, updated, description, ...impact, products };
}

function mapCveDescription(item) {
  for (data of item.cve.description.description_data) {
    if (data.lang === 'en') {
      return data.value;
    }
  }

  return item.cve.description.description_data[0].value;
}

function mapCveImpact(item) {
  if (item.impact.baseMetricV3) {
    const metric = item.impact.baseMetricV3;
    return mapCveImpactMetricV3(metric);
  }

  if (item.impact.baseMetricV2) {
    const metric = item.impact.baseMetricV2;
    return mapCveImpactMetricV2(metric);
  }

  return {};
}

function mapCveImpactMetricV3(metric) {
  const version = metric.cvssV3.version;
  assert(version === '3.0' || version === '3.1');

  const score = metric.cvssV3.baseScore;
  const vector = metric.cvssV3.vectorString;
  const severity = metric.cvssV3.baseSeverity;

  return { score, cvss: vector, ...parseCvssVector(vector), severity };
}

function mapCveImpactMetricV2(metric) {
  assert.strictEqual(metric.cvssV2.version, '2.0');

  const score = metric.cvssV2.baseScore;
  const vector = metric.cvssV2.vectorString;
  const severity = metric.severity;

  return { score, cvss: vector, ...parseCvssVector(vector), severity };
}

function parseCvssVector(vector) {
  const parsedVector = {};
  for (const component of vector.split('/')) {
    const [k, v] = component.split(':');
    const mappedKey = cvssValuesMap[k]?.key;
    const mappedValue = cvssValuesMap[k]?.values[v];
    if (mappedKey && mappedValue) {
      parsedVector[mappedKey] = mappedValue;
    }
  }
  return parsedVector;
}

function mapCveAffectedProducts(item) {
  assert.strictEqual(item.configurations.CVE_data_version, '4.0');

  if (item.configurations.nodes && item.configurations.nodes.length > 0) {
    const node = item.configurations.nodes[0];
    if (node.cpe_match) {
      return mapCpeMatchNodeArray(node.cpe_match);
    }
    if (node.children && node.children.length > 0 && node.children[0].cpe_match) {
      return mapCpeMatchNodeArray(node.children[0].cpe_match);
    }
  }

  return [];
}

function mapCpeMatchNodeArray(nodes) {
  const products = new Set();
  for (node of nodes) {
    if (node.vulnerable) {
      const entry = node.cpe23Uri.split(':').slice(3, 5).filter(s => s !== '*').join(':');
      products.add(entry);
    }
  }
  return Array.from(products);
}

function isNotRejected(item) {
  return !item.description.startsWith('** REJECT **');
}

function compareByUpdatedTimestamp(item1, item2) {
  return item2.updated - item1.updated;
}

const inputFilePath = process.argv[2] || './nvdcve-1.1-modified.json';
const outputFilePath = process.argv[3] || './nvdcve-mapped.json';

const input = fs.readFileSync(inputFilePath);
const json = JSON.parse(input);

assert.strictEqual(json.CVE_data_type, 'CVE');
assert.strictEqual(json.CVE_data_version, '4.0');
const items = json.CVE_Items.map(mapCveItem).filter(isNotRejected);
items.sort(compareByUpdatedTimestamp);

const output = items.flatMap(it => [{ index: { _id: it.cve } }, it]).map(JSON.stringify).join('\n') + '\n';
fs.writeFileSync(outputFilePath, output);
