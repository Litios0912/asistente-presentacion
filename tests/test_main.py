from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root():
    resp = client.get("/")
    assert resp.status_code == 200


def test_upload_no_file():
    resp = client.post("/upload")
    assert resp.status_code == 422


def test_analyze_no_session():
    resp = client.post("/analyze/fake-id", json={"groq_key": "test"})
    assert resp.status_code == 404


def test_health():
    resp = client.get("/healthz")
    assert resp.status_code == 404  # no endpoint
