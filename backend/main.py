"""
Sales Insight Automator — FastAPI Backend
Rabbitt AI | Senior DevOps Engineer Build

Endpoints:
  GET  /          → Root health check
  GET  /health    → Detailed service health
  POST /upload    → Upload CSV/XLSX, run AI analysis, send email
  GET  /schema    → Returns the expected CSV column schema
"""

import os
import io
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Dict, Any

from pydantic import BaseModel, Field, EmailStr

import pandas as pd
import google.generativeai as genai
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from dotenv import load_dotenv

load_dotenv()

# ─── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

# ─── Rate Limiter ────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ─── Gemini Setup ────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# ─── Mail Config ─────────────────────────────────────────────────────────────
mail_conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", "dummy"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "dummy"),
    MAIL_FROM=os.getenv("MAIL_FROM", os.getenv("MAIL_USERNAME", "noreply@rabbitt.ai")),
    MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)

# ─── App Lifecycle ───────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Sales Insight Automator API starting up")
    yield
    logger.info("🛑 API shutting down")

# ─── Pydantic Response Models ────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = Field(..., example="healthy", description="Service health status")
    gemini_configured: bool = Field(..., example=True, description="Whether GEMINI_API_KEY is set")
    mail_configured: bool = Field(..., example=True, description="Whether MAIL_USERNAME is set")
    version: str = Field(..., example="1.0.0", description="API version")

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "healthy",
                "gemini_configured": True,
                "mail_configured": True,
                "version": "1.0.0"
            }
        }
    }


class MetricsSummary(BaseModel):
    total_revenue: float = Field(..., example=125430.50, description="Sum of all Revenue values")
    total_units_sold: int = Field(..., example=843, description="Sum of all Units_Sold values")
    top_product_category: str = Field(..., example="Electronics", description="Product category with highest revenue")
    top_region: str = Field(..., example="North America", description="Region with highest revenue")
    date_range: str = Field(..., example="2024-01-01 to 2024-03-31", description="Min and max dates in the dataset")


class UploadResponse(BaseModel):
    success: bool = Field(..., example=True, description="Whether the report was generated and sent")
    message: str = Field(..., example="Sales insight report sent to user@example.com", description="Human-readable confirmation")
    metrics_summary: MetricsSummary = Field(..., description="Key KPI metrics computed from the uploaded file")

    model_config = {
        "json_schema_extra": {
            "example": {
                "success": True,
                "message": "Sales insight report sent to executive@company.com",
                "metrics_summary": {
                    "total_revenue": 125430.50,
                    "total_units_sold": 843,
                    "top_product_category": "Electronics",
                    "top_region": "North America",
                    "date_range": "2024-01-01 to 2024-03-31"
                }
            }
        }
    }


class SchemaResponse(BaseModel):
    required_columns: list[str] = Field(..., description="Exact column headers the CSV/XLSX must contain")
    column_descriptions: Dict[str, str] = Field(..., description="Description of each required column")
    example_row: Dict[str, Any] = Field(..., description="A sample data row showing expected formats")


# ─── FastAPI App ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Sales Insight Automator API",
    description="""
## 📊 Sales Insight Automator — Rabbitt AI

An AI-powered sales analytics API that:
- **Accepts** CSV or XLSX sales data files
- **Computes** key business KPIs using pandas
- **Generates** a professional executive narrative via Google Gemini 1.5 Flash
- **Delivers** a styled HTML report email to the specified recipient

---

### Authentication
No authentication required for this prototype. Rate limiting is enforced: **10 requests/min per IP**.

### Required CSV/XLSX Schema
| Column | Type | Description |
|--------|------|-------------|
| `Date` | date | Transaction date (YYYY-MM-DD) |
| `Product_Category` | string | Product category name |
| `Region` | string | Sales region |
| `Units_Sold` | integer | Number of units sold |
| `Unit_Price` | float | Price per unit |
| `Revenue` | float | Total revenue (Units_Sold × Unit_Price) |
| `Status` | string | Deal status (e.g. Closed Won, In Progress) |

### Security
- CORS restricted to `FRONTEND_URL` env var
- Rate limiting via `slowapi` (10 req/min/IP)
- TLS email via SMTP STARTTLS
    """,
    version="1.0.0",
    contact={"name": "Rabbitt AI Engineering", "email": "dev@rabbitt.ai"},
    license_info={"name": "MIT", "url": "https://opensource.org/licenses/MIT"},
    openapi_tags=[
        {"name": "Health", "description": "Service health and readiness checks"},
        {"name": "Sales Insights", "description": "Core AI-powered sales analysis endpoint"},
        {"name": "Schema", "description": "Data schema reference for file uploads"},
    ],
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── CORS ────────────────────────────────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_sales_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Parse uploaded CSV or XLSX into a DataFrame."""
    try:
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        elif filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_bytes))
        else:
            raise ValueError("Unsupported file type. Please upload CSV or XLSX.")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"File parsing failed: {exc}")

    required_cols = {"Date", "Product_Category", "Region", "Units_Sold", "Unit_Price", "Revenue", "Status"}
    missing = required_cols - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns: {', '.join(missing)}. "
                   f"Expected: Date, Product_Category, Region, Units_Sold, Unit_Price, Revenue, Status",
        )
    return df


def compute_metrics(df: pd.DataFrame) -> dict:
    """Compute key sales KPIs from the DataFrame."""
    df["Revenue"] = pd.to_numeric(df["Revenue"], errors="coerce").fillna(0)
    df["Units_Sold"] = pd.to_numeric(df["Units_Sold"], errors="coerce").fillna(0)
    df["Unit_Price"] = pd.to_numeric(df["Unit_Price"], errors="coerce").fillna(0)

    total_revenue = df["Revenue"].sum()
    total_units = int(df["Units_Sold"].sum())
    avg_unit_price = df["Unit_Price"].mean()
    num_records = len(df)

    top_product = df.groupby("Product_Category")["Revenue"].sum().idxmax()
    top_product_revenue = df.groupby("Product_Category")["Revenue"].sum().max()

    top_region = df.groupby("Region")["Revenue"].sum().idxmax()
    top_region_revenue = df.groupby("Region")["Revenue"].sum().max()

    status_breakdown = df["Status"].value_counts().to_dict()

    category_revenue = df.groupby("Product_Category")["Revenue"].sum().to_dict()
    region_revenue = df.groupby("Region")["Revenue"].sum().to_dict()

    # Date range
    try:
        df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        date_min = df["Date"].min().strftime("%Y-%m-%d")
        date_max = df["Date"].max().strftime("%Y-%m-%d")
    except Exception:
        date_min, date_max = "N/A", "N/A"

    return {
        "total_revenue": round(total_revenue, 2),
        "total_units_sold": total_units,
        "avg_unit_price": round(avg_unit_price, 2),
        "num_records": num_records,
        "top_product_category": top_product,
        "top_product_category_revenue": round(top_product_revenue, 2),
        "top_region": top_region,
        "top_region_revenue": round(top_region_revenue, 2),
        "status_breakdown": status_breakdown,
        "category_revenue": {k: round(v, 2) for k, v in category_revenue.items()},
        "region_revenue": {k: round(v, 2) for k, v in region_revenue.items()},
        "date_range": f"{date_min} to {date_max}",
    }


def build_gemini_prompt(metrics: dict) -> str:
    """Build the prompt sent to Gemini for narrative generation."""
    status_str = ", ".join(f"{k}: {v}" for k, v in metrics["status_breakdown"].items())
    cat_str = ", ".join(f"{k}: ${v:,.2f}" for k, v in metrics["category_revenue"].items())
    reg_str = ", ".join(f"{k}: ${v:,.2f}" for k, v in metrics["region_revenue"].items())

    return f"""
You are a senior business analyst at Rabbitt AI. Write a professional, executive-level 
sales performance summary report (~300 words) based on the following data metrics.

Use a confident, data-driven tone. Structure it with these sections:
1. Executive Overview (1-2 sentences)
2. Revenue Performance
3. Top Performers (Product & Region)
4. Deal Status Analysis
5. Strategic Recommendations (2-3 bullet points)

DATA METRICS:
- Reporting Period: {metrics["date_range"]}
- Total Records Analyzed: {metrics["num_records"]}
- Total Revenue: ${metrics["total_revenue"]:,.2f}
- Total Units Sold: {metrics["total_units_sold"]:,}
- Average Unit Price: ${metrics["avg_unit_price"]:,.2f}
- Top Product Category: {metrics["top_product_category"]} (${metrics["top_product_category_revenue"]:,.2f})
- Top Region: {metrics["top_region"]} (${metrics["top_region_revenue"]:,.2f})
- Revenue by Category: {cat_str}
- Revenue by Region: {reg_str}
- Deal Status Breakdown: {status_str}

Write the report now. Do not include any markdown headers with #. Use bold text sparingly.
""".strip()


async def generate_ai_narrative(metrics: dict) -> str:
    """Call Gemini API to generate executive narrative."""
    if not GEMINI_API_KEY:
        return (
            "[AI Narrative Unavailable — GEMINI_API_KEY not configured]\n\n"
            f"Manual Summary: Total Revenue ${metrics['total_revenue']:,.2f}, "
            f"Top Product: {metrics['top_product_category']}, "
            f"Top Region: {metrics['top_region']}."
        )
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = build_gemini_prompt(metrics)
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as exc:
        logger.error(f"Gemini API error: {exc}")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {exc}")


def build_email_html(narrative: str, metrics: dict, filename: str) -> str:
    """Build a styled HTML email body."""
    status_rows = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #2d2d2d'>{k}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #2d2d2d;text-align:right'>{v}</td></tr>"
        for k, v in metrics["status_breakdown"].items()
    )
    narrative_html = narrative.replace("\n", "<br>")
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sales Insight Report – Rabbitt AI</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;color:#e5e7eb">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px">
        <table width="640" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:36px 40px;text-align:center">
              <h1 style="margin:0;color:#fff;font-size:26px;font-weight:700;letter-spacing:-0.5px">
                📊 Sales Insight Report
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px">
                Powered by Rabbitt AI &nbsp;•&nbsp; {metrics["date_range"]}
              </p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:11px">Source: {filename}</p>
            </td>
          </tr>
          <!-- KPI Cards -->
          <tr>
            <td style="padding:32px 40px 0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center;padding:16px;background:#16213e;border-radius:12px;margin:4px">
                    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Total Revenue</div>
                    <div style="font-size:26px;font-weight:700;color:#a78bfa;margin-top:4px">${metrics["total_revenue"]:,.2f}</div>
                  </td>
                  <td width="4px"></td>
                  <td width="33%" style="text-align:center;padding:16px;background:#16213e;border-radius:12px">
                    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Units Sold</div>
                    <div style="font-size:26px;font-weight:700;color:#34d399;margin-top:4px">{metrics["total_units_sold"]:,}</div>
                  </td>
                  <td width="4px"></td>
                  <td width="33%" style="text-align:center;padding:16px;background:#16213e;border-radius:12px">
                    <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Avg Unit Price</div>
                    <div style="font-size:26px;font-weight:700;color:#60a5fa;margin-top:4px">${metrics["avg_unit_price"]:,.2f}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Top Performers -->
          <tr>
            <td style="padding:20px 40px 0">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="49%" style="background:#0d1117;border-radius:10px;padding:14px 18px;border-left:3px solid #a78bfa">
                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">🏆 Top Product</div>
                    <div style="font-size:16px;font-weight:600;color:#e5e7eb;margin-top:4px">{metrics["top_product_category"]}</div>
                    <div style="font-size:12px;color:#a78bfa">${metrics["top_product_category_revenue"]:,.2f}</div>
                  </td>
                  <td width="2%"></td>
                  <td width="49%" style="background:#0d1117;border-radius:10px;padding:14px 18px;border-left:3px solid #34d399">
                    <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">📍 Top Region</div>
                    <div style="font-size:16px;font-weight:600;color:#e5e7eb;margin-top:4px">{metrics["top_region"]}</div>
                    <div style="font-size:12px;color:#34d399">${metrics["top_region_revenue"]:,.2f}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Status Breakdown -->
          <tr>
            <td style="padding:20px 40px 0">
              <div style="font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Deal Status</div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;border-radius:10px;overflow:hidden">
                {status_rows}
              </table>
            </td>
          </tr>
          <!-- AI Narrative -->
          <tr>
            <td style="padding:24px 40px 0">
              <div style="background:linear-gradient(135deg,rgba(102,126,234,0.1),rgba(118,75,162,0.1));border:1px solid rgba(102,126,234,0.2);border-radius:12px;padding:24px">
                <div style="font-size:11px;color:#a78bfa;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">✨ AI Executive Summary</div>
                <div style="font-size:14px;line-height:1.8;color:#d1d5db">{narrative_html}</div>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px;text-align:center">
              <p style="margin:0;font-size:11px;color:#4b5563">
                Generated by <strong style="color:#a78bfa">Rabbitt AI</strong> Sales Insight Automator
               &nbsp;•&nbsp; Confidential
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
""".strip()


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get(
    "/",
    tags=["Health"],
    summary="Root health check",
    response_description="Basic service status",
)
async def root():
    """
    Simple health check to confirm the API is running.

    Returns service name, status, and version. Use this for load-balancer
    health probes or basic connectivity tests.
    """
    return {"status": "ok", "service": "Sales Insight Automator API", "version": "1.0.0"}


@app.get(
    "/health",
    tags=["Health"],
    summary="Detailed service health",
    response_model=HealthResponse,
    response_description="Health status including external service configuration",
    responses={
        200: {
            "description": "Service is healthy",
            "content": {
                "application/json": {
                    "example": {
                        "status": "healthy",
                        "gemini_configured": True,
                        "mail_configured": True,
                        "version": "1.0.0"
                    }
                }
            }
        }
    }
)
async def health():
    """
    Returns detailed health status including whether optional external services are configured.

    - **gemini_configured**: `true` if `GEMINI_API_KEY` env var is set
    - **mail_configured**: `true` if `MAIL_USERNAME` env var is set

    If either is `false`, the `/upload` endpoint will still work but will return
    a fallback narrative or skip email delivery.
    """
    return HealthResponse(
        status="healthy",
        gemini_configured=bool(GEMINI_API_KEY),
        mail_configured=bool(os.getenv("MAIL_USERNAME")),
        version="1.0.0",
    )


@app.get(
    "/schema",
    tags=["Schema"],
    summary="Get required CSV/XLSX column schema",
    response_model=SchemaResponse,
    response_description="The exact column headers and types required in uploaded files",
)
async def get_schema():
    """
    Returns the required data schema for uploaded sales files.

    Use this endpoint to validate your file structure before uploading,
    or to build client-side schema validation.
    """
    return SchemaResponse(
        required_columns=["Date", "Product_Category", "Region", "Units_Sold", "Unit_Price", "Revenue", "Status"],
        column_descriptions={
            "Date": "Transaction date — any parseable date format (e.g. 2024-01-15)",
            "Product_Category": "Category of the product sold (e.g. Electronics, Apparel)",
            "Region": "Geographic sales region (e.g. North America, Europe, Asia Pacific)",
            "Units_Sold": "Integer count of units sold in the transaction",
            "Unit_Price": "Price per single unit in USD",
            "Revenue": "Total revenue for the row — typically Units_Sold × Unit_Price",
            "Status": "Deal status — e.g. Closed Won, Closed Lost, In Progress",
        },
        example_row={
            "Date": "2024-01-15",
            "Product_Category": "Electronics",
            "Region": "North America",
            "Units_Sold": 120,
            "Unit_Price": 299.99,
            "Revenue": 35998.80,
            "Status": "Closed Won",
        },
    )


@app.post(
    "/upload",
    tags=["Sales Insights"],
    summary="Upload sales file → AI analysis → email delivery",
    response_model=UploadResponse,
    response_description="Confirmation that the AI insight report was generated and emailed",
    responses={
        200: {"description": "Report generated and emailed successfully"},
        413: {"description": "File too large — maximum 10 MB allowed"},
        422: {"description": "Invalid file type, missing columns, or bad email format"},
        429: {"description": "Rate limit exceeded — max 10 requests/min per IP"},
        502: {"description": "Upstream failure — Gemini API or SMTP error"},
    },
)
@limiter.limit("10/minute")
async def upload_and_analyze(
    request: Request,
    file: Annotated[
        UploadFile,
        File(
            description=(
                "Sales data file in **CSV** or **XLSX** format (max 10 MB). "
                "Must contain columns: Date, Product_Category, Region, Units_Sold, Unit_Price, Revenue, Status."
            )
        ),
    ],
    recipient_email: Annotated[
        str,
        Form(
            description="Valid email address where the AI-generated HTML report will be delivered.",
            example="executive@company.com",
        ),
    ],
):
    """
    Upload a CSV or XLSX sales file and receive an AI-generated executive summary via email.

    - **file**: Must contain columns: Date, Product_Category, Region, Units_Sold, Unit_Price, Revenue, Status
    - **recipient_email**: Valid email address for the report delivery
    """
    logger.info(f"Upload request | file={file.filename} | recipient={recipient_email}")

    # Validate email format (basic)
    if "@" not in recipient_email or "." not in recipient_email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Invalid email address format.")

    # Read file bytes
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10 MB.")

    # Parse & compute
    df = parse_sales_file(file_bytes, file.filename or "upload")
    metrics = compute_metrics(df)
    logger.info(f"Metrics computed | revenue={metrics['total_revenue']}")

    # AI narrative
    narrative = await generate_ai_narrative(metrics)
    logger.info("AI narrative generated")

    # Build & send email
    html_body = build_email_html(narrative, metrics, file.filename or "upload")
    message = MessageSchema(
        subject=f"📊 Sales Insight Report | {metrics['date_range']} — Rabbitt AI",
        recipients=[recipient_email],
        body=html_body,
        subtype=MessageType.html,
    )

    try:
        if os.getenv("MAIL_USERNAME") and os.getenv("MAIL_USERNAME") != "dummy":
            fm = FastMail(mail_conf)
            await fm.send_message(message)
            logger.info(f"Email sent to {recipient_email}")
            msg = f"Sales insight report sent to {recipient_email}"
        else:
             logger.warning("SMTP credentials not configured. Skipping email delivery.")
             msg = "Report generated successfully. (Email skipped: SMTP not configured)"
    except Exception as exc:
        logger.error(f"Mail send error: {exc}")
        msg = f"Report generated successfully. (Email delivery failed: Check SMTP credentials)"

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": msg,
            "metrics_summary": {
                "total_revenue": metrics["total_revenue"],
                "total_units_sold": metrics["total_units_sold"],
                "top_product_category": metrics["top_product_category"],
                "top_region": metrics["top_region"],
                "date_range": metrics["date_range"],
            },
        },
    )
