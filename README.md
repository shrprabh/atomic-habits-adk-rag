# Atomic Habits ADK + MCP starter

This starter adds a Google ADK agent and a Firebase-authenticated FastAPI chat
endpoint on top of an existing private MCP server deployed to Cloud Run.

## Architecture

React signs the user in with Firebase Authentication and sends a Firebase ID
token to `POST /chat`. The API verifies the user token, runs the ADK agent, and
the ADK agent obtains a separate Cloud Run identity token to call the private
MCP endpoint. The MCP service performs BigQuery semantic search. ADK and Gemini
compose the final answer from retrieved passages.

## 1. Prepare the agent

From this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp atomic_habits_agent/.env.example atomic_habits_agent/.env
```

Confirm the current MCP URL:

```bash
gcloud run services describe bigquery-rag-mcp \
  --region us-central1 \
  --format='value(status.url)'
```

Put that base URL, without `/mcp`, in `atomic_habits_agent/.env`.

## 2. Test through ADK

Run from the directory containing the `atomic_habits_agent/` folder:

```bash
export GOOGLE_CLOUD_PROJECT=bigquery-semantic-search
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_ENTERPRISE=True

adk run atomic_habits_agent
```

Or launch the development UI:

```bash
adk web --port 8000
```

Open the Cloud Shell web preview for port 8000 and select
`atomic_habits_agent`. ADK Web is for development only.

## 3. Create the ADK runtime service account

```bash
export PROJECT_ID=bigquery-semantic-search
export REGION=us-central1
export MCP_SERVICE=bigquery-rag-mcp
export AGENT_SERVICE=atomic-habits-agent-api
export AGENT_SA_NAME=bigquery-rag-agent-sa
export AGENT_SA="${AGENT_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$AGENT_SA_NAME" \
  --display-name="Atomic Habits ADK agent"

gcloud run services add-iam-policy-binding "$MCP_SERVICE" \
  --region "$REGION" \
  --member="serviceAccount:${AGENT_SA}" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${AGENT_SA}" \
  --role="roles/aiplatform.user"
```

The agent service account does not need the MCP server's BigQuery roles. The
MCP server's own service account keeps responsibility for BigQuery access.

## 4. Configure Firebase Google sign-in

Add Firebase to the existing `bigquery-semantic-search` Google Cloud project.
In Firebase Console, open Authentication, enable Google as a sign-in provider,
and add `localhost` under Authorized domains for local testing if it is absent.
Register a Web app and copy its Firebase configuration values.

Enable the required APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com \
  identitytoolkit.googleapis.com \
  --project "$PROJECT_ID"
```

## 5. Deploy the authenticated ADK chat API

Get the current MCP base URL:

```bash
export MCP_BASE_URL="$(gcloud run services describe "$MCP_SERVICE" \
  --region "$REGION" \
  --format='value(status.url)')"
```

For the first deployment, allow the local Vite origin:

```bash
gcloud run deploy "$AGENT_SERVICE" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service-account "$AGENT_SA" \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION,GOOGLE_GENAI_USE_ENTERPRISE=True,GEMINI_MODEL=gemini-2.5-flash,MCP_BASE_URL=$MCP_BASE_URL,FRONTEND_ORIGINS=http://localhost:5173"
```

Cloud Run must allow transport-level unauthenticated invocation because the
browser presents a Firebase token rather than a Cloud Run IAM token. The
application itself verifies the Firebase token before `/chat` can run.

Test the public health route:

```bash
export AGENT_URL="$(gcloud run services describe "$AGENT_SERVICE" \
  --region "$REGION" \
  --format='value(status.url)')"

curl "$AGENT_URL/health"
```

Calling `/chat` without a Firebase token should return HTTP 401:

```bash
curl -i -X POST "$AGENT_URL/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is the two-minute rule?"}'
```

## 6. Run the React app locally

```bash
cd frontend
cp .env.example .env
```

Set `VITE_API_URL` to the deployed agent URL and paste the Firebase Web app
configuration into `.env`. Then run:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, sign in with Google, and ask a question.

## 7. Deploy React to Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase use --add bigquery-semantic-search
npm run build
firebase deploy --only hosting
```

Firebase returns a URL similar to:

```text
https://bigquery-semantic-search.web.app
```

Add that domain in Firebase Authentication's Authorized domains. Then update
the API CORS allowlist:

```bash
gcloud run services update "$AGENT_SERVICE" \
  --region "$REGION" \
  --update-env-vars="FRONTEND_ORIGINS=https://bigquery-semantic-search.web.app"
```

Update `frontend/.env` so `VITE_API_URL` is the deployed agent URL, rebuild,
and redeploy Hosting if needed.

## Important production note

This starter uses ADK's `InMemorySessionService`, which is appropriate for a
portfolio demo. Conversation history can be lost whenever a Cloud Run instance
restarts or when traffic reaches another instance. For production, replace it
with a persistent ADK session service, such as an Agent Runtime/Vertex AI
session service or a supported database-backed session service.
