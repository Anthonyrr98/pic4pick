"""Exercise the Swift HTTP client against a local fixture; never writes live data."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import subprocess
import threading

PHOTO_ID = "11111111-1111-4111-8111-111111111111"
seen = set()
errors = []


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, value, status=200):
        data = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def dispatch(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        try:
            if self.path == "/api/auth/login":
                assert json.loads(body) == {"username": "fixture", "password": "fixture-password"}
                assert self.headers.get("Authorization") is None
                return self.respond({"success": True, "token": "fixture-token"})
            if self.headers.get("Authorization") != "Bearer fixture-token":
                return self.respond({"error": "登录失效"}, 401)
            if self.path == "/api/admin/photos" and self.command == "GET":
                return self.respond({"success": True, "data": [{"id": PHOTO_ID,
                    "image_url": "https://example.com/original.jpg", "status": "pending", "hidden": False,
                    "tags": "film_stock:Kodak Gold 200", "category": "film"}]})
            if self.path == "/api/upload/oss":
                assert self.headers["Content-Type"].startswith("multipart/form-data; boundary=")
                assert bytes([0, 255, 13, 10, 127, 42]) in body
                assert f'name="uploadId"\r\n\r\n{PHOTO_ID}'.encode() in body
                seen.add("upload")
                return self.respond({"success": True, "url": "https://example.com/original.jpg",
                    "thumbnailUrl": "https://example.com/preview.jpg", "uploadId": PHOTO_ID})
            if self.path == "/api/admin/photos" and self.command == "POST":
                value = json.loads(body)
                assert value["id"] == value["upload_id"] == PHOTO_ID
                assert value["status"] == "pending" and value["film_stock"] == "Kodak Gold 200"
                assert value["category"] == "film"
                seen.add("create")
                return self.respond({"success": True, "data": [value]}, 201)
            if self.path.endswith("/update"):
                assert json.loads(body) == {"status": "approved", "reject_reason": None}
                seen.add("update")
                return self.respond({"success": True, "data": []})
            if self.command == "DELETE":
                seen.add("delete")
                return self.respond({"success": True, "cleanup": {"pending": True}})
            return self.respond({"error": "fixture route not found"}, 404)
        except Exception as failure:
            errors.append(str(failure) or "Fixture assertion failed")
            self.respond({"error": "Fixture assertion failed"}, 500)

    do_GET = do_POST = do_DELETE = dispatch


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    directory = Path(__file__).resolve().parents[1]
    command = (
        "source ~/.local/share/swiftly/env.sh && mkdir -p .build/checks && "
        "swiftc Sources/Pic4Pick/Photo.swift Sources/Pic4Pick/AdminContract.swift "
        "Sources/Pic4Pick/AdminAPI.swift Tests/AdminChecks.swift -o .build/checks/admin-checks && "
        f".build/checks/admin-checks http://127.0.0.1:{server.server_port}"
    )
    try:
        result = subprocess.run(["bash", "-lc", command], cwd=directory)
        assert result.returncode == 0, "Native admin checks failed"
        assert not errors, errors
        assert seen == {"upload", "create", "update", "delete"}, seen
    finally:
        server.shutdown()
        server.server_close()
