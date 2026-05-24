# NOUFAR CDSS

> **Clinical Decision Support System for Hyperthyroidism Relapse Prediction**
> AI-powered platform empowering endocrinologists with explainable relapse risk insights.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

---

## Table of Contents

1. [Overview](#1-overview)
2. [Key Features](#2-key-features)
3. [Architecture](#3-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Project Structure](#5-project-structure)
6. [Prerequisites](#6-prerequisites)
7. [Quick Start (Docker)](#7-quick-start-docker)
8. [Environment Configuration](#8-environment-configuration)
9. [Services & Ports](#9-services--ports)
10. [Common Commands](#10-common-commands)
11. [Database Migrations](#11-database-migrations)
12. [Security](#12-security)
13. [Troubleshooting](#13-troubleshooting)
14. [Contributing](#14-contributing)
15. [License](#15-license)

---

## 1. Overview

**NOUFAR CDSS** is a clinical decision support platform purpose-built for endocrinology workflows. It helps clinicians assess the **risk of hyperthyroidism relapse** by combining structured patient data, an AI prediction model, and explainable variable-impact analysis — all in a single, doctor-only environment.

The platform serves three primary user roles:

- **Doctors** — Run single or batch patient predictions, review explainable insights, and manage patient records.
- **Administrators** — Approve doctor registrations, manage user lifecycle, and oversee platform activity.
- **AI Engine** — A Python/Flask microservice that hosts the trained relapse-prediction model and returns probability scores with feature impact.

---

## 2. Key Features

### Clinical Workflow
- **Multi-modal patient intake** — Manual entry or Excel/CSV upload.
- **Single & batch predictions** — Run inference on individual cases or full datasets.
- **Explainable AI** — Probability score plus per-variable impact breakdown.
- **Patient management** — Encrypted patient records with audit trails.
- **Prediction history** — Searchable record of all model runs.

### Administration
- **Doctor approval workflow** — Manual review with credential & license verification.
- **Account lifecycle** — Activate, deactivate, or remove doctor accounts with justification.
- **Dataset import oversight** — Track and audit batch dataset imports.
- **Support inbox** — Centralized contact-form messages from clinicians.

### Security & Compliance
- **Encrypted patient data** at rest (field-level encryption with rotating keys).
- **Blind-index search** on encrypted fields for safe lookups.
- **JWT-based authentication** with refresh tokens and 2-step email verification.
- **Rate limiting** on authentication endpoints.
- **CSP, Helmet, and CORS** hardened HTTP layer.
- **Security event logging** for traceability.

---

## 3. Architecture

```
                   ┌─────────────────────────┐
                   │   Browser (Frontend)    │
                   │   HTML / CSS / Vanilla  │
                   └────────────┬────────────┘
                                │ HTTPS
                                ▼
                   ┌─────────────────────────┐
                   │   Backend (Node.js)     │
                   │   Express + Mongoose    │◀──┐
                   │   Serves static FE      │   │
                   └─────────┬───────────────┘   │
                             │                   │ Object
              ┌──────────────┼────────────────┐  │ storage
              │              │                │  │
              ▼              ▼                ▼  │
        ┌─────────┐    ┌──────────┐     ┌─────┴────┐
        │ MongoDB │    │ AI server │     │  MinIO   │
        │  7.x    │    │ Flask/Py  │     │  (S3)    │
        └─────────┘    └──────────┘     └──────────┘
```

All services communicate over an internal Docker bridge network (`noufar-net`). Only the backend and MinIO console are exposed to the host.

---

## 4. Tech Stack

| Layer          | Technology                                                  |
|----------------|-------------------------------------------------------------|
| **Frontend**   | HTML5, CSS3, Vanilla JavaScript (no framework)             |
| **Backend**    | Node.js 20, Express 5, Mongoose 9                          |
| **AI Server**  | Python 3.11, Flask, scikit-learn, TensorFlow/Keras         |
| **Database**   | MongoDB 7                                                  |
| **Storage**    | MinIO (S3-compatible) for private file uploads             |
| **Auth**       | JWT (access + refresh), bcrypt, email-based 2-step verify  |
| **Email**      | Nodemailer (SMTP)                                          |
| **Security**   | Helmet, CORS allowlist, express-rate-limit, field crypto   |
| **Container**  | Docker, Docker Compose                                     |

---

## 5. Project Structure

```
noufar-cdss/
├── docker-compose.yml         # Orchestrates all services
├── .dockerignore
├── .gitignore
├── README.md                  # You are here
│
├── backend/                   # Node.js / Express API + static frontend host
│   ├── Dockerfile
│   ├── .env.example           # Template — copy to .env and fill secrets
│   ├── package.json
│   ├── scripts/               # Admin seed and database migrations
│   └── src/
│       ├── app.js             # Express app, middleware, CSP, routes
│       ├── server.js          # HTTP entrypoint
│       ├── config/            # DB connection
│       ├── models/            # Mongoose schemas
│       ├── routes/            # REST endpoints
│       ├── controllers/       # Business logic
│       ├── services/          # Shared services (crypto, email, ai)
│       └── middleware/        # Auth, error handling
│
├── frontend/                  # Static UI (served by backend on /)
│   ├── index.html             # Landing page
│   ├── dashboard.html         # Doctor dashboard
│   ├── new-prediction.html    # Prediction form
│   ├── patients.html          # Patient management
│   ├── history.html           # Prediction history
│   ├── admin-doctor-management/   # Admin SPA
│   ├── assets/                # Images, icons, brand
│   └── styles.css, script.js, …
│
├── ai-server/                 # Python / Flask prediction microservice
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py                 # Flask routes
│   ├── pipeline_components.py # Preprocessing pipeline
│   ├── model_registry.py      # Model loading
│   └── exports/               # Serialized model artifacts (.pkl, .keras)
│
└── scripts/                   # Offline ML utilities (training, exports)
```

---

## 6. Prerequisites

Only **two tools** are required on the host machine:

1. **Docker Desktop** — <https://www.docker.com/products/docker-desktop/>
   *(On Windows, enables WSL2 automatically. Ensure Docker Desktop is running before continuing.)*
2. **Git** — <https://git-scm.com/downloads>

Verify your installation:

```bash
docker --version
docker compose version
git --version
```

> Node.js, Python, and MongoDB are **not** required on the host — everything runs inside containers.

---

## 7. Quick Start (Docker)

### Step 1 — Clone the repository

```bash
git clone <YOUR_REPO_URL>.git noufar-cdss
cd noufar-cdss
```

### Step 2 — Configure secrets

```bash
# Linux / macOS
cp backend/.env.example backend/.env

# Windows (PowerShell)
Copy-Item backend\.env.example backend\.env
```

Open `backend/.env` and replace every `change_me_to_...` / `replace_with_...` placeholder.
See [§8 Environment Configuration](#8-environment-configuration) for the minimum required values.

### Step 3 — Launch the stack

```bash
docker compose up --build
```

The first build takes several minutes (pulls base images, installs dependencies). Subsequent runs start in seconds.

When you see:

```
noufar-backend   | MongoDB connected
noufar-backend   | Server running on port 5000
```

…open **<http://localhost:8080>** in your browser.

### Step 4 — Seed the admin account (one-time)

In a second terminal:

```bash
docker compose exec backend npm run seed:admin
```

This creates the initial platform administrator using `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `backend/.env`.

### Stopping the stack

```bash
# Graceful stop (keeps data)
docker compose down

# Stop + wipe database for a fresh start
docker compose down -v
```

---

## 8. Environment Configuration

The `backend/.env` file holds **all secrets**. It must **never** be committed to Git.

### Minimum required values

| Variable                     | Description                                                   |
|------------------------------|---------------------------------------------------------------|
| `JWT_SECRET`                 | Signing key for access tokens (must differ from refresh)      |
| `JWT_REFRESH_SECRET`         | Signing key for refresh tokens                                |
| `ADMIN_REGISTRATION_KEY`     | Shared secret required to register an admin                   |
| `PATIENT_DATA_KEYS`          | 64-hex key(s) for patient field encryption                    |
| `PATIENT_BLIND_INDEX_KEY`    | 64-hex key for blind-index searches                           |
| `SEED_ADMIN_EMAIL`           | Email of the bootstrap admin                                  |
| `SEED_ADMIN_PASSWORD`        | Initial password (change immediately after first login)       |
| `SMTP_*`                     | Outbound mail credentials for password reset & 2-step codes   |

### Generating secure keys

A 64-character hex key (32 bytes) for encryption:

```bash
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 9. Services & Ports

| Service       | Container       | Internal address       | Host address              |
|---------------|-----------------|------------------------|---------------------------|
| **Backend**   | `noufar-backend`| `backend:5000`         | <http://localhost:8080>    |
| **AI Server** | `noufar-ai`     | `ai-server:5001`       | *(not exposed)*           |
| **MongoDB**   | `noufar-mongo`  | `mongo:27017`          | `localhost:27017`         |
| **MinIO API** | `noufar-minio`  | `minio:9000`           | `localhost:9000`          |
| **MinIO UI**  | `noufar-minio`  | `minio:9001`           | <http://localhost:9001>    |

Docker Compose builds an internal bridge network where each service resolves the others by name — no manual configuration required.

---

## 10. Common Commands

```bash
# Tail logs for one service
docker compose logs -f backend
docker compose logs -f ai-server

# Rebuild and restart a single service after code changes
docker compose up -d --build backend

# Open a shell inside a container
docker compose exec backend sh
docker compose exec ai-server sh

# Inspect database with mongosh
docker compose exec mongo mongosh noufar_cdss
```

---

## 11. Database Migrations

Migrations are idempotent Node scripts in `backend/scripts/`. Run them inside the backend container:

```bash
# Encrypt all existing patient records
docker compose exec backend npm run migrate:encrypt-patients

# Encrypt batch dataset import rows
docker compose exec backend npm run migrate:encrypt-dataset-import-rows

# Rotate the patient encryption key
docker compose exec backend npm run migrate:rotate-patient-key

# Backfill doctor ↔ admin assignment
docker compose exec backend npm run migrate:doctor-assigned-admin-id

# Audit doctor ownership
docker compose exec backend npm run audit:doctor-ownership
```

---

## 12. Security

NOUFAR CDSS handles **sensitive patient health data**. The platform enforces multiple defensive layers:

- **Encryption at rest** — Patient fields encrypted with rotating AES keys.
- **Blind-index search** — Lookups on encrypted fields without decrypting the dataset.
- **JWT + refresh tokens** — Short-lived access tokens, refresh rotation, revocation list.
- **2-step verification** — Email-based code required at sensitive actions.
- **Rate limiting** — Brute-force protection on login & registration.
- **CSP, Helmet, CORS** — Hardened HTTP headers and origin allowlist.
- **Audit log** — Security events recorded for traceability.
- **Doctor approval workflow** — No self-service production access; admin review required.

> **Reporting a vulnerability:** Please email the project owner privately. Do **not** open a public issue for security-related reports.

---

## 13. Troubleshooting

| Symptom                                                | Resolution                                                                                            |
|--------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| `port is already allocated` for 8080                   | Change `"8080:5000"` to e.g. `"8081:5000"` in `docker-compose.yml`.                                   |
| `MongoDB connection failed`                            | Mongo takes ~10–20 s on first start. Compose retries via healthcheck — wait it out.                  |
| Backend exits with `JWT_SECRET ...`                    | `backend/.env` is missing or has placeholder values. Fill real secrets and rebuild.                  |
| `docker: command not found` on Windows                 | Docker Desktop is not running. Start it and wait for the whale icon to turn green.                   |
| CORS errors in the browser                             | `APP_BASE_URL` / `CORS_ALLOWED_ORIGINS` in `.env` must match the host URL (`http://localhost:8080`). |
| Cannot connect with MongoDB Compass                    | Verify port `27017` is published in `docker-compose.yml` and `docker compose up -d`.                 |
| `permission denied` on `uploads/`                      | Run `docker compose down -v` to reset the volume, then start again.                                  |
| Stale frontend after edit                              | Frontend is mounted live — hard-refresh the browser (Ctrl+Shift+R).                                  |

---

## 14. Contributing

This is a **private medical project**. External contributions are not accepted at this time. Internal developers should:

1. Create a feature branch from `main`.
2. Run the stack locally with `docker compose up --build`.
3. Submit a pull request with a clear description and test plan.
4. Wait for code review by the project owner before merging.

---

## 15. License

**Proprietary — All rights reserved.**
This software is the property of the NOUFAR CDSS project owner. Unauthorized copying, distribution, modification, or use of any portion of this codebase is strictly prohibited.

---

<p align="center">
  <strong>NOUFAR CDSS</strong> · Clinical Decision Support System<br/>
  Built with care for endocrinology teams.
</p>
