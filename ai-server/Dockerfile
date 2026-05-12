# AI Server — Python Flask
FROM python:3.11-slim

# System deps tensorflow / sklearn / pandas commonly need at runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy source code and trained models
COPY . .

EXPOSE 5001

CMD ["python", "app.py"]
