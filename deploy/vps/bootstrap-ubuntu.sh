#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run this script with sudo."
  exit 1
fi

if [ $# -ne 1 ]; then
  echo "Usage: sudo bash deploy/vps/bootstrap-ubuntu.sh forms.example.com"
  exit 1
fi

APP_DOMAIN="$1"
APP_ROOT="/var/www/form-builder"
APP_DATA_ROOT="/var/lib/form-builder/template-library"
SERVICE_PATH="/etc/systemd/system/form-builder.service"
NGINX_PATH="/etc/nginx/sites-available/form-builder"
ENV_PATH="/etc/form-builder.env"

apt update
apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx rsync git build-essential ufw

if ! id -u deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi

mkdir -p "${APP_ROOT}/current" "${APP_DATA_ROOT}"
chown -R deploy:deploy /var/www/form-builder /var/lib/form-builder

if [ ! -f "${ENV_PATH}" ]; then
  cat > "${ENV_PATH}" <<EOF
NODE_ENV=staging
PORT=3000
TRUST_PROXY=1
TEMPLATE_LIBRARY_ROOT=${APP_DATA_ROOT}
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_OAUTH_REDIRECT_URI=https://${APP_DOMAIN}/auth/google/callback
ALLOWED_EMAILS=you@example.com,friend@example.com
ADMIN_EMAILS=you@example.com
APP_SESSION_SECRET=replace-with-a-long-random-secret
ENABLE_AI_ASSIST=0
ENABLE_AI_TRANSLATION=0
ENABLE_FILE_UPLOADS=0
ENABLE_AI_DICTATION=0
ENABLE_IMAGE_EXTRACTION=0
EOF
  chmod 600 "${ENV_PATH}"
fi

cat > "${SERVICE_PATH}" <<'EOF'
[Unit]
Description=Form Builder
After=network.target

[Service]
User=deploy
Group=deploy
WorkingDirectory=/var/www/form-builder/current
EnvironmentFile=/etc/form-builder.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > "${NGINX_PATH}" <<EOF
server {
  server_name ${APP_DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

ln -sf "${NGINX_PATH}" /etc/nginx/sites-enabled/form-builder
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable form-builder
nginx -t
systemctl reload nginx

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

if [ ! -f /etc/sudoers.d/form-builder-deploy ]; then
  echo 'deploy ALL=NOPASSWD: /usr/bin/systemctl restart form-builder, /usr/bin/systemctl status form-builder' > /etc/sudoers.d/form-builder-deploy
  chmod 440 /etc/sudoers.d/form-builder-deploy
fi

echo
echo "Base setup complete."
echo "Next:"
echo "1. Edit ${ENV_PATH}"
echo "2. Point DNS for ${APP_DOMAIN} to this server"
echo "3. Run: certbot --nginx -d ${APP_DOMAIN}"
