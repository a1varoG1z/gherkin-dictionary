const stepsList = document.getElementById("stepsList");
const summary = document.getElementById("summary");
const projectInfo = document.getElementById("projectInfo");
const statusEl = document.getElementById("status");
const modeNote = document.getElementById("modeNote");
const stepQueryInput = document.getElementById("stepQuery");
const similarityEl = document.getElementById("similarity");
const filtersEl = document.querySelectorAll(".filter-btn");
const sortByEl = document.getElementById("sortBy");
const testCaseFilterEl = document.getElementById("testCaseFilter");

let jiraBaseUrl = "";
let agileTestBaseUrl = "";
let projectId = "";
let allSteps = [];
let filteredSteps = [];
let selectedKeyword = "all";
let selectedSort = "relevance";
let selectedTestCase = "";
let searchHistory = [];
const MAX_HISTORY = 8;
const STORAGE_KEY = "gherkin-search-history";

// Load search history from localStorage
function loadSearchHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      searchHistory = JSON.parse(saved);
    }
  } catch (e) {
    console.warn("Failed to load search history:", e);
  }
}

// Save search history to localStorage
function saveSearchHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searchHistory));
  } catch (e) {
    console.warn("Failed to save search history:", e);
  }
}

loadSearchHistory();

if (stepQueryInput) {
  stepQueryInput.addEventListener("input", debounce(handleSearch, 300));
  stepQueryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  });
  
  // Search history listeners
  stepQueryInput.addEventListener("focus", showSearchHistory);
  stepQueryInput.addEventListener("blur", () => {
    setTimeout(hideSearchHistory, 200); // Delay to allow click on history item
  });
}

// Filter buttons
filtersEl.forEach((btn) => {
  btn.addEventListener("click", () => {
    filtersEl.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedKeyword = btn.dataset.keyword;
    handleSearch();
  });
});

// Sort selector
if (sortByEl) {
  sortByEl.addEventListener("change", (e) => {
    selectedSort = e.target.value;
    handleSearch();
  });
}

// Test case filter
if (testCaseFilterEl) {
  testCaseFilterEl.addEventListener("change", (e) => {
    selectedTestCase = e.target.value;
    handleSearch();
  });
}

// Sync button handler
const syncBtn = document.getElementById("syncBtn");
if (syncBtn) {
  syncBtn.addEventListener("click", async () => {
    if (!confirm("This will trigger a data refresh from AgileTest. The page will reload when complete. Continue?")) {
      return;
    }

    syncBtn.disabled = true;
    syncBtn.classList.add("syncing");
    syncBtn.textContent = "🔄 Syncing...";

    try {
      // GitHub repository dispatch requires a Personal Access Token
      // This token must be stored as GITHUB_TOKEN secret in repository settings
      const response = await fetch("https://api.github.com/repos/alvaro-gonzalez_izertis/gherkin-dictionary/dispatches", {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "Authorization": `token ${getGitHubToken()}`
        },
        body: JSON.stringify({
          event_type: "refresh-data"
        })
      });

      if (response.status === 204) {
        alert("✅ Sync triggered! The page will update in a few minutes. You'll need to refresh manually.");
      } else {
        throw new Error(`GitHub API responded with status ${response.status}`);
      }
    } catch (error) {
      console.error("Sync error:", error);
      alert("❌ Failed to trigger sync. Check console for details.");
    } finally {
      syncBtn.disabled = false;
      syncBtn.classList.remove("syncing");
      syncBtn.textContent = "🔄 Sync";
    }
  });
}

// Get GitHub token from localStorage or prompt user
// Note: For security, this should ideally be handled server-side
function getGitHubToken() {
  let token = localStorage.getItem("github_token");
  if (!token) {
    token = prompt("Enter your GitHub Personal Access Token (with 'repo' scope):\n\nThis will be stored locally for future syncs.");
    if (token) {
      localStorage.setItem("github_token", token);
    }
  }
  return token;
}

init();

async function init() {
  try {
    console.log("Initializing app...");
    console.log("DOM elements check:", {
      stepsList: !!stepsList,
      summary: !!summary,
      statusEl: !!statusEl,
      modeNote: !!modeNote,
      stepQueryInput: !!stepQueryInput,
    });
    
    const staticData = await fetchStaticData();
    
    if (!staticData) {
      setStatus("Failed to load data.json. Refresh the page.", true);
      console.warn("No static data available");
      return;
    }

    console.log("Static data loaded:", {
      totalSteps: staticData.totalSteps,
      totalIssues: staticData.totalIssues,
      stepsArrayLength: staticData.steps?.length || 0,
      jiraBaseUrl: staticData.jiraBaseUrl,
      generatedAt: staticData.generatedAt,
    });

    jiraBaseUrl = staticData.jiraBaseUrl || jiraBaseUrl;
    agileTestBaseUrl = staticData.agileTestBaseUrl || agileTestBaseUrl;
    projectId = staticData.projectId || projectId;
    allSteps = staticData.steps || [];
    
    if (!allSteps.length) {
      setStatus("No steps found in data. Generate with 'npm run generate'.", true);
      console.warn("Steps array is empty");
      return;
    }
    
    console.log(`Rendering ${allSteps.length} steps...`);
    populateTestCaseFilter();
    renderSummary(staticData);
    updateMetrics(staticData);
    renderSteps(allSteps);
    setStatus("Snapshot loaded. Type to search steps.");
    setModeNote(`Updated ${formatDate(staticData.generatedAt)}`);
    console.log("App initialization complete!");
  } catch (error) {
    console.error("Init error:", error);
    setStatus("Error loading snapshot. Check browser console.", true);
  }
}

async function fetchStaticData() {
  try {
    console.log("Fetching data.json...");
    const response = await fetch("/data.json", { cache: "no-store" });
    console.log("Fetch response status:", response.status, response.statusText);
    
    if (!response.ok) {
      console.warn("data.json not found (404 or error). This is OK on first load.", response.status);
      return null;
    }
    
    const data = await response.json();
    console.log("Parsed data.json successfully");
    
    if (!data || !Array.isArray(data.steps)) {
      console.warn("data.json missing or invalid steps array", {
        hasData: !!data,
        hasSteps: data?.steps !== undefined,
        isArray: Array.isArray(data?.steps),
      });
      return null;
    }
    
    console.log("data.json validation passed");
    return data;
  } catch (error) {
    console.error("Error fetching data.json:", error);
    return null;
  }
}

// Format timestamp as relative time (e.g., "5 minutes ago")
function formatTimeAgo(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

// Escape HTML special characters to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Display search history dropdown
function showSearchHistory() {
  const searchHistoryEl = document.getElementById("searchHistory");
  if (!searchHistoryEl || searchHistory.length === 0) return;

  let html = "";
  searchHistory.forEach((item, index) => {
    const timeAgo = formatTimeAgo(item.timestamp);
    html += `
      <div class="search-history-item">
        <span class="search-history-text">${escapeHtml(item.query)}</span>
        <span class="search-history-time">${timeAgo}</span>
        <button class="search-history-delete" data-index="${index}" aria-label="Delete">×</button>
      </div>
    `;
  });

  searchHistoryEl.innerHTML = html;
  searchHistoryEl.style.display = "block";

  // Add event listeners to history items
  searchHistoryEl.querySelectorAll(".search-history-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (!e.target.classList.contains("search-history-delete")) {
        const index = item.querySelector(".search-history-delete").dataset.index;
        selectSearchHistory(index);
      }
    });
  });

  // Add event listeners to delete buttons
  searchHistoryEl.querySelectorAll(".search-history-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const index = btn.dataset.index;
      searchHistory.splice(index, 1);
      saveSearchHistory();
      showSearchHistory(); // Refresh display
    });
  });
}

// Hide search history dropdown
function hideSearchHistory() {
  const searchHistoryEl = document.getElementById("searchHistory");
  if (searchHistoryEl) {
    searchHistoryEl.style.display = "none";
  }
}

// Select a search from history
function selectSearchHistory(index) {
  if (searchHistory[index]) {
    stepQueryInput.value = searchHistory[index].query;
    handleSearch();
    hideSearchHistory();
  }
}

function handleSearch() {
  const query = (stepQueryInput.value || "").trim().toLowerCase();
  
  // Save to search history if query is not empty
  if (query) {
    const existingIndex = searchHistory.findIndex((item) => item.query === query);
    if (existingIndex > -1) {
      // Move to top if already exists
      searchHistory.splice(existingIndex, 1);
    }
    searchHistory.unshift({ query, timestamp: new Date().toISOString() });
    searchHistory = searchHistory.slice(0, MAX_HISTORY);
    saveSearchHistory();
  }
  
  if (!query && !selectedTestCase) {
    // No query and no test case filter: show all steps that match keyword filter, apply sort
    const keywordFiltered = applyKeywordFilter(allSteps);
    filteredSteps = applySorting(keywordFiltered, "");
    renderSteps(filteredSteps);
    similarityEl.classList.remove("show");
    return;
  }

  // Extract parameters from query (e.g., "login" "user")
  const params = extractParameters(query);
  const queryWithoutParams = removeParameters(query);

  // Map steps with similarity and filtering
  const mapped = allSteps
    .map((item) => ({
      ...item,
      similarity: calculateSimilarity(queryWithoutParams, item.step.toLowerCase(), params),
    }))
    .filter((item) => {
      // Keyword filter
      if (selectedKeyword !== "all") {
        const firstWord = item.step.split(/\s+/)[0];
        if (firstWord !== selectedKeyword) return false;
      }
      
      // Test case filter
      if (selectedTestCase) {
        if (!item.testCases) return false;
        const matches = item.testCases.some((tc) => (tc.name || tc.id) === selectedTestCase);
        if (!matches) return false;
      }
      
      // Similarity filter
      if (query && item.similarity <= 30) return false;
      
      return true;
    });

  // Apply sorting
  filteredSteps = applySorting(mapped, queryWithoutParams);

  // Update UI
  if (filteredSteps.length === 0) {
    similarityEl.classList.add("show");
    const msg = selectedTestCase
      ? `No matches in test case: ${selectedTestCase}`
      : "No matches found. Try simpler terms or different keywords.";
    similarityEl.innerHTML = `<strong>${msg}</strong>`;
  } else if (query) {
    const top = filteredSteps[0];
    const topSim = top.similarity;
    similarityEl.classList.add("show");
    similarityEl.innerHTML = `Found <strong>${filteredSteps.length}</strong> steps. Top match: <strong>${topSim}%</strong> similar.`;
  } else {
    similarityEl.classList.remove("show");
  }

  renderSteps(filteredSteps);
}

function extractParameters(query) {
  const paramRegex = /"([^"]+)"/g;
  const params = [];
  let match;
  while ((match = paramRegex.exec(query))) {
    params.push(match[1].toLowerCase());
  }
  return params;
}

function removeParameters(query) {
  return query.replace(/"[^"]*"/g, "").trim();
}

function applyKeywordFilter(steps) {
  if (selectedKeyword === "all") return steps;
  return steps.filter((item) => {
    const firstWord = item.step.split(/\s+/)[0];
    return firstWord === selectedKeyword;
  });
}

function applySorting(steps, query) {
  const copy = [...steps];

  if (selectedSort === "frequency") {
    return copy.sort((a, b) => b.count - a.count);
  } else if (selectedSort === "alphabetic") {
    return copy.sort((a, b) => a.step.localeCompare(b.step));
  } else if (selectedSort === "reuse") {
    return copy.sort((a, b) => {
      const reuseA = (a.count / (allSteps.length / 9)) * 100;
      const reuseB = (b.count / (allSteps.length / 9)) * 100;
      return reuseB - reuseA;
    });
  } else {
    // relevance (default)
    return copy.sort((a, b) => {
      if (query && b.similarity !== a.similarity) {
        return b.similarity - a.similarity;
      }
      return b.count - a.count;
    });
  }
}

function calculateSimilarity(query, target, params = []) {
  if (!query) return 50;

  // Check if all parameters are present in the target
  const allParamsPresent = params.length === 0 || params.every((p) => target.includes(p));
  if (params.length > 0 && !allParamsPresent) return 0;

  // Exact match
  if (target === query) return 100;

  // Contains
  if (target.includes(query)) {
    const ratio = query.length / target.length;
    const base = 75 + ratio * 25;
    return Math.round(base + (allParamsPresent ? 10 : 0));
  }

  // Word overlap
  const queryWords = query.split(/\s+/).filter((w) => w);
  const targetWords = target.split(/\s+/);
  const matches = queryWords.filter((w) =>
    targetWords.some((tw) => tw.includes(w) || w.includes(tw))
  ).length;

  if (matches === 0) return 0;

  const similarity = (matches / Math.max(queryWords.length, targetWords.length)) * 100;
  const base = Math.round(similarity);
  return base + (allParamsPresent ? 10 : 0);
}

function populateTestCaseFilter() {
  if (!testCaseFilterEl) return;

  // Get unique test cases from allSteps
  const testCasesSet = new Set();
  for (const step of allSteps) {
    if (step.testCases) {
      for (const tc of step.testCases) {
        testCasesSet.add(tc.name || tc.id);
      }
    }
  }

  const testCases = Array.from(testCasesSet).sort();

  // Clear existing options except the first one
  while (testCaseFilterEl.options.length > 1) {
    testCaseFilterEl.remove(1);
  }

  // Add test case options
  for (const testCaseName of testCases) {
    const option = document.createElement("option");
    option.value = testCaseName;
    option.textContent = testCaseName;
    testCaseFilterEl.appendChild(option);
  }
}

function renderSummary(data) {
  try {
    if (!summary) {
      console.error("Summary element not found");
      return;
    }
    summary.textContent = `${data.totalSteps} unique steps from ${data.totalIssues} test cases`;
    console.log(`Summary: ${data.totalSteps} unique steps from ${data.totalIssues} test cases`);
    
    // Display project info if available
    if (projectInfo && data.projectName) {
      projectInfo.innerHTML = `<strong>Jira Project:</strong> ${data.projectName} &nbsp;&nbsp;|&nbsp;&nbsp; Search and discover Gherkin steps across your test suite.`;
    } else if (projectInfo && data.projectId) {
      projectInfo.innerHTML = `<strong>Jira Project ID:</strong> ${data.projectId} &nbsp;&nbsp;|&nbsp;&nbsp; Search and discover Gherkin steps across your test suite.`;
    }
  } catch (error) {
    console.error("Error in renderSummary:", error);
  }
}

function updateMetrics(data) {
  try {
    const steps = data.steps || [];
    const totalSteps = steps.length;
    const totalIssues = data.totalIssues || 0;
    
    const reuseCounts = steps.map((s) => s.count || 1);
    const avgReuse = reuseCounts.length > 0 ? Math.round((reuseCounts.reduce((a, b) => a + b) / reuseCounts.length) * 10) / 10 : 0;
    const highReuse = steps.filter((s) => (s.count || 1) >= 3).length;

    const metricStepsEl = document.getElementById("metricSteps");
    const metricIssuesEl = document.getElementById("metricIssues");
    const metricReuseEl = document.getElementById("metricReuse");
    const metricHighReuseEl = document.getElementById("metricHighReuse");

    if (metricStepsEl) metricStepsEl.textContent = totalSteps;
    if (metricIssuesEl) metricIssuesEl.textContent = totalIssues;
    if (metricReuseEl) metricReuseEl.textContent = `${avgReuse}x`;
    if (metricHighReuseEl) metricHighReuseEl.textContent = highReuse;

    console.log(`Metrics: ${totalSteps} steps, ${totalIssues} issues, ${avgReuse}x avg reuse, ${highReuse} high reuse`);
  } catch (error) {
    console.error("Error in updateMetrics:", error);
  }
}

function renderSteps(steps) {
  console.log("renderSteps called with", steps?.length || 0, "steps");
  
  if (!stepsList) {
    console.error("stepsList element not found in DOM");
    return;
  }

  if (!steps || !steps.length) {
    console.log("No steps to render, showing empty message");
    stepsList.innerHTML = "<li class='step'><span class='step-text'>No steps found.</span></li>";
    return;
  }

  console.log(`Rendering ${steps.length} steps...`);
  stepsList.innerHTML = ""; // Clear first

  const fragment = document.createDocumentFragment();
  const totalTestCases = 9; // Based on data.json, we have 9 test cases

  for (const item of steps) {
    const li = document.createElement("li");
    li.className = "step";

    const text = document.createElement("div");
    text.className = "step-text";
    text.textContent = item.step;

    const meta = document.createElement("div");
    meta.className = "step-meta";
    
    // Reuse statistics
    const reusePercent = Math.round((item.count / totalTestCases) * 100);
    const reuseIntensity = item.count >= 5 ? "🔥" : item.count >= 3 ? "🌟" : "";
    
    const countSpan = document.createElement("span");
    countSpan.className = "step-reuse";
    countSpan.textContent = `${item.count} test(s) ${reuseIntensity}`;
    
    const descSpan = document.createElement("span");
    descSpan.textContent = `${reusePercent}% reuse • Used in ${item.count} test case${item.count !== 1 ? "s" : ""}`;
    
    meta.appendChild(countSpan);
    meta.appendChild(descSpan);

    const details = document.createElement("div");
    details.className = "step-details";
    
    if (item.testCases && item.testCases.length > 0) {
      const linksLabel = document.createElement("div");
      linksLabel.style.fontSize = "11px";
      linksLabel.style.fontWeight = "600";
      linksLabel.style.marginBottom = "8px";
      linksLabel.style.color = "var(--muted)";
      linksLabel.textContent = "Used in:";
      
      const links = document.createElement("div");
      links.className = "step-links";
      
      for (const testCase of item.testCases) {
        const link = document.createElement("a");
        link.className = "step-link";
        link.textContent = testCase.name || testCase.id;
        
        // Build AgileTest plugin URL on Jira
        if (jiraBaseUrl && projectId && testCase.issueId) {
          const baseUrl = jiraBaseUrl.replace(/\/+$/, '');
          link.href = `${baseUrl}/plugins/servlet/ac/com.devsamurai.plugin.jira.agile-test/main-page?ac.projectId=${projectId}#!selectedIssueId=${testCase.issueId}&pluginPage=testCases`;
        } else if (jiraBaseUrl && projectId) {
          const baseUrl = jiraBaseUrl.replace(/\/+$/, '');
          link.href = `${baseUrl}/plugins/servlet/ac/com.devsamurai.plugin.jira.agile-test/main-page?ac.projectId=${projectId}`;
        } else {
          link.href = "#";
        }
        
        link.target = "_blank";
        link.rel = "noreferrer";
        links.appendChild(link);
      }
      
      details.appendChild(linksLabel);
      details.appendChild(links);
    }

    if (item.similarity !== undefined) {
      const simDiv = document.createElement("div");
      simDiv.className = "step-similarity";
      simDiv.textContent = `Similarity: ${item.similarity}%`;
      details.appendChild(simDiv);
    }

    li.appendChild(text);
    li.appendChild(meta);
    li.appendChild(details);
    
    li.addEventListener("click", () => {
      li.classList.toggle("expanded");
    });
    
    fragment.appendChild(li);
  }

  stepsList.appendChild(fragment);
  console.log(`Successfully rendered ${steps.length} steps to DOM`);
}

function setStatus(message, isError = false) {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = isError ? "status error" : "status";
  } else {
    console.warn("statusEl not found, but message:", message);
  }
}

function setModeNote(message) {
  if (modeNote) {
    modeNote.textContent = message;
  } else {
    console.warn("modeNote not found, but message:", message);
  }
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", { 
    year: "numeric", 
    month: "short", 
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
