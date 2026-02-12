require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");

const authBaseUrl = process.env.AGILETEST_AUTH_BASE_URL || "";
const apiBaseUrl = process.env.AGILETEST_API_BASE_URL || authBaseUrl;
const clientId = process.env.AGILETEST_CLIENT_ID || "";
const clientSecret = process.env.AGILETEST_CLIENT_SECRET || "";
const projectId = (process.env.AGILETEST_PROJECT_ID || "").trim();
const projectName = process.env.PROJECT_NAME || ""; // Optional project name
const limit = Number(process.env.AGILETEST_LIMIT || 500);
const outputFile = process.env.OUTPUT_FILE || path.join("public", "data.json");
const jiraBaseUrl = process.env.JIRA_BASE_URL || "";

async function main() {
  if (!authBaseUrl || !clientId || !clientSecret || !projectId) {
    console.error(
      "Missing AGILETEST_AUTH_BASE_URL, AGILETEST_CLIENT_ID, AGILETEST_CLIENT_SECRET, or AGILETEST_PROJECT_ID"
    );
    process.exit(1);
  }

  const token = await authenticate();
  const testCases = await fetchTestCases({ token });
  const stepsMap = new Map();

  for (const testCase of testCases) {
    const testCaseId = testCase.id || testCase.testCaseId || testCase.testcaseId;
    if (!testCaseId) continue;

    const testCaseName = extractTestCaseName(testCase);
    const issueId = extractIssueId(testCase);
    const steps = await fetchTestCaseSteps({ token, testCaseId });

    for (const step of steps) {
      const normalized = step.trim();
      if (!normalized) continue;
      if (!stepsMap.has(normalized)) {
        stepsMap.set(normalized, { step: normalized, count: 0, testCases: [] });
      }
      const entry = stepsMap.get(normalized);
      entry.count += 1;
      if (!entry.testCases.some(tc => tc.id === String(testCaseId))) {
        entry.testCases.push({
          id: String(testCaseId),
          issueId: issueId ? String(issueId) : null,
          name: testCaseName || `Test Case ${testCaseId}`,
        });
      }
    }
  }

  const steps = Array.from(stepsMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.step.localeCompare(b.step);
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    jiraBaseUrl,
    agileTestBaseUrl: apiBaseUrl,
    projectId,
    projectName: projectName || undefined,
    totalIssues: testCases.length,
    totalSteps: steps.length,
    steps,
  };

  const outputPath = path.resolve(outputFile);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

  console.log(`Generated ${steps.length} steps into ${outputPath}`);
}

async function authenticate() {
  const response = await fetch(`${authBaseUrl}/api/apikeys/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`AgileTest auth error ${response.status}: ${text}`);
    process.exit(1);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const token = data.token || data.jwt || data.accessToken;
    if (!token) {
      console.error("AgileTest auth response missing token");
      process.exit(1);
    }
    return token;
  }

  const text = (await response.text()).trim();
  if (!text) {
    console.error("AgileTest auth response missing token");
    process.exit(1);
  }
  return text;
}

let resolvedApiBase = "";

async function fetchTestCases({ token }) {
  const pageSize = 100;
  const results = [];
  let offset = 0;

  const bases = uniqueBases([
    apiBaseUrl,
    authBaseUrl,
    `${stripTrailingSlash(apiBaseUrl)}/api`,
    `${stripTrailingSlash(authBaseUrl)}/api`,
  ]);

  if (!resolvedApiBase) {
    resolvedApiBase = await resolveApiBase({ token, bases });
  }

  while (results.length < limit) {
    const pageLimit = normalizeSearchLimit(
      Math.min(pageSize, limit - results.length)
    );
    const response = await fetch(`${resolvedApiBase}/ds/test-cases/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify({
        projectId,
        offset,
        limit: pageLimit,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`AgileTest search error ${response.status}: ${text}`);
      process.exit(1);
    }

    const data = await response.json();
    const batch = normalizeTestCaseList(data);
    results.push(...batch);

    if (!batch.length) break;
    offset += batch.length;
  }

  return results;
}

async function fetchTestCaseSteps({ token, testCaseId }) {
  const url = new URL(`${resolvedApiBase}/ds/test-cases/${testCaseId}/cucumber`);
  url.searchParams.set("projectId", projectId);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `JWT ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`AgileTest cucumber error ${response.status}: ${text}`);
    return [];
  }

  const data = await response.json();
  const scenario = data.scenario || "";
  return extractSteps(scenario);
}

function normalizeTestCaseList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.testCases)) return data.testCases;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
  return [];
}

function normalizeSteps(data) {
  const steps = Array.isArray(data)
    ? data
    : Array.isArray(data.testSteps)
    ? data.testSteps
    : Array.isArray(data.steps)
    ? data.steps
    : Array.isArray(data.items)
    ? data.items
    : [];

  const lines = [];

  for (const step of steps) {
    const line = formatStep(step);
    if (!line) continue;
    for (const chunk of line.split(/\r?\n/)) {
      const trimmed = chunk.trim();
      if (trimmed) lines.push(trimmed);
    }
  }

  return lines;
}

function formatStep(step) {
  if (!step) return "";
  if (typeof step === "string") return step;

  const textFields = [
    step.gherkin,
    step.text,
    step.description,
    step.action,
    step.expected,
  ].filter(Boolean);

  let text = textFields.find((value) => typeof value === "string") || "";
  if (!text && typeof step === "object") {
    text = String(step.name || "");
  }

  const keyword = typeof step.keyword === "string" ? step.keyword.trim() : "";
  if (keyword && text && !text.startsWith(keyword)) {
    return `${keyword} ${text}`.replace(/\s+/g, " ").trim();
  }

  return String(text).trim();
}

function extractIssueKey(testCase) {
  const candidates = [
    testCase.issueKey,
    testCase.jiraIssueKey,
    testCase.key,
  ];

  for (const value of candidates) {
    const key = normalizeIssueKey(value);
    if (key) return key;
  }

  return "";
}

function extractTestCaseName(testCase) {
  const candidates = [
    testCase.name,
    testCase.testName,
    testCase.title,
    testCase.testCaseName,
  ];

  for (const value of candidates) {
    if (value && typeof value === "string") {
      return value.trim();
    }
  }

  return "";
}

function extractIssueId(testCase) {
  const candidates = [
    testCase.issueId,
    testCase.jiraIssueId,
    testCase.issueKey,
    testCase.jiraIssueKey,
  ];

  for (const value of candidates) {
    if (value) {
      // If it's numeric, return it as is
      const num = Number(value);
      if (!Number.isNaN(num) && num > 0) {
        return String(num);
      }
      // If it's a string like "JIRA-123", try to extract the number
      const match = String(value).match(/(\d+)/);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

function normalizeIssueKey(value) {
  if (!value) return "";
  const text = String(value);
  const match = text.match(/[A-Z][A-Z0-9]+-\d+/i);
  return match ? match[0].toUpperCase() : "";
}

function extractSteps(text) {
  if (!text || typeof text !== "string") return [];
  const lines = text.split(/\r?\n/);
  const steps = [];
  const regex = /^\s*(Given|When|Then|And|But|Dado|Cuando|Entonces|Y|Pero)\b\s*(.*)$/i;

  for (const raw of lines) {
    const match = raw.match(regex);
    if (!match) continue;
    const keyword = normalizeKeyword(match[1]);
    const rest = match[2].trim();
    if (!rest) continue;
    steps.push(`${keyword} ${rest}`.replace(/\s+/g, " ").trim());
  }

  return steps;
}

function normalizeKeyword(word) {
  const lower = String(word).toLowerCase();
  const map = {
    given: "Given",
    when: "When",
    then: "Then",
    and: "And",
    but: "But",
    dado: "Given",
    cuando: "When",
    entonces: "Then",
    y: "And",
    pero: "But",
  };
  return map[lower] || word;
}

async function resolveApiBase({ token, bases }) {
  for (const base of bases) {
    if (!base) continue;
    const response = await fetch(`${base}/ds/test-cases/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `JWT ${token}`,
      },
      body: JSON.stringify({
        projectId,
        offset: 0,
        limit: 10,
      }),
    });

    if (response.ok) {
      return base;
    }

    const text = await response.text();
    if (!isIncorrectPath(text)) {
      console.error(`AgileTest search error ${response.status}: ${text}`);
      process.exit(1);
    }
  }

  console.error("AgileTest API base not found. Check AGILETEST_API_BASE_URL.");
  process.exit(1);
}

function isIncorrectPath(text) {
  return String(text).toLowerCase().includes("incorrect path");
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function uniqueBases(list) {
  const seen = new Set();
  return list
    .map((item) => stripTrailingSlash(item))
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function normalizeSearchLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.max(10, Math.floor(parsed));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
