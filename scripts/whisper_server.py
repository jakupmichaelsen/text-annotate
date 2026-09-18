import cgi
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel


HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("WHISPER_PORT", "8765"))
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
MODEL = WhisperModel(
    MODEL_NAME,
    device=os.environ.get("WHISPER_DEVICE", "cpu"),
    compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
)


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "model": MODEL_NAME})
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_json(404, {"error": "Not found"})
            return

        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", "")},
            )
            upload = form["file"]
            if not getattr(upload, "file", None):
                raise ValueError("Missing audio file")

            suffix = os.path.splitext(getattr(upload, "filename", "audio"))[1] or ".audio"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
                upload.file.seek(0)
                temp.write(upload.file.read())
                temp_path = temp.name

            try:
                segments, info = MODEL.transcribe(temp_path, word_timestamps=True, vad_filter=True)
                result_segments = []
                text_parts = []
                for segment in segments:
                    words = [
                        {"word": word.word, "start": word.start, "end": word.end}
                        for word in (segment.words or [])
                    ]
                    result_segments.append({
                        "start": segment.start,
                        "end": segment.end,
                        "text": segment.text,
                        "words": words,
                    })
                    text_parts.append(segment.text)
                self.send_json(200, {
                    "text": " ".join(text_parts).strip(),
                    "language": info.language,
                    "segments": result_segments,
                })
            finally:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)


if __name__ == "__main__":
    print(f"Local faster-whisper server: http://{HOST}:{PORT} ({MODEL_NAME})", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
