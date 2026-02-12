require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const jiraBaseUrl = process.env.JIRA_BASE_URL || "";
const jiraEmail = process.env.JIRA_EMAIL || "";
const jiraToken = process.env.JIRA_API_TOKEN || "";
const defaultFieldName = process.env.JIRA_GHERKIN_FIELD || "Details";
const defaultIssueType = process.env.JIRA_ISSUE_TYPE || "Classic Test";

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", (req, res) => {
  res.json({ jiraBaseUrl });
});

app.get("/api/fields", async (req, res) => {
  try {
    if (!jiraBaseUrl || !jiraEmail || !jiraToken) {
      return res.status(500).json({
        error: "Missing JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN on server",
      });
    }

    const query = String(req.query.query || "").trim().toLowerCase();
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");

    const response = await fetch(`${jiraBaseUrl}/rest/api/3/field`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Jira API error",
        status: response.status,
        details: text,
      });
    }

    const fields = await response.json();
    const filtered = query
      ? fields.filter((item) => String(item.name || "").toLowerCase().includes(query))
      : fields;

    res.json(
      filtered.map((item) => ({
        id: item.id,
        name: item.name,
        custom: item.custom || false,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Unexpected server error", details: String(error) });
  }
});

app.get("/api/issue-fields", async (req, res) => {
  try {
    if (!jiraBaseUrl || !jiraEmail || !jiraToken) {
      return res.status(500).json({
        error: "Missing JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN on server",
      });
    }

    const issueKey = String(req.query.issueKey || "").trim();
    if (!issueKey) {
      return res.status(400).json({ error: "issueKey is required" });
    }

    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
    const url = new URL(`${jiraBaseUrl}/rest/api/3/issue/${issueKey}`);
    url.searchParams.set("expand", "names");

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Jira API error",
        status: response.status,
        details: text,
      });
    }

    const data = await response.json();
    const names = data.names || {};
    const fields = data.fields || {};

    const results = Object.keys(fields)
      .filter((id) => !isEmptyField(fields[id]))
      .map((id) => ({
        id,
        name: names[id] || id,
        preview: previewValue(fields[id]),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ issueKey, fields: results });
  } catch (error) {
    res.status(500).json({ error: "Unexpected server error", details: String(error) });
  }
});

app.get("/api/steps", async (req, res) => {
  try {
    if (!jiraBaseUrl || !jiraEmail || !jiraToken) {
      return res.status(500).json({
        error: "Missing JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN on server",
      });
    }

    const projectKey = String(req.query.projectKey || "").trim();
    const field = String(req.query.field || defaultFieldName).trim();
    const limit = Number(req.query.limit || 500);
    let jql = String(req.query.jql || "").trim();

    if (!jql) {
      if (!projectKey) {
        return res.status(400).json({ error: "projectKey or jql is required" });
      }
      const issueTypeClause = defaultIssueType
        ? ` AND issuetype = "${escapeJqlString(defaultIssueType)}"`
        : "";
      jql = `project = ${projectKey}${issueTypeClause} ORDER BY updated DESC`;
    }

    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");

    const resolvedField = await resolveFieldId(field, {
      jiraBaseUrl,
      auth,
    });

    if (!resolvedField) {
      return res.status(400).json({
        error: `Field not found in Jira: ${field}`,
      });
    }

    let startAt = 0;
    const maxResults = 50;
    let total = 0;
    const issues = [];

    while (true) {
      const url = new URL(`${jiraBaseUrl}/rest/api/3/search`);
      url.searchParams.set("jql", jql);
      url.searchParams.set("startAt", String(startAt));
      url.searchParams.set("maxResults", String(maxResults));
      url.searchParams.set("fields", ["summary", resolvedField].join(","));

      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({
          error: "Jira API error",
          status: response.status,
          details: text,
        });
      }

      const data = await response.json();
      total = data.total || 0;

      const batch = data.issues || [];
      issues.push(...batch);

      if (issues.length >= total || issues.length >= limit) {
        break;
      }

      startAt += maxResults;
    }

    const stepsMap = new Map();

    for (const issue of issues) {
      const key = issue.key;
      const fields = issue.fields || {};
      const text = fields[resolvedField] || "";
      const steps = extractSteps(text);

      for (const step of steps) {
        const normalized = step.trim();
        if (!stepsMap.has(normalized)) {
          stepsMap.set(normalized, { step: normalized, count: 0, issues: [] });
        }
        const entry = stepsMap.get(normalized);
        entry.count += 1;
        if (!entry.issues.includes(key)) {
          entry.issues.push(key);
        }
      }
    }

    const steps = Array.from(stepsMap.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.step.localeCompare(b.step);
    });

    res.json({
      projectKey,
      field: resolvedField,
      totalIssues: issues.length,
      totalSteps: steps.length,
      steps,
    });
  } catch (error) {
    res.status(500).json({ error: "Unexpected server error", details: String(error) });
  }
});

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

async function resolveFieldId(fieldName, { jiraBaseUrl, auth }) {
  if (!fieldName) return null;

  const normalized = fieldName.trim();
  const lower = normalized.toLowerCase();
  const directFields = new Set(["description", "summary"]);

  if (directFields.has(lower) || normalized.startsWith("customfield_")) {
    return normalized;
  }

  const response = await fetch(`${jiraBaseUrl}/rest/api/3/field`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const fields = await response.json();
  const exactMatch = fields.find(
    (item) => String(item.name || "").toLowerCase() === lower
  );
  if (exactMatch) return exactMatch.id;

  const partialMatch = fields.find((item) =>
    String(item.name || "").toLowerCase().includes(lower)
  );

  return partialMatch ? partialMatch.id : null;
}

function escapeJqlString(value) {
  return String(value).replace(/"/g, "\\\"");
}

function isEmptyField(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function previewValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 200)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (typeof value === "object") {
    return "Object";
  }
  return "";
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
