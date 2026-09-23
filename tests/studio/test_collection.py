import io
import socket
import ssl

import pytest

from backend.studio import collection
from backend.studio.store import StudioError


def address(ip="8.8.8.8"):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]


class Response:
    def __init__(self, body=b"image", status=200, headers=None):
        self.body = io.BytesIO(body)
        self.status = status
        self.headers = {"Content-Type": "image/png", "Content-Length": str(len(body)), **(headers or {})}

    def getheader(self, key):
        return self.headers.get(key)

    def read1(self, count):
        return self.body.read1(count)


class Connection:
    def __init__(self, response):
        self.response, self.sock, self.closed = response, None, False

    def request(self, method, path, headers):
        self.requested = (method, path, headers)

    def getresponse(self):
        return self.response

    def close(self):
        self.closed = True


def test_download_pins_the_validated_address(tmp_path):
    resolved, calls = [], []
    client = Connection(Response())

    def resolve(host, port, **kwargs):
        resolved.append(host)
        return address()

    def connect(host, pin, timeout):
        calls.append((host, pin))
        return client

    result = collection.download(
        "https://cdn.example/image.png?signature=test", tmp_path, resolve=resolve, connection=connect
    )
    assert result.read_bytes() == b"image"
    assert resolved == ["cdn.example"]
    assert calls == [("cdn.example", address()[0])]
    assert client.requested[1] == "/image.png?signature=test"
    assert client.closed


@pytest.mark.parametrize(
    "url", ["http://cdn.example/a", "https://user:pass@cdn.example/a", "https://cdn.example:8443/a"]
)
def test_unsafe_url_rejected_before_connect(tmp_path, url):
    with pytest.raises(StudioError, match="public HTTPS"):
        collection.download(url, tmp_path, resolve=lambda *a, **k: pytest.fail("Must not resolve"))


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1"])
def test_private_addresses_rejected(tmp_path, ip):
    with pytest.raises(StudioError, match="private"):
        collection.download("https://cdn.example/a", tmp_path, resolve=lambda *a, **k: address(ip))


def test_redirect_revalidates_destination(tmp_path):
    first = Connection(Response(status=302, headers={"Location": "https://internal.example/a"}))

    def resolve(host, *args, **kwargs):
        return address("127.0.0.1" if host == "internal.example" else "8.8.8.8")

    with pytest.raises(StudioError, match="private"):
        collection.download("https://cdn.example/a", tmp_path, resolve=resolve, connection=lambda *a: first)
    assert first.closed
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("response", [Response(body=b"tiny", headers={"Content-Length": "40"}), Response(body=b"")])
def test_incomplete_files_are_removed(tmp_path, response):
    with pytest.raises(StudioError, match="truncated or empty"):
        collection.download(
            "https://cdn.example/a",
            tmp_path,
            resolve=lambda *a, **k: address(),
            connection=lambda *a: Connection(response),
        )
    assert not list(tmp_path.iterdir())


def test_oversize_stream_is_removed(tmp_path, monkeypatch):
    monkeypatch.setattr(collection, "MAX_BYTES", 3)
    response = Response(body=b"longimage", headers={"Content-Length": None})
    with pytest.raises(StudioError, match="limit"):
        collection.download(
            "https://cdn.example/a",
            tmp_path,
            resolve=lambda *a, **k: address(),
            connection=lambda *a: Connection(response),
        )
    assert not list(tmp_path.iterdir())


def test_tls_connect_preserves_hostname_and_does_not_resolve_again(monkeypatch):
    class RawSocket:
        def settimeout(self, value):
            self.timeout = value

        def connect(self, destination):
            self.destination = destination

        def close(self):
            pass

    raw, calls = RawSocket(), []
    context = ssl.create_default_context()
    assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    monkeypatch.setattr(
        context, "wrap_socket", lambda sock, server_hostname: calls.append((sock, server_hostname)) or sock
    )
    made = []
    monkeypatch.setattr(collection.ssl, "create_default_context", lambda **kw: made.append(kw) or context)
    monkeypatch.setattr(collection.socket, "socket", lambda *a: raw)
    client = collection.PinnedHTTPS("cdn.example", address()[0], 30)
    client.connect()
    assert raw.destination == ("8.8.8.8", 443)
    assert calls == [(raw, "cdn.example")]
    # Verified against certifi's bundle, the same one the provider API calls use.
    import certifi

    assert made == [{"cafile": certifi.where()}]
