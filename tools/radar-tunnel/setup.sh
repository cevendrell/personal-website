#!/usr/bin/env bash
# One-time setup on the antenna's Raspberry Pi (the one running tar1090).
# Publishes the live data at https://radar.cevenlabs.com/ through a
# Cloudflare Tunnel. No router ports are opened.
#
# Run from this folder on the Pi:   bash setup.sh
set -euo pipefail

HOST="${RADAR_HOST:-radar.cevenlabs.com}"
NAME="${RADAR_TUNNEL:-ovrhead-radar}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== 1/5 Check tar1090 answers locally"
curl -fsS -o /dev/null http://127.0.0.1/tar1090/data/aircraft.json \
  || { echo "tar1090 not answering on http://127.0.0.1/tar1090/data/ — set RADAR_UPSTREAM in the service file"; }

echo "== 2/5 Install the relay as a service"
sudo install -m 755 "$HERE/radar-relay.py" /usr/local/bin/radar-relay.py
sudo tee /etc/systemd/system/radar-relay.service >/dev/null <<'EOF'
[Unit]
Description=Radar relay (tar1090 data -> Cloudflare Tunnel)
After=network-online.target

[Service]
ExecStart=/usr/bin/python3 /usr/local/bin/radar-relay.py
Environment=RADAR_UPSTREAM=http://127.0.0.1/tar1090/data/
DynamicUser=yes
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now radar-relay
sleep 1
curl -fsS -o /dev/null http://127.0.0.1:8504/aircraft.json && echo "relay OK"

echo "== 3/5 Install cloudflared"
if ! command -v cloudflared >/dev/null; then
  sudo mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get update -qq && sudo apt-get install -y cloudflared
fi

echo "== 4/5 Log in to Cloudflare and create the tunnel"
[ -f ~/.cloudflared/cert.pem ] || cloudflared tunnel login   # open the printed link, pick cevenlabs.com
cloudflared tunnel info "$NAME" >/dev/null 2>&1 || cloudflared tunnel create "$NAME"
ID="$(cloudflared tunnel list -o json | python3 -c "import sys,json;print([t['id'] for t in json.load(sys.stdin) if t['name']=='$NAME'][0])")"
cloudflared tunnel route dns --overwrite-dns "$NAME" "$HOST"

echo "== 5/5 Run the tunnel as a service"
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/"$ID".json /etc/cloudflared/
sudo tee /etc/cloudflared/config.yml >/dev/null <<EOF
tunnel: $ID
credentials-file: /etc/cloudflared/$ID.json
ingress:
  - hostname: $HOST
    service: http://127.0.0.1:8504
  - service: http_status:404
EOF
if systemctl list-unit-files cloudflared.service >/dev/null 2>&1 && [ -f /etc/systemd/system/cloudflared.service ]; then
  sudo systemctl restart cloudflared
else
  sudo cloudflared service install
fi

echo
echo "Done. In a minute this should print aircraft data:"
echo "  curl https://$HOST/aircraft.json | head -c 200"
