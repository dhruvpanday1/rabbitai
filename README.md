# Sales Insight Automator 📊

> **Engineer's Log** — Built by Rabbitt AI Engineering | Sprint Duration: 3 hours

An end-to-end AI-powered sales analytics tool. Upload a CSV/XLSX, get a Google Gemini-generated executive report delivered to your inbox.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
│              Next.js SPA (port 3000)                    │
│    ┌──────────────────────────────────────────────┐     │
│    │  File Upload ─→ Email Input ─→ Submit        │     │
│    │  Loading Spinner / Success KPIs / Error      │     │
│    └──────────────────────────────────────────────┘     │
└───────────────────────┬─────────────────────────────────┘
                        │ POST /upload (multipart)
                        ▼
┌─────────────────────────────────────────────────────────┐
│               FastAPI Backend (port 8000)               │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  pandas  │─▶│ Gemini 1.5F  │─▶│  fastapi-mail    │  │
│  │ CSV/XLSX │  │  Narrative   │  │  HTML email      │  │
│  └──────────┘  └──────────────┘  └──────────────────┘  │
│  slowapi rate-limit │ CORS restricted to frontend       │
└─────────────────────────────────────────────────────────┘

Containerized via Docker Compose • CI/CD via GitHub Actions
```

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (v24+)
- A [Google Gemini API Key](https://makersuite.google.com/app/apikey) (free tier works)
- A Gmail account with [App Password](https://myaccount.google.com/apppasswords) enabled

### 1. Clone & Configure

```bash
git clone https://github.com/your-org/sales-insight-automator.git
cd sales-insight-automator

# Set up your environment variables
cp .env.example .env
# Edit .env with your real keys
```

### 2. Run with Docker Compose

```bash
docker-compose up --build
```

| Service  | URL                              |
|----------|----------------------------------|
| Frontend | http://localhost:3000            |
| Backend  | http://localhost:8000            |
| API Docs | http://localhost:8000/docs       |
| Health   | http://localhost:8000/health     |

### 3. Run Locally (Development)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## CSV/XLSX Data Format

Your file **must** contain these exact column headers:

| Column             | Type    | Example          |
|--------------------|---------|------------------|
| `Date`             | date    | 2024-01-15       |
| `Product_Category` | string  | Electronics      |
| `Region`           | string  | North America    |
| `Units_Sold`       | integer | 150              |
| `Unit_Price`       | float   | 299.99           |
| `Revenue`          | float   | 44998.50         |
| `Status`           | string  | Closed Won       |

A sample file is provided at `sample_sales.csv`.

---

## API Reference

### `POST /upload`
Upload a sales file and trigger AI analysis + email delivery.

**Request:** `multipart/form-data`
| Field             | Type   | Description               |
|-------------------|--------|---------------------------|
| `file`            | File   | .csv or .xlsx (max 10 MB) |
| `recipient_email` | string | Email to receive report   |

**Response `200`:**
```json
{
  "success": true,
  "message": "Sales insight report sent to user@example.com",
  "metrics_summary": {
    "total_revenue": 125430.50,
    "total_units_sold": 843,
    "top_product_category": "Electronics",
    "top_region": "North America",
    "date_range": "2024-01-01 to 2024-03-31"
  }
}
```

---

## Security

### CORS
The backend only accepts requests from `FRONTEND_URL` (default: `http://localhost:3000`). Configure in `.env` for production.

### Rate Limiting
`slowapi` enforces **10 requests per minute per IP address** on `/upload`. Rate-limit headers are returned on each response. Clients hitting the limit receive `429 Too Many Requests`.

### File Validation
- **Type check**: Only `.csv`, `.xlsx`, `.xls` accepted (by extension)
- **Size limit**: Maximum 10 MB per upload
- **Column validation**: Required schema enforced; missing columns return `422`

### Email Security
- Uses STARTTLS (port 587) — never plain SMTP
- Credentials stored in `.env`, never hardcoded
- `MAIL_PASSWORD` should be a Gmail **App Password**, not your actual password

---

## Environment Variables

| Variable          | Required | Description                         |
|-------------------|----------|-------------------------------------|
| `GEMINI_API_KEY`  | ✅ Yes   | Google Gemini API key               |
| `MAIL_USERNAME`   | ✅ Yes   | SMTP sender email                   |
| `MAIL_PASSWORD`   | ✅ Yes   | Gmail App Password (16-char)        |
| `MAIL_FROM`       | No       | Display sender (defaults to USERNAME)|
| `MAIL_SERVER`     | No       | SMTP server (default: smtp.gmail.com)|
| `MAIL_PORT`       | No       | SMTP port (default: 587)            |
| `FRONTEND_URL`    | No       | CORS allow-origin (default: localhost:3000)|
| `PORT`            | No       | Backend port (default: 8000)        |

---

## CI/CD Pipeline

GitHub Actions triggers on every **Pull Request to `main`**:

```
lint-backend ──▶ build-backend ──────────────────────┐
                                                      ▼
lint-frontend ──▶ build-frontend ──▶ build-frontend-docker ──▶ ✅ ci-success
                                                      ▲
validate-compose ─────────────────────────────────────┘
```

| Job                   | Tool          | What it checks                  |
|-----------------------|---------------|---------------------------------|
| `lint-backend`        | flake8        | Python style (PEP 8, max 120)   |
| `build-backend`       | docker build  | Backend image builds cleanly    |
| `lint-frontend`       | ESLint + tsc  | TypeScript types + code quality |
| `build-frontend`      | next build    | Next.js production build        |
| `build-frontend-docker`| docker build | Frontend image builds cleanly   |
| `validate-compose`    | docker compose| Compose YAML is valid           |

---

## Project Structure

```
sales-insight-automator/
├── backend/
│   ├── main.py              # FastAPI app (all logic)
│   ├── requirements.txt     # Pinned Python deps
│   └── Dockerfile           # Multi-stage Python build
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Main SPA UI
│   │   ├── layout.tsx       # Root layout + SEO meta
│   │   └── globals.css      # Design system + animations
│   ├── Dockerfile           # Multi-stage Node build
│   └── package.json
├── .github/
│   └── workflows/
│       └── ci.yml           # GitHub Actions CI/CD
├── docker-compose.yml       # Multi-service orchestration
├── .env.example             # Environment variable template
├── sample_sales.csv         # Test data
└── README.md                # This file
```

---

*Built with ❤️ by Rabbitt AI Engineering — FastAPI · Next.js 14 · Google Gemini · Docker*
