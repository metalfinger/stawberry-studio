"""HTTPS collection with a pinned public address and verified hostname/SNI."""

import http.client
import ipaddress
import socket
import ssl
import threading
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

from backend.studio.store import StudioError, identifier

MAX_BYTES = 256 * 1024 * 1024


def tls_context():
    """Verify against certifi's CA bundle when it is installed (it comes with httpx), as the
    provider API calls already do. The interpreter's own store can be stale: python.org builds
    on macOS ship without an up-to-date one, and refused fal's CDN chain as self-signed."""
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address, timeout):
        self.address = address
        self.tls = tls_context()
        self.tls.set_alpn_protocols(["http/1.1"])
        super().__init__(host, 443, timeout=timeout, context=self.tls)

    def connect(self):
        family, socktype, proto, _, sockaddr = self.address
        raw = socket.socket(family, socktype, proto)
        try:
            raw.settimeout(self.timeout)
            raw.connect(sockaddr)
            self.sock = self.tls.wrap_socket(raw, server_hostname=self.host)
        except BaseException:
            raw.close()
            raise


def download(url: str, directory: Path, *, resolve=socket.getaddrinfo, connection=PinnedHTTPS, clock=time.monotonic):
    deadline = clock() + 180
    for _ in range(5):
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.port not in {None, 443}
            or any(ord(c) < 32 for c in url)
        ):
            raise StudioError("output_url", "Provider output must be a public HTTPS URL")
        addresses = resolve(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise StudioError("output_url", "Local/private provider output address refused")
        remaining = deadline - clock()
        if remaining <= 0:
            raise StudioError("output_timeout", "Output collection time limit exceeded")
        client = connection(parsed.hostname, addresses[0], min(remaining, 30))

        def abort(client=client):
            sock = client.sock
            if sock:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            client.close()

        timer = threading.Timer(remaining, abort)
        timer.daemon = True
        timer.start()
        try:
            client.request(
                "GET",
                (parsed.path or "/") + ("?" + parsed.query if parsed.query else ""),
                headers={"Accept-Encoding": "identity"},
            )
            response = client.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location:
                    raise StudioError("output_redirect", "Redirect has no destination")
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise StudioError("output_http", f"Output download returned HTTP {response.status}")
            mime = (response.getheader("Content-Type") or "").split(";")[0].strip().lower()
            extension = {
                "image/png": ".png",
                "image/jpeg": ".jpg",
                "image/webp": ".webp",
                "video/mp4": ".mp4",
                "video/webm": ".webm",
            }.get(mime)
            if not extension or response.getheader("Content-Encoding") not in {None, "identity"}:
                raise StudioError("output_type", "Unsupported output type or encoding")
            length = response.getheader("Content-Length")
            expected = int(length) if length is not None and length.isdigit() else None
            if (length is not None and expected is None) or (expected is not None and expected > MAX_BYTES):
                raise StudioError("output_size", "Invalid or excessive output size")
            target, size = directory / (identifier() + extension), 0
            try:
                with target.open("xb") as handle:
                    while True:
                        remaining = deadline - clock()
                        if remaining <= 0:
                            raise StudioError("output_timeout", "Output collection time limit exceeded")
                        if client.sock:
                            client.sock.settimeout(min(remaining, 30))
                        chunk = response.read1(64 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise StudioError("output_size", "Output exceeds the current 256 MiB collection limit")
                        handle.write(chunk)
                if size == 0 or (expected is not None and size != expected):
                    raise StudioError("output_incomplete", "Provider output was truncated or empty")
                return target
            except BaseException:
                target.unlink(missing_ok=True)
                raise
        finally:
            timer.cancel()
            client.close()
    raise StudioError("output_redirect", "Too many provider redirects")
