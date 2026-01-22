# Ticket Scanner

File upload and conversion tool. Converts PDFs and images to viewable images in the browser.

## Tech Stack

- React + TypeScript + Vite
- PDF.js for PDF rendering
- Nginx with basic auth
- Docker deployment

## Local Development

```bash
npm install
npm run dev
```

## Deployment

### Server

- **Host**: hetzner-prod (88.99.51.122)
- **URL**: https://tickets.ab-civil.com
- **Port**: 3100 (internal)

### SSH Access

```bash
# Via Teleport
tsh ssh root@hetzner-prod

# Direct (if configured)
ssh root@88.99.51.122
```

### Deploy Commands

```bash
cd /opt/ticket-scanner
git pull
docker compose up -d --build
```

### First-Time Setup

```bash
# On the server
mkdir -p /opt/ticket-scanner
cd /opt/ticket-scanner
git clone https://github.com/ab-civil-consulting/ticket-scanner.git .
docker compose up -d --build
```

## Basic Auth

Default credentials: `admin` / `admin`

To change the password, edit the Dockerfile:
```dockerfile
RUN htpasswd -cb /etc/nginx/.htpasswd username password
```

Then rebuild: `docker compose up -d --build`

## Features

- Drag & drop file upload
- PDF to image conversion (all pages)
- Image preview
- Click to view full-size converted images
