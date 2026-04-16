# GitLab CI/CD VPS Beta Deploy

This setup is intended for a short private beta on one small Ubuntu VPS.

It uses:
- GitLab CI/CD for deploys
- SSH + `rsync` to push the app to the server
- `systemd` to keep the Node app running
- Nginx + Let's Encrypt for HTTPS
- `NODE_ENV=staging` so the app can run without Postgres and GCS
- `ALLOWED_EMAILS` so only invited Google accounts can sign in

## 1. Prepare The Server

Point your domain to the VPS first, then run:

```bash
sudo bash deploy/vps/bootstrap-ubuntu.sh forms.example.com
```

Edit the generated env file:

```bash
sudo nano /etc/form-builder.env
```

Use [deploy/vps/form-builder.env.example](/Users/dylan/Downloads/form-builder/deploy/vps/form-builder.env.example) as the reference. At minimum set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `ALLOWED_EMAILS`
- `APP_SESSION_SECRET`

After DNS is live, issue TLS:

```bash
sudo certbot --nginx -d forms.example.com
```

## 2. Configure Google OAuth

Create a Google OAuth web application and register this exact redirect URI:

```text
https://forms.example.com/auth/google/callback
```

Put the generated client ID and secret into `/etc/form-builder.env`.

## 3. Add GitLab CI/CD Variables

In GitLab, open `Settings > CI/CD > Variables` and add:

- `SSH_PRIVATE_KEY`
  Use a `File` variable containing your deploy private key.
- `SSH_KNOWN_HOSTS`
  Use a `File` variable containing the result of `ssh-keyscan -H forms.example.com`.
- `DEPLOY_HOST=forms.example.com`
- `DEPLOY_USER=deploy`
- `DEPLOY_PATH=/var/www/form-builder`

Protect these variables if you only deploy from protected branches.

## 4. Create The Deploy Key

On your machine:

```bash
ssh-keygen -t ed25519 -C "gitlab-form-builder-deploy" -f gitlab-form-builder-deploy
ssh-copy-id -i gitlab-form-builder-deploy.pub deploy@forms.example.com
ssh-keyscan -H forms.example.com > known_hosts
```

Upload `gitlab-form-builder-deploy` into `SSH_PRIVATE_KEY` and `known_hosts` into `SSH_KNOWN_HOSTS`.

## 5. Deploy From GitLab

Push to `main`, then run the manual `deploy_beta` job in GitLab.

The pipeline will:
- run tests
- sync the repo to `/var/www/form-builder/current`
- run `npm ci --omit=dev` on the server
- restart the `form-builder` service

## 6. Verify The Release

On the server:

```bash
sudo systemctl status form-builder
journalctl -u form-builder -n 100 --no-pager
curl -I https://forms.example.com/login
```

## 7. Update The Invite List

To add or remove beta users:

```bash
sudo nano /etc/form-builder.env
sudo systemctl restart form-builder
```

Update:

```text
ALLOWED_EMAILS=you@example.com,friend@example.com
```
