#!/usr/bin/env python3
"""
Deploy API v2 — Extends the existing deploy API with Docker support.
Run this on the HOST server (not inside the container).

Usage:
  1. Stop the old deploy API: kill $(lsof -t -i:5000)
  2. Run this: python3 /root/.openclaw/workspace/projects/website-builder/backend/deploy-api-upgrade.py
  3. Or use systemd/pm2 to keep it running

Endpoints:
  GET  /status              — health check
  POST /deploy              — deploy static site (existing)
  POST /undeploy            — remove static site (existing)
  POST /docker/build        — build Docker image from project files
  POST /docker/run          — start a Docker container
  POST /docker/stop         — stop a Docker container
  POST /docker/remove       — remove a Docker container
  POST /docker/deploy-app   — full deploy: build + run + nginx + ssl (all-in-one)
  GET  /docker/list         — list running app containers
  POST /docker/undeploy-app — full undeploy: stop + remove + cleanup nginx
"""

from flask import Flask, request, jsonify
import subprocess
import os
import shutil
import json

app = Flask(__name__)

# ── Existing endpoints (unchanged) ──────────────────────────────────────────

@app.route('/status')
def status():
    return jsonify({"status": "online", "version": "2.0-docker"})

@app.route('/deploy', methods=['POST'])
def deploy():
    """Deploy static site — copies files to /var/www/ and sets up Nginx + SSL"""
    data = request.json
    domain = data.get('domain')
    files_path = data.get('files_path')

    if not domain or not files_path:
        return jsonify({"success": False, "error": "domain and files_path required"})

    web_root = f"/var/www/{domain}"
    nginx_conf = f"/etc/nginx/sites-available/{domain}"

    try:
        # Copy files
        os.makedirs(web_root, exist_ok=True)
        result = subprocess.run(
            f"cp -r {files_path}/* {web_root}/",
            shell=True, capture_output=True, text=True
        )
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr, "failed_step": "copy files"})

        # Copy nginx config if exists
        nginx_src = os.path.join(files_path, 'nginx.conf')
        if os.path.exists(nginx_src):
            result = subprocess.run(
                f"cp {nginx_src} {nginx_conf}",
                shell=True, capture_output=True, text=True
            )
            if result.returncode != 0:
                return jsonify({"success": False, "error": result.stderr, "failed_step": f"cp {nginx_src} {nginx_conf}"})

        # Enable site
        enabled = f"/etc/nginx/sites-enabled/{domain}"
        if not os.path.exists(enabled):
            os.symlink(nginx_conf, enabled)

        # Test and reload nginx
        result = subprocess.run("nginx -t", shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr, "failed_step": "nginx -t"})

        subprocess.run("systemctl reload nginx", shell=True)

        # SSL
        result = subprocess.run(
            f"certbot --nginx -d {domain} --non-interactive --agree-tos -m admin@kenzoagent.com",
            shell=True, capture_output=True, text=True
        )
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr, "failed_step": f"certbot --nginx -d {domain}"})

        return jsonify({"success": True, "url": f"https://{domain}"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/undeploy', methods=['POST'])
def undeploy():
    """Remove static site"""
    data = request.json
    domain = data.get('domain')
    if not domain:
        return jsonify({"success": False, "error": "domain required"})

    try:
        # Remove nginx config
        for path in [f"/etc/nginx/sites-enabled/{domain}", f"/etc/nginx/sites-available/{domain}"]:
            if os.path.exists(path):
                os.remove(path)

        # Reload nginx
        subprocess.run("nginx -t && systemctl reload nginx", shell=True)

        # Remove web root
        web_root = f"/var/www/{domain}"
        if os.path.exists(web_root):
            shutil.rmtree(web_root)

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# ── New Docker endpoints ────────────────────────────────────────────────────

@app.route('/docker/deploy-app', methods=['POST'])
def docker_deploy_app():
    """
    All-in-one full-stack app deployment:
    1. Build Docker image
    2. Stop/remove old container if exists
    3. Start new container with resource limits
    4. Set up Nginx reverse proxy
    5. Get SSL certificate
    """
    data = request.json
    subdomain = data.get('subdomain')
    files_path = data.get('files_path')  # host path to project files (must include Dockerfile)
    port = data.get('port', 4001)
    memory = data.get('memory', '128m')
    cpus = data.get('cpus', '0.25')
    env_vars = data.get('env', {})  # dict of environment variables

    if not subdomain or not files_path:
        return jsonify({"success": False, "error": "subdomain and files_path required"})

    domain = f"{subdomain}.kenzoagent.com"
    container_name = f"app-{subdomain}"

    try:
        # Step 1: Stop and remove existing container
        subprocess.run(f"docker stop {container_name}", shell=True, capture_output=True)
        subprocess.run(f"docker rm {container_name}", shell=True, capture_output=True)

        # Step 2: Build Docker image
        result = subprocess.run(
            f"docker build -t {container_name} {files_path}",
            shell=True, capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr, "failed_step": "docker build"})

        # Step 3: Start container
        env_flags = " ".join([f"-e {k}={v}" for k, v in env_vars.items()])
        run_cmd = (
            f"docker run -d "
            f"--name {container_name} "
            f"-p {port}:3000 "
            f"--memory={memory} "
            f"--cpus={cpus} "
            f"--restart=unless-stopped "
            f"{env_flags} "
            f"{container_name}"
        )
        result = subprocess.run(run_cmd, shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr, "failed_step": "docker run"})

        container_id = result.stdout.strip()[:12]

        # Step 4: Set up Nginx reverse proxy
        nginx_conf = f"""server {{
    listen 80;
    server_name {domain};
    location / {{
        proxy_pass http://127.0.0.1:{port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }}
}}"""
        nginx_path = f"/etc/nginx/sites-available/{domain}"
        with open(nginx_path, 'w') as f:
            f.write(nginx_conf)

        enabled_path = f"/etc/nginx/sites-enabled/{domain}"
        if not os.path.exists(enabled_path):
            os.symlink(nginx_path, enabled_path)

        # Test and reload Nginx
        result = subprocess.run("nginx -t", shell=True, capture_output=True, text=True)
        if result.returncode != 0:
            return jsonify({"success": False, "error": result.stderr, "failed_step": "nginx -t"})
        subprocess.run("systemctl reload nginx", shell=True)

        # Step 5: SSL certificate
        subprocess.run(
            f"certbot --nginx -d {domain} --non-interactive --agree-tos -m admin@kenzoagent.com",
            shell=True, capture_output=True, text=True
        )

        return jsonify({
            "success": True,
            "url": f"https://{domain}",
            "container": container_name,
            "container_id": container_id,
            "port": port
        })

    except subprocess.TimeoutExpired:
        return jsonify({"success": False, "error": "Docker build timed out (120s)"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/docker/undeploy-app', methods=['POST'])
def docker_undeploy_app():
    """Stop and remove a Docker app container + Nginx config"""
    data = request.json
    subdomain = data.get('subdomain')
    if not subdomain:
        return jsonify({"success": False, "error": "subdomain required"})

    domain = f"{subdomain}.kenzoagent.com"
    container_name = f"app-{subdomain}"

    try:
        # Stop and remove container
        subprocess.run(f"docker stop {container_name}", shell=True, capture_output=True)
        subprocess.run(f"docker rm {container_name}", shell=True, capture_output=True)

        # Remove Docker image
        subprocess.run(f"docker rmi {container_name}", shell=True, capture_output=True)

        # Remove Nginx config
        for path in [f"/etc/nginx/sites-enabled/{domain}", f"/etc/nginx/sites-available/{domain}"]:
            if os.path.exists(path):
                os.remove(path)
        subprocess.run("nginx -t && systemctl reload nginx", shell=True)

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/docker/list', methods=['GET'])
def docker_list():
    """List all running app containers"""
    try:
        result = subprocess.run(
            'docker ps --filter "name=app-" --format "{{.Names}}|{{.Status}}|{{.Ports}}"',
            shell=True, capture_output=True, text=True
        )
        containers = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split('|')
            containers.append({
                "name": parts[0] if len(parts) > 0 else "",
                "status": parts[1] if len(parts) > 1 else "",
                "ports": parts[2] if len(parts) > 2 else ""
            })
        return jsonify({"containers": containers})
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/docker/stop', methods=['POST'])
def docker_stop():
    """Stop a specific container"""
    container = request.json.get('container')
    if not container or not container.startswith('app-'):
        return jsonify({"success": False, "error": "Invalid container name"})
    result = subprocess.run(f"docker stop {container}", shell=True, capture_output=True, text=True)
    return jsonify({"success": result.returncode == 0, "output": result.stdout})

@app.route('/docker/restart', methods=['POST'])
def docker_restart():
    """Restart a specific container"""
    container = request.json.get('container')
    if not container or not container.startswith('app-'):
        return jsonify({"success": False, "error": "Invalid container name"})
    result = subprocess.run(f"docker restart {container}", shell=True, capture_output=True, text=True)
    return jsonify({"success": result.returncode == 0, "output": result.stdout})

# ── Start server ────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("🚀 Deploy API v2.0 (with Docker support) running on port 5000")
    app.run(host='0.0.0.0', port=5000)
