# Radar tunnel

Gets the antenna's live data from the home network to the radar page at
`https://radar.cevenlabs.com/`, without opening router ports.

```
antenna Pi (tar1090) ──LAN──▶ radar-relay.py ──▶ cloudflared ──▶ radar.cevenlabs.com ──▶ radar page
```

`radar-relay.py` only exposes `aircraft.json`, `receiver.json` and `stats.json`,
adds the CORS header browsers need, and caches for a second so many visitors
don't load the antenna.

## Windows PC at home (Matebook), Pi untouched

1. In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel**,
   type **Cloudflared**, name it `ovrhead-radar`.
2. On the install page pick **Windows** and copy the long token at the end of
   the command shown (the part after `service install`). Keep it private.
3. Add a public hostname (also called a published application route):
   subdomain `radar`, domain `cevenlabs.com`, service **HTTP**, URL `localhost:8504`. Save.
4. On the Matebook, copy this folder over, open PowerShell **as administrator** in it, and run:
   ```
   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 -Token <token>
   ```
5. Set the PC to never sleep while plugged in.

## On the Pi itself (alternative)

`bash setup.sh` on the Pi does the same with the relay and tunnel running
there, so no other computer needs to stay on.
