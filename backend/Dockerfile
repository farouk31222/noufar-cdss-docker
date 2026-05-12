# Backend — Node.js / Express
# IMPORTANT: build context = project root (see docker-compose.yml),
# so we can also copy the frontend folder served as static by express.
FROM node:20-alpine

WORKDIR /app/backend

# Install dependencies first (cached layer)
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source code
COPY backend/. ./

# Copy frontend (express serves ../../frontend as static)
WORKDIR /app
COPY frontend ./frontend

# Ensure uploads directory exists
WORKDIR /app/backend
RUN mkdir -p uploads uploads/support-files

EXPOSE 5000

CMD ["node", "src/server.js"]
