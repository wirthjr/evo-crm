"""Tests for provider configuration and validation routes."""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "dashboard" / "backend"
sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    root = tmp_path / "workspace-root"
    (root / "dashboard" / "data").mkdir(parents=True, exist_ok=True)
    (root / "workspace").mkdir(parents=True, exist_ok=True)
    (root / "config").mkdir(parents=True, exist_ok=True)

    monkeypatch.setenv("EVONEXUS_SECRET_KEY", "test-secret-providers")
    monkeypatch.setenv("EVONEXUS_ENV", "development")
    return root


@pytest.fixture
def app(workspace, monkeypatch):
    import flask
    from flask_login import LoginManager
    import models as _models
    import routes.providers as _providers

    importlib.reload(_models)
    importlib.reload(_providers)
    monkeypatch.setattr(_providers, "PROVIDERS_CONFIG", workspace / "config" / "providers.json")

    _app = flask.Flask(__name__)
    _app.config["TESTING"] = True
    _app.config["SECRET_KEY"] = "test-secret-providers"
    _app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    _app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    _models.db.init_app(_app)

    login_manager = LoginManager()
    login_manager.init_app(_app)

    @login_manager.user_loader
    def load_user(user_id):
        return _models.User.query.get(int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        return flask.jsonify({"error": "Authentication required"}), 401

    _app.register_blueprint(_providers.bp)

    with _app.app_context():
        _models.db.create_all()
        _models.seed_roles()
        admin = _models.User(
            username="admin",
            email="admin@example.com",
            display_name="Admin",
            role="admin",
        )
        admin.set_password("Strong!234")
        _models.db.session.add(admin)
        _models.db.session.commit()

    return _app


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c


def _login_as_admin(client):
    with client.session_transaction() as session:
        from models import User

        user = User.query.filter_by(username="admin").one()
        session["_user_id"] = str(user.id)
        session["_fresh"] = True


def _write_providers_config(workspace: Path, payload: dict) -> Path:
    config_path = workspace / "config" / "providers.json"
    config_path.write_text(json.dumps(payload), encoding="utf-8")
    return config_path


def test_update_provider_config_preserves_existing_secret_when_omitted(client, app, workspace):
    _write_providers_config(
        workspace,
        {
            "active_provider": "openrouter",
            "providers": {
                "openrouter": {
                    "name": "OpenRouter",
                    "cli_command": "openclaude",
                    "env_vars": {
                        "CLAUDE_CODE_USE_OPENAI": "1",
                        "OPENAI_BASE_URL": "https://openrouter.ai/api/v1",
                        "OPENAI_API_KEY": "sk-or-existing-secret",
                        "OPENAI_MODEL": "anthropic/claude-sonnet-4",
                    },
                }
            },
        },
    )

    with app.test_request_context():
        _login_as_admin(client)

    response = client.post(
        "/api/providers/openrouter/config",
        json={
            "env_vars": {
                "OPENAI_BASE_URL": "https://openrouter.ai/api/v1",
                "OPENAI_MODEL": "qwen/qwen3-coder:free",
            }
        },
    )

    assert response.status_code == 200
    saved = json.loads((workspace / "config" / "providers.json").read_text(encoding="utf-8"))
    env_vars = saved["providers"]["openrouter"]["env_vars"]
    assert env_vars["OPENAI_API_KEY"] == "sk-or-existing-secret"
    assert env_vars["OPENAI_MODEL"] == "qwen/qwen3-coder:free"


def test_provider_test_rejects_missing_required_config(client, app, workspace, monkeypatch):
    _write_providers_config(
        workspace,
        {
            "active_provider": "openrouter",
            "providers": {
                "openrouter": {
                    "name": "OpenRouter",
                    "cli_command": "openclaude",
                    "env_vars": {
                        "CLAUDE_CODE_USE_OPENAI": "1",
                        "OPENAI_BASE_URL": "https://openrouter.ai/api/v1",
                        "OPENAI_API_KEY": "",
                        "OPENAI_MODEL": "qwen/qwen3-coder:free",
                    },
                }
            },
        },
    )

    import routes.providers as _providers

    monkeypatch.setattr(_providers.shutil, "which", lambda _cmd: "/usr/bin/openclaude")

    def _unexpected_run(*_args, **_kwargs):
        raise AssertionError("CLI version check should not run when required config is missing")

    monkeypatch.setattr(_providers, "_run_cli_version", _unexpected_run)

    with app.test_request_context():
        _login_as_admin(client)

    response = client.post("/api/providers/openrouter/test")
    payload = response.get_json()

    assert response.status_code == 400
    assert payload["success"] is False
    assert "OPENAI_API_KEY" in payload["error"]
