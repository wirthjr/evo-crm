"""Marker model download management (ADR-002).

Called by POST /api/knowledge/parsers/install when the user activates
the Knowledge Base and wants to use the default Marker parser.

Model download is NOT triggered automatically — the UI explicitly asks
the user to install parser models (one-time, ~500MB Surya models).

Sentinel file: ~/.cache/evonexus/marker_installed.ok
    Present → models cached; install endpoint returns "already_installed".
    Absent → download needed.

Install runs asynchronously in a daemon thread.  The frontend polls
GET /api/knowledge/parsers/status to track progress.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


_SENTINEL = Path.home() / ".cache" / "evonexus" / "marker_installed.ok"

_install_lock = threading.Lock()
_install_state: Dict[str, Any] = {
    "running": False,
    "stage": "",
    "progress": 0.0,
    "error": None,
}


def _reset_install_state() -> None:
    with _install_lock:
        _install_state["running"] = False
        _install_state["stage"] = ""
        _install_state["progress"] = 0.0
        _install_state["error"] = None


def get_parser_status() -> Dict[str, Any]:
    """Return current parser installation status.

    Returns:
        {
            "marker_installed": bool,
            "models_cached": list[str],
            "cached_at": iso_timestamp | None,
            "install_running": bool,
            "install_stage": str,
            "install_progress": float (0.0 - 1.0),
            "install_error": str | None,
        }
    """
    installed = _SENTINEL.exists()
    cached_at = _SENTINEL.read_text().strip() if installed else None

    models_cached: List[str] = []
    if installed:
        hf_cache = Path.home() / ".cache" / "huggingface" / "hub"
        if hf_cache.exists():
            models_cached = [
                d.name for d in hf_cache.iterdir()
                if d.is_dir() and ("surya" in d.name.lower() or "marker" in d.name.lower())
            ]

    with _install_lock:
        install_running = _install_state["running"]
        install_stage = _install_state["stage"]
        install_progress = _install_state["progress"]
        install_error = _install_state["error"]

    return {
        "marker_installed": installed,
        "models_cached": models_cached,
        "cached_at": cached_at,
        "install_running": install_running,
        "install_stage": install_stage,
        "install_progress": install_progress,
        "install_error": install_error,
    }


def start_async_install() -> Dict[str, Any]:
    """Start an asynchronous Marker model download.

    Returns immediately.  The frontend polls GET /api/knowledge/parsers/status
    to track progress.

    Returns:
        {"status": "started" | "already_installed" | "already_running"}
    """
    from knowledge.parsers.marker_parser import MarkerNotInstalledError

    if _SENTINEL.exists():
        return {"status": "already_installed", "cached_at": _SENTINEL.read_text().strip()}

    with _install_lock:
        if _install_state["running"]:
            return {"status": "already_running"}
        _install_state["running"] = True
        _install_state["stage"] = "starting"
        _install_state["progress"] = 0.0
        _install_state["error"] = None

    def _progress_callback(stage: str, progress: float) -> None:
        with _install_lock:
            _install_state["stage"] = stage
            _install_state["progress"] = progress

    def _runner() -> None:
        from knowledge.parsers.marker_parser import download_marker_models as _download
        try:
            _download(_progress_callback)
        except MarkerNotInstalledError as exc:
            with _install_lock:
                _install_state["error"] = str(exc)
        except Exception as exc:
            with _install_lock:
                _install_state["error"] = str(exc)
        finally:
            with _install_lock:
                _install_state["running"] = False

    t = threading.Thread(target=_runner, daemon=True)
    t.start()

    return {"status": "started"}


def download_marker_models(
    progress_callback: Optional[Callable[[str, float], None]] = None
) -> Dict[str, Any]:
    """Download and cache Marker/Surya models.

    Delegates to ``marker_parser.download_marker_models``.

    Args:
        progress_callback: optional callable(stage: str, progress: float 0.0-1.0)

    Returns:
        {"status": "ok" | "already_installed", "cached_at": iso_timestamp}

    Raises:
        MarkerNotInstalledError: if marker-pdf is not installed.
    """
    from knowledge.parsers.marker_parser import download_marker_models as _download
    return _download(progress_callback)
