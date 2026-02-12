# Gherkin Dictionary

Powerful step library for AgileTest. Indexes all Gherkin steps, provides smart search with similarity matching, and displays metrics.

## Features

- 🔍 **Smart Search** – Find steps by keywords with similarity scoring (30-100%)
- 📊 **Metrics** – Reuse rate, high-reuse steps, total coverage
- 🔗 **Direct Links** – Click steps to view test cases in AgileTest/Jira
- 📚 **Gherkin Guide** – Built-in examples and Cucumber docs link
- 🎨 **Branded UI** – Company logo and professional styling
- ⚡ **Fast Snapshot** – Static HTML generated from AgileTest API
- 💾 **Search History** – Remembers last 8 searches for quick access
- 🔄 **Auto-Sync** – Daily updates at midnight + manual sync button
- 🚀 **GitHub Pages** – Deployed automatically via GitHub Actions

## Live URL

Access the live dictionary at:
```
https://alvaro-gonzalez_izertis.github.io/gherkin-dictionary/
```

## Quick Start

### Generate Snapshot Locally

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill your AgileTest credentials in `.env`.

3. Install and generate:
   ```bash
   npm install
   npm run generate
   npm start
   ```

4. Open http://localhost:3000

### Deploy to GitHub Pages

1. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/alvaro-gonzalez_izertis/gherkin-dictionary.git
   git branch -M main
   git push -u origin main
   ```

2. **Configure Secrets** (Settings → Secrets and variables → Actions):
   - `AGILETEST_AUTH_BASE_URL`: https://agiletest.atlas.devsamurai.com
   - `AGILETEST_API_BASE_URL`: https://agiletest.atlas.devsamurai.com
   - `AGILETEST_CLIENT_ID`: Your client ID
   - `AGILETEST_CLIENT_SECRET`: Your client secret
   - `AGILETEST_PROJECT_ID`: Your project ID (e.g., 10033)
   - `JIRA_BASE_URL`: https://your-domain.atlassian.net

3. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Source: GitHub Actions
   - The workflow will auto-deploy on push to `main`

4. **Access Your Site**:
   ```
   https://alvaro-gonzalez_izertis.github.io/gherkin-dictionary/
   ```

### Automated Updates

- **Daily Sync**: Runs automatically every day at midnight (00:00 CET)
- **Manual Trigger**: Click "🔄 Sync" button in the UI or run workflow manually from GitHub Actions tab
- **Push to Main**: Any push to main branch triggers a rebuild

### Manual Sync Button

The sync button requires a GitHub Personal Access Token:

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `repo` scope
3. Click "🔄 Sync" button in the dictionary
4. Enter token when prompted (stored in browser localStorage)
5. Workflow will trigger and update data in ~2-3 minutes

## How It Works

AgileTest API → scripts/generate.js → public/data.json → GitHub Actions → GitHub Pages

## Customization

Edit `public/styles.css` for colors or replace `public/izertis-logo.png` with your logo.

## Troubleshooting

- **No steps generated?** Check project ID and API permissions.
- **Port 3000 busy?** Use `PORT=3001 npm start`.
