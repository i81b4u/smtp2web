#!/usr/bin/env python3
"""Small controllable HTTP receiver used only by smtp2web integration tests."""

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class GatewayState:
    def __init__(self):
        # The threaded server can receive a retry while a prior request is
        # completing, so action consumption and request recording share a lock.
        self.lock = threading.Lock()
        self.actions = []
        self.requests = []


STATE = GatewayState()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        return json.loads(self.rfile.read(length).decode('utf-8'))

    def send_json(self, status, body):
        encoded = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        if self.path == '/__control':
            # This loopback-only control endpoint lets the shell runner select
            # the next response sequence for each scenario.
            control = self.read_json()
            actions = control.get('actions')
            if not isinstance(actions, list):
                self.send_json(400, {'error': 'actions must be a list'})
                return
            with STATE.lock:
                STATE.actions = actions
            self.send_json(200, {'ok': True})
            return

        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length).decode('utf-8')
        with STATE.lock:
            STATE.requests.append({
                'path': self.path,
                'headers': dict(self.headers.items()),
                'body': body,
            })
            action = STATE.actions.pop(0) if STATE.actions else 200

        if action == 'drop':
            # Simulates a receiver that processed the request but whose response
            # was lost, exercising smtp2web's at-least-once delivery behavior.
            self.connection.shutdown(2)
            self.connection.close()
            return

        if not isinstance(action, int) or not 100 <= action <= 599:
            self.send_json(500, {'error': 'invalid test action'})
            return

        self.send_json(action, {'status': action})

    def do_GET(self):
        if self.path == '/__received':
            # The runner reads this endpoint to assert request bodies and
            # headers independently of smtp2web's own log output.
            with STATE.lock:
                self.send_json(200, {'requests': STATE.requests})
            return
        self.send_json(404, {'error': 'not found'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--ready-file', required=True)
    args = parser.parse_args()

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    # The ready file communicates the kernel-selected port to the shell runner
    # without parsing process output.
    with open(args.ready_file, 'w', encoding='utf-8') as ready:
        json.dump({'port': server.server_port}, ready)
    server.serve_forever()


if __name__ == '__main__':
    main()
