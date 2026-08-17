# Atomic Habits ADK RAG Assistant

[![Google ADK](https://img.shields.io/badge/Google-ADK-4285F4?logo=google&logoColor=white)](https://google.github.io/adk-docs/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-8E75B2?logo=googlegemini&logoColor=white)](https://cloud.google.com/vertex-ai/generative-ai)
[![Cloud Run](https://img.shields.io/badge/Cloud%20Run-Agent%20API-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Hosting-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)

A full-stack, document-grounded AI assistant built with Google Agent Development Kit (ADK), Gemini on Vertex AI, a private remote MCP retrieval service, Firebase Google Authentication, FastAPI, React, and Cloud Run.

This repository owns the **agent, API, authentication, and frontend layers**. It requires the separately deployed BigQuery semantic-search MCP service:

> Retrieval service: [shrprabh/bigquery-rag-mcp](https://github.com/shrprabh/bigquery-rag-mcp)

## Live application

| Resource | URL/access |
| --- | --- |
| React application | [https://bigquery-semantic-search.web.app](https://bigquery-semantic-search.web.app) |
| Agent API | `https://atomic-habits-agent-api-nfp4nl2vna-uc.a.run.app` |
| Agent health | `/health` â€” public |
| Chat endpoint | `/chat` â€” Firebase ID token required |
| MCP dependency | Private Cloud Run service |

## End-to-end architecture

```text
User
 â”‚
 â–¼
React + Firebase Hosting
 â”‚  Google sign-in
 â”‚  Firebase ID token in Authorization header
 â–¼
FastAPI /chat on Cloud Run
 â”‚  verifies Firebase token and derives UID
 â–¼
Google ADK Agent + Gemini 2.5 Flash
 â”‚  generates Google Cloud identity token
 â–¼
Private Streamable HTTP MCP service
 â”‚  semantic_search tool
 â–¼
BigQuery AI.GENERATE_EMBEDDING + VECTOR_SEARCH
 â”‚
 â–¼
Grounded answer with source/page citations
```

## Trust boundaries

This system uses two different tokens for two different purposes:

1. **Firebase ID token:** proves the identity of the end user to the public Agent API.
2. **Google Cloud identity token:** proves the identity of the Agent Cloud Run service to the private MCP Cloud Run service.

The Firebase token is never forwarded to the MCP service. The browser never receives the MCP service identity token.

## Features

- Google sign-in through Firebase Authentication.
- Firebase-authenticated FastAPI `/chat` endpoint.
- User identity derived from the verified Firebase token, not request-body input.
- Google ADK agent with a remote `MCPToolset`.
- Gemini 2.5 Flash through Vertex AI.
- Private service-to-service MCP authentication.
- Document-grounded prompts with source and page citations.
- CORS allowlist for approved frontend origins.
- Per-user ADK session IDs for follow-up questions.
- React chat interface deployed to Firebase Hosting.
- Independent Cloud Run service identities and least-privilege IAM boundaries.

## Repository layout

```text
atomic-habits-adk-rag/
â”œâ”€â”€ atomic_habits_agent/
â”‚   â”œâ”€â”€ __init__.py
â”‚   â”œâ”€â”€ agent.py               # ADK agent and remote MCP toolset
â”‚   â””â”€â”€ .env.example
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ App.jsx            # Authenticated chat interface
â”‚   â”‚   â”œâ”€â”€ App.css
â”‚   â”‚   â”œâ”€â”€ firebase.js        # Firebase browser initialization
â”‚   â”‚   â””â”€â”€ main.jsx
â”‚   â”œâ”€â”€ .env.example
â”‚   â”œâ”€â”€ firebase.json
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ index.html
â”œâ”€â”€ main.py                    # FastAPI API, Firebase verification, ADK runner
â”œâ”€â”€ Dockerfile
â”œâ”€â”€ requirements.txt
â”œâ”€â”€ .dockerignore
â”œâ”€â”€ .gitignore
â””â”€â”€ README.md
```

## Component responsibilities

| Component | Responsibility |
| --- | --- |
| `atomic_habits_agent/agent.py` | Defines the ADK agent, grounding instructions, MCP tool filter, and private MCP token provider |
| `main.py` | Verifies Firebase ID tokens, manages ADK sessions, calls the runner, returns `/chat` responses |
| React frontend | Handles Google sign-in, retrieves the Firebase ID token, calls `/chat`, and renders answers |
| Firebase Hosting | Hosts the static React build |
| Firebase Authentication | Manages Google sign-in and user identities |
| Vertex AI | Runs Gemini 2.5 Flash for tool selection and answer generation |
| Private MCP service | Performs BigQuery semantic retrieval |

## Prerequisites

- The [BigQuery RAG MCP service](https://github.com/shrprabh/bigquery-rag-mcp) deployed and healthy
- Python 3.12+
- Node.js 20+ and npm
- Google Cloud CLI
- Firebase CLI
- A Google Cloud/Firebase project with billing enabled
- Permission to manage Cloud Run, service accounts, IAM, Firebase Authentication, and Firebase Hosting

## 1. Clone and install the backend

```bash
git clone https://github.com/shrprabh/atomic-habits-adk-rag.git
cd atomic-habits-adk-rag

python3 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
pip install -r requirements.txt
```

Confirm the important dependencies:

```bash
grep -E "google-adk|mcp|firebase-admin|fastapi|uvicorn" requirements.txt
```

## 2. Configure the agent locally

```bash
cp atomic_habits_agent/.env.example atomic_habits_agent/.env
```

Use:

```dotenv
GOOGLE_CLOUD_PROJECT=bigquery-semantic-search
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GEMINI_MODEL=gemini-2.5-flash
MCP_BASE_URL=https://bigquery-rag-mcp-nfp4nl2vna-uc.a.run.app
```

`MCP_BASE_URL` is the base Cloud Run URL without `/mcp`; `agent.py` appends the MCP path.

Use `GOOGLE_GENAI_USE_VERTEXAI=TRUE`. Do not mix it with the older `GOOGLE_GENAI_USE_ENTERPRISE` examples.

Authenticate local Google Cloud development:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project bigquery-semantic-search
```

The working implementation uses the attached Cloud Run service account in production. During Cloud Shell development, it can use the active `gcloud` identity token. Do not package `gcloud` as a production authentication dependency and do not deploy service-account JSON keys.

## 3. Test the ADK agent

Compile the backend:

```bash
python -m py_compile atomic_habits_agent/agent.py main.py
```

Run the command-line agent:

```bash
adk run atomic_habits_agent
```

Example:

```text
What is the two-minute rule?
```

Run the ADK development UI:

```bash
adk web --port 8000
```

ADK Web is intended for local development and debugging. The production React application calls the custom `/chat` API instead.

## 4. Prepare Google Cloud IAM

Set variables:

```bash
export PROJECT_ID="bigquery-semantic-search"
export REGION="us-central1"
export MCP_SERVICE="bigquery-rag-mcp"
export AGENT_SERVICE="atomic-habits-agent-api"
export AGENT_SA_NAME="bigquery-rag-agent-sa"
export AGENT_SA="${AGENT_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
```

Enable APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  identitytoolkit.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  --project="$PROJECT_ID"
```

Create the service account if necessary:

```bash
gcloud iam service-accounts describe "$AGENT_SA" \
  --project="$PROJECT_ID" >/dev/null 2>&1 || \
gcloud iam service-accounts create "$AGENT_SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="Atomic Habits ADK Agent"
```

Allow the Agent API to use Gemini:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${AGENT_SA}" \
  --role="roles/aiplatform.user"
```

Allow the Agent API to invoke the private MCP service:

```bash
gcloud run services add-iam-policy-binding "$MCP_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --member="serviceAccount:${AGENT_SA}" \
  --role="roles/run.invoker"
```

The Agent service account does not need BigQuery roles. The MCP service account owns BigQuery access.

## 5. Configure Firebase Authentication

Use the Firebase project attached to Google Cloud project `bigquery-semantic-search`. Do not use the separate `bigquery-semantic-search-c415c` project that may appear in your Firebase project list.

In the Firebase console:

1. Select `bigquery-semantic-search`.
2. Open **Authentication â†’ Sign-in method**.
3. Enable **Google**.
4. Open **Project settings â†’ General â†’ Your apps**.
5. Register a Web app.
6. Copy the Firebase Web configuration values.
7. Under **Authentication â†’ Settings â†’ Authorized domains**, add the domains used for local and deployed testing.

Firebase Authentication stores user identity information. It does not automatically store chat messages.

## 6. Deploy the Agent API

Get the current private MCP URL:

```bash
export MCP_BASE_URL="$(
  gcloud run services describe "$MCP_SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='value(status.url)'
)"

export FRONTEND_ORIGIN="https://bigquery-semantic-search.web.app"
```

Deploy from the repository root:

```bash
gcloud run deploy "$AGENT_SERVICE" \
  --source=. \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --service-account="$AGENT_SA" \
  --allow-unauthenticated \
  --memory="1Gi" \
  --cpu="1" \
  --timeout="300" \
  --concurrency="10" \
  --min-instances="0" \
  --max-instances="1" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_VERTEXAI=TRUE,GEMINI_MODEL=gemini-2.5-flash,MCP_BASE_URL=$MCP_BASE_URL,FIREBASE_PROJECT_ID=$PROJECT_ID,FRONTEND_ORIGINS=$FRONTEND_ORIGIN"
```

`--allow-unauthenticated` applies only to Cloud Run's transport-level IAM check. It allows the browser to reach the service. The application still requires a valid Firebase bearer token for `/chat`.

Get the Agent URL:

```bash
export AGENT_URL="$(
  gcloud run services describe "$AGENT_SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='value(status.url)'
)"

echo "$AGENT_URL"
```

Test health:

```bash
curl -i "$AGENT_URL/health"
```

Expected: HTTP `200` and `{"status":"healthy"}`.

Confirm `/chat` is protected:

```bash
curl -i -X POST "$AGENT_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the two-minute rule?"}'
```

Expected: HTTP `401` with `Google sign-in is required.`

## 7. Configure the React frontend

```bash
cd frontend
cp .env.example .env
```

Use the exact Web app configuration from Firebase:

```dotenv
VITE_API_URL=https://atomic-habits-agent-api-nfp4nl2vna-uc.a.run.app
VITE_FIREBASE_API_KEY=replace_with_firebase_value
VITE_FIREBASE_AUTH_DOMAIN=bigquery-semantic-search.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=bigquery-semantic-search
VITE_FIREBASE_STORAGE_BUCKET=replace_with_firebase_value
VITE_FIREBASE_MESSAGING_SENDER_ID=replace_with_firebase_value
VITE_FIREBASE_APP_ID=replace_with_firebase_value
```

Do not append `/chat` to `VITE_API_URL`; the React code adds it.

The browser flow is:

```text
signInWithPopup
â†’ Firebase user
â†’ user.getIdToken()
â†’ Authorization: Bearer <Firebase ID token>
â†’ POST /chat
```

For browsers where Firebase IndexedDB persistence failsâ€”particularly restrictive Incognito sessionsâ€”the implementation can initialize Auth with `browserSessionPersistence` and `browserPopupRedirectResolver`. This uses session storage for the demo instead of relying on IndexedDB.

## 8. Run React locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173` locally or use Cloud Shell Web Preview for port `5173`.

If using Cloud Shell Web Preview:

- Add the exact `cloudshell.dev` hostname under Firebase Authorized domains.
- Add its exact origin to the Agent API's `FRONTEND_ORIGINS` value.
- Do not include `https://` when entering a Firebase Authorized Domain.

## 9. Build and deploy Firebase Hosting

The Hosting site already exists as `bigquery-semantic-search`. Confirm it:

```bash
firebase hosting:sites:list --project="bigquery-semantic-search"
```

Build:

```bash
npm run build
```

Confirm:

```bash
find dist -maxdepth 2 -type f | head
```

Deploy the single configured Hosting site:

```bash
firebase deploy \
  --project="bigquery-semantic-search" \
  --only hosting
```

Do not use `--only hosting:web` unless `firebase.json` and `.firebaserc` define a Hosting target named `web`.

Expected URLs:

```text
https://bigquery-semantic-search.web.app
https://bigquery-semantic-search.firebaseapp.com
```

Ensure both domains are authorized in Firebase Authentication.

## 10. Configure final production CORS

```bash
gcloud run services update "$AGENT_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-env-vars="^@^FRONTEND_ORIGINS=https://bigquery-semantic-search.web.app,https://bigquery-semantic-search.firebaseapp.com"
```

The custom delimiter prevents the comma-separated origin list from being parsed as multiple environment assignments.

## 11. End-to-end acceptance test

1. Open `https://bigquery-semantic-search.web.app` in a fresh browser session.
2. Select **Continue with Google**.
3. Sign in using an authorized Google account.
4. Ask `What is the two-minute rule?`.
5. Confirm the answer contains source/page citations.
6. Ask a follow-up question and confirm the same session ID is reused.
7. Sign out and confirm the chat interface is unavailable.
8. Call `/chat` without a token and confirm HTTP `401`.
9. Confirm the Agent logs show a request.
10. Confirm MCP logs show `Running semantic search with top_k=5`.

## API contract

### `GET /health`

Response:

```json
{"status":"healthy"}
```

### `POST /chat`

Header:

```http
Authorization: Bearer <Firebase-ID-token>
Content-Type: application/json
```

Request:

```json
{
  "message": "What is the two-minute rule?",
  "session_id": "optional-existing-session-id"
}
```

Response:

```json
{
  "answer": "Grounded answer with citations...",
  "session_id": "generated-or-reused-session-id"
}
```

The backend derives `user_id` from the verified Firebase token. It never trusts a `user_id` supplied by the frontend.

## Session and chat-history behavior

The current portfolio deployment uses `InMemorySessionService`:

- Follow-up context works while the Cloud Run instance and in-memory session remain available.
- A Cloud Run restart or replacement can erase the session.
- React stores only the session ID in browser storage.
- React messages are held in component state and disappear on refresh.
- Firebase Authentication stores users, not conversations.
- Firebase Hosting stores static application files, not chat history.

For persistent history, add a database-backed ADK session service or store conversations server-side in Firestore under the verified Firebase UID. If chat content is retained, disclose that behavior and provide deletion controls.

## Observability

Agent logs:

```bash
gcloud run services logs read "$AGENT_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --limit=100
```

MCP logs:

```bash
gcloud run services logs read "$MCP_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --limit=100
```

View signed-in users:

```text
Firebase Console â†’ Authentication â†’ Users
```

View API request count, latency, status codes, CPU, memory, and instances:

```text
Google Cloud Console â†’ Cloud Run â†’ atomic-habits-agent-api â†’ Metrics
```

Firebase Authentication and Hosting do not automatically store message content.

## Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `401 Google sign-in is required` | No Firebase bearer token | Sign in and send `user.getIdToken()` in `Authorization` |
| `401 Invalid or expired sign-in token` | Expired/wrong-project Firebase token | Confirm frontend and Admin SDK use `bigquery-semantic-search` |
| Google login succeeds but UI remains on login card | Auth state/persistence error | Use `onAuthStateChanged`; in restrictive browsers use session persistence |
| `Database is closing/hidden` | Browser IndexedDB persistence failure | Initialize Firebase Auth with `browserSessionPersistence`, clear site data, and retry |
| Browser reports CORS error | Hosting/preview origin not allowlisted | Set the exact scheme + host in `FRONTEND_ORIGINS` and deploy a new revision |
| Agent returns HTTP `502` | Gemini or MCP invocation failed | Check Agent logs, then MCP logs |
| MCP request returns `403` | Agent SA lacks `roles/run.invoker` | Add service-level invoker binding on `bigquery-rag-mcp` |
| Vertex AI `aiplatform.endpoints.predict` denied | Active user or Agent SA lacks Vertex AI permission | Grant `roles/aiplatform.user` to the correct principal |
| `McpToolset` import fails | ADK installed without MCP extra or mismatched version | Install from `requirements.txt` with `google-adk[mcp]` |
| `No module named mcp` | MCP extra/dependency missing | Reinstall the virtual environment from `requirements.txt` |
| Firebase deploy says target not detected | `hosting:web` target is not configured | Deploy with `--only hosting` for the current single-site config |
| Firebase says no Hosting sites | Wrong Firebase project or Hosting not initialized | Confirm project ID `bigquery-semantic-search` and enable Hosting API |

## Security and privacy

- `/chat` verifies Firebase ID tokens through Firebase Admin.
- The MCP service remains private.
- Cloud Run uses attached service accounts and short-lived identity tokens.
- The browser never receives Google Cloud service credentials.
- `.env`, ADC files, service-account keys, build output, logs, and ADK local sessions are ignored by Git.
- Do not display Network response bodies containing Firebase or Google tokens in screenshots.
- Do not log raw user questions or retrieved passages unless a documented retention policy requires it.
- The repository does not include the source book or extracted chunks.

## Cost controls used for the portfolio deployment

- Cloud Run minimum instances: `0`
- Agent maximum instances: `1`
- One vCPU and 1 GiB memory
- Gemini 2.5 Flash
- Small BigQuery corpus using brute-force search
- Firebase static Hosting

Configure a Google Cloud billing budget and alerts before sharing the application publicly. Cloud Run request limits do not replace application rate limiting; consider Firebase App Check, per-user quotas, or API rate limiting for broader public access.

## Current limitations

- In-memory sessions are not durable.
- Chat messages are not stored in Firebase or another database.
- The corpus is a single document and is not dynamically uploaded by users.
- There is no administrative ingestion UI.
- There is no formal retrieval/answer evaluation suite.
- `--max-instances=1` is a demo constraint, not a production scaling design.

## Recommended next improvements

1. Add persistent sessions and user-controlled chat deletion.
2. Add Firestore or another durable store only if chat-history retention is desired.
3. Add Firebase App Check and per-user request limits.
4. Add structured traces across Agent â†’ MCP â†’ BigQuery.
5. Add retrieval and grounded-answer evaluations.
6. Add dynamic document ingestion with ownership and tenant isolation.
7. Add CI checks and Firebase Hosting preview deployments for pull requests.

## GitHub publication

```bash
git add README.md
git commit -m "Add end-to-end ADK and Firebase deployment documentation"

git remote add origin https://github.com/shrprabh/atomic-habits-adk-rag.git
git push -u origin main
```

If `origin` already exists, verify it with `git remote -v` and run only `git push`.

## Official references

- [Google ADK](https://google.github.io/adk-docs/)
- [ADK MCP tools](https://google.github.io/adk-docs/tools/mcp-tools/)
- [Deploy ADK to Cloud Run](https://google.github.io/adk-docs/deploy/cloud-run/)
- [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Verify Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)
- [Cloud Run service-to-service authentication](https://cloud.google.com/run/docs/authenticating/service-to-service)

## Author

**Shreyas Prabhakar**

- GitHub: [@shrprabh](https://github.com/shrprabh)
- LinkedIn: [linkedin.com/in/shreyasprabhakar](https://www.linkedin.com/in/shreyasprabhakar)
- Medium: [@pshreyasgowda1997](https://medium.com/@pshreyasgowda1997)