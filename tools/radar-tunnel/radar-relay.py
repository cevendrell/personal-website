#!/usr/bin/env python3
"""Radar relay: serves the receiver's live tar1090 data to the website.

Only aircraft.json, receiver.json and stats.json are exposed, read-only, with
the CORS header the browser needs. Responses are cached for one second so
many visitors cost the receiver one request per second at most.
Cloudflare Tunnel points radar.cevenlabs.com at this relay.
"""
import os, sys, time, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Where tar1090's data lives: first argument, else RADAR_UPSTREAM, else this machine.
UPSTREAM = (sys.argv[1] if len(sys.argv) > 1 else
            os.environ.get('RADAR_UPSTREAM', 'http://127.0.0.1/tar1090/data/')).rstrip('/') + '/'
PORT = int(os.environ.get('RADAR_PORT', '8504'))
FILES = {'aircraft.json': 1.0, 'receiver.json': 60.0, 'stats.json': 10.0}  # name -> cache seconds

cache, lock = {}, threading.Lock()


def fetch(name):
    ttl = FILES[name]
    with lock:
        hit = cache.get(name)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    with urllib.request.urlopen(UPSTREAM + name, timeout=5) as r:
        body = r.read()
    with lock:
        cache[name] = (time.time(), body)
    return body


class Relay(BaseHTTPRequestHandler):
    def _head(self, code, length=0):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        if code == 200:
            self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(length))
        self.end_headers()

    def do_GET(self):
        name = self.path.split('?', 1)[0].rsplit('/', 1)[-1]
        if name not in FILES:
            return self._head(404)
        try:
            body = fetch(name)
        except Exception:
            return self._head(502)
        self._head(200, len(body))
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._head(204)

    def log_message(self, *args):
        pass  # keep the journal quiet


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', PORT), Relay).serve_forever()
