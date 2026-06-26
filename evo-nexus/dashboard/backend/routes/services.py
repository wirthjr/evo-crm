"""Services endpoint — check running background services."""

import json
import logging
import os
import shutil
import subprocess
import time
import traceback
import urllib.request
from flask import Blueprint, jsonify
from routes._helpers import WORKSPACE

log = logging.getLogger(__name__)

bp = Blueprint("services", __name__)

DEBUG_ENV_PATH = WORKSPACE / ".dbg" / "telegram-start.env"


def _build_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin:" + os.path.expanduser("~/.local/bin"))
    return env


def _debug_event(
    hypothesis_id: str,
    location: str,
    msg: str,
    data: dict | None = None,
    *,
    trace_id: str | None = None,
    run_id: str = "pre-fix",
) -> None:
    # #region debug-point A:report
    try:
        debug_url = "http://127.0.0.1:7777/event"
        session_id = "telegram-start"
        if DEBUG_ENV_PATH.exists():
            for line in DEBUG_ENV_PATH.read_text(encoding="utf-8").splitlines():
                if line.startswith("DEBUG_SERVER_URL="):
                    debug_url = line.split("=", 1)[1].strip() or debug_url
                elif line.startswith("DEBUG_SESSION_ID="):
                    session_id = line.split("=", 1)[1].strip() or session_id
        payload = {
            "sessionId": session_id,
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "msg": msg,
            "data": data or {},
            "traceId": trace_id,
            "ts": round(time.time() * 1000),
        }
        req = urllib.request.Request(
            debug_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=1).read()
    except Exception:
        pass
    # #endregion


def _check_process(cmd_args: list[str], pipe_grep: str | None = None) -> dict:
    """Check if a process is running using argument-list subprocess calls.

    If pipe_grep is provided, runs cmd_args and filters output for the pattern.
    """
    try:
        result = subprocess.run(cmd_args, capture_output=True, text=True, timeout=5, env=_build_env())
        output = result.stdout.strip()
        if pipe_grep and output:
            output = "\n".join(l for l in output.splitlines() if pipe_grep in l)
        running = result.returncode == 0 and output != ""
        return {"running": running, "detail": output[:200] if running else ""}
    except Exception:
        return {"running": False, "detail": ""}


def _check_scheduler() -> dict:
    """Check if scheduler thread is running inside the dashboard process."""
    import threading
    for t in threading.enumerate():
        if t.name == "scheduler" and t.is_alive():
            return {"running": True, "detail": "Running (embedded in dashboard)"}
    # Fallback: check for standalone scheduler.py process
    result = _check_process(["ps", "aux"], pipe_grep="scheduler.py")
    return result


@bp.route("/api/services")
def list_services():
    services = [
        {
            "id": "scheduler",
            "name": "Scheduler",
            "description": "Automated routines (daily, weekly, monthly) — runs with dashboard",
            "command": "make dashboard-app",
            **_check_scheduler(),
        },
        {
            "id": "telegram",
            "name": "Telegram Bot",
            "description": "Telegram Channel — receives and responds to messages via Claude",
            "command": "make telegram",
            "category": "channel",
            **_check_process(["screen", "-list"], pipe_grep="telegram"),
        },
        {
            "id": "discord-channel",
            "name": "Discord Channel",
            "description": "Discord Channel — bidirectional chat bridge with Claude Code",
            "command": "make discord-channel",
            "category": "channel",
            **_check_process(["screen", "-list"], pipe_grep="discord-channel"),
        },
        {
            "id": "imessage",
            "name": "iMessage Channel",
            "description": "iMessage Channel — chat with Claude via Messages (macOS)",
            "command": "make imessage",
            "category": "channel",
            **_check_process(["screen", "-list"], pipe_grep="imessage"),
        },
        {
            "id": "dashboard",
            "name": "Dashboard App",
            "description": "This dashboard (React + Flask)",
            "command": "make dashboard-app",
            **_check_process(["ps", "aux"], pipe_grep="app.py"),
        },
    ]

    return jsonify(services)


WORKSPACE_STR = str(WORKSPACE)

# ── Manual routine execution ─────────────────────────


@bp.route("/api/routines/<routine_id>/run", methods=["POST"])
def run_routine(routine_id):
    """Manually trigger a routine execution."""
    import shutil
    from pathlib import Path
    from routes._helpers import get_routine_scripts
    routine_scripts = get_routine_scripts()

    script = routine_scripts.get(routine_id)
    if not script:
        # Try matching by script name
        for name, s in routine_scripts.items():
            if routine_id.replace("-", "_") in s or s.replace(".py", "") == routine_id.replace("-", "_"):
                script = s
                break
    if not script:
        return jsonify({"error": f"Unknown routine: {routine_id}"}), 400

    # Validate script path is within ADWs/routines/
    script_path = (WORKSPACE / "ADWs" / "routines" / script).resolve()
    allowed_dir = (WORKSPACE / "ADWs" / "routines").resolve()
    if not str(script_path).startswith(str(allowed_dir)):
        return jsonify({"error": "Invalid script path"}), 400
    if not script_path.exists():
        return jsonify({"error": f"Script not found: {script}"}), 404

    python_bin = shutil.which("uv")
    cmd_args = ["uv", "run", "python", str(script_path)] if python_bin else ["python3", str(script_path)]
    try:
        subprocess.Popen(
            cmd_args,
            cwd=WORKSPACE_STR,
            env=_build_env(),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return jsonify({"status": "started", "routine": routine_id, "script": script})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/services/restart-all", methods=["POST"])
def restart_all_services():
    """Restart all EvoNexus services (dashboard + scheduler + terminal-server).

    Kills processes directly and re-runs start-services.sh, bypassing
    'systemctl restart' which doesn't reliably kill children on Type=oneshot
    services with KillMode=none.
    """
    import shutil
    import os
    workspace = str(WORKSPACE)
    start_script = os.path.join(workspace, "start-services.sh")

    if not os.path.exists(start_script):
        return jsonify({"error": "start-services.sh not found"}), 400

    # Kill existing processes then re-run start-services.sh.
    # sleep 2 gives Flask time to send this response before app.py dies.
    cmd = (
        "sleep 2 && "
        "pkill -f 'terminal-server/bin/server.js' 2>/dev/null; "
        "pkill -f 'python.*scheduler.py' 2>/dev/null; "
        "pkill -f 'python.*app.py' 2>/dev/null; "
        "sleep 1 && "
        f"bash {start_script}"
    )
    subprocess.Popen(
        ["bash", "-c", cmd],
        start_new_session=True,
        cwd=workspace,
        env=_build_env(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return jsonify({"status": "restarting", "message": "Services will restart in ~3 seconds"})


TELEGRAM_LOG = f"{WORKSPACE_STR}/ADWs/logs/telegram.log"
SCHEDULER_LOG = f"{WORKSPACE_STR}/ADWs/logs/scheduler.log"

START_CMDS: dict[str, list[str]] = {
    "scheduler": ["uv", "run", "python", "-u", "scheduler.py"],
    "telegram": ["screen", "-dmS", "telegram", "claude", "--channels", "plugin:telegram@claude-plugins-official", "--dangerously-skip-permissions"],
    "discord-channel": ["screen", "-dmS", "discord-channel", "claude", "--channels", "plugin:discord@claude-plugins-official", "--dangerously-skip-permissions"],
    "imessage": ["screen", "-dmS", "imessage", "claude", "--channels", "plugin:imessage@claude-plugins-official", "--dangerously-skip-permissions"],
}

STOP_CMDS: dict[str, list[str]] = {
    "scheduler": ["pkill", "-f", "scheduler.py"],
    "telegram": ["screen", "-S", "telegram", "-X", "quit"],
    "discord-channel": ["screen", "-S", "discord-channel", "-X", "quit"],
    "imessage": ["screen", "-S", "imessage", "-X", "quit"],
}


@bp.route("/api/services/<service_id>/start", methods=["POST"])
def start_service(service_id):
    cmd_args = START_CMDS.get(service_id)
    if not cmd_args:
        return jsonify({"error": f"Unknown service: {service_id}"}), 400
    trace_id = f"{service_id}-{round(time.time() * 1000)}"
    env = _build_env()
    try:
        if service_id == "telegram":
            # #region debug-point A:start-request
            _debug_event(
                "A",
                "routes/services.py:start_service:before-popen",
                "[DEBUG] Telegram start requested from dashboard",
                {
                    "service_id": service_id,
                    "cmd_args": cmd_args,
                    "cwd": WORKSPACE_STR,
                    "screen_path": shutil.which("screen"),
                    "claude_path": shutil.which("claude"),
                    "bot_token_present": bool(env.get("TELEGRAM_BOT_TOKEN")),
                    "chat_id_present": bool(env.get("TELEGRAM_CHAT_ID")),
                },
                trace_id=trace_id,
            )
            # #endregion
        if service_id == "scheduler":
            log_file = open(SCHEDULER_LOG, "a")
            subprocess.Popen(cmd_args, cwd=WORKSPACE_STR, env=env, stdout=log_file, stderr=log_file)
        else:
            proc = subprocess.Popen(cmd_args, cwd=WORKSPACE_STR, env=env)
            if service_id == "telegram":
                # #region debug-point C:post-spawn
                time.sleep(1)
                screen_state = _check_process(["screen", "-list"], pipe_grep="telegram")
                _debug_event(
                    "C",
                    "routes/services.py:start_service:after-popen",
                    "[DEBUG] Telegram start command dispatched",
                    {
                        "pid": proc.pid,
                        "returncode_after_1s": proc.poll(),
                        "screen_running": screen_state["running"],
                        "screen_detail": screen_state["detail"],
                        "path_head": (env.get("PATH", "")[:400]),
                    },
                    trace_id=trace_id,
                )
                # #endregion
        return jsonify({"status": "started", "id": service_id})
    except Exception as e:
        if service_id == "telegram":
            # #region debug-point B:start-error
            _debug_event(
                "B",
                "routes/services.py:start_service:exception",
                "[DEBUG] Telegram start failed before screen session stabilized",
                {
                    "error": str(e),
                    "exception_type": type(e).__name__,
                    "screen_path": shutil.which("screen"),
                    "claude_path": shutil.which("claude"),
                },
                trace_id=trace_id,
            )
            # #endregion
        log.error("Failed to start service %s: %s\n%s", service_id, e, traceback.format_exc())
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500


@bp.route("/api/services/<service_id>/logs")
def service_logs(service_id):
    """Get recent output from a service."""
    if service_id == "telegram":
        from routes._helpers import safe_read

        # Read from log file
        log_path = WORKSPACE / "ADWs" / "logs" / "telegram.log"
        content = safe_read(log_path)
        if content:
            # Clean ANSI escape codes and control chars
            import re
            clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', content)
            clean = re.sub(r'\x1b\][^\x07]*\x07', '', clean)  # OSC sequences
            clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', clean)  # control chars
            lines = [l for l in clean.split('\n') if l.strip()]
            if lines:
                return jsonify({"lines": lines[-200:]})

        # Check if running but no log yet
        try:
            result = _check_process(["screen", "-list"], pipe_grep="telegram")
            if result["running"]:
                return jsonify({"lines": [
                    "Telegram bot is running.",
                    "Log file will populate as messages are processed.",
                    "",
                    "If started before this update, restart with Stop → Start",
                    "to enable logging.",
                    "",
                    f"Screen: {result['detail']}",
                ]})
        except Exception:
            pass

        return jsonify({"lines": ["Telegram bot is not running. Click Start to launch it."]})

    elif service_id == "scheduler":
        from routes._helpers import safe_read

        # Read real scheduler process output
        log_path = WORKSPACE / "ADWs" / "logs" / "scheduler.log"
        content = safe_read(log_path)
        if content:
            import re
            # Clean ANSI escape codes and control chars (Rich output)
            clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', content)
            clean = re.sub(r'\x1b\][^\x07]*\x07', '', clean)  # OSC sequences
            clean = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', clean)  # control chars
            lines = [l for l in clean.split('\n') if l.strip()]
            if lines:
                return jsonify({"lines": lines[-200:]})

        # Check if running but no log yet
        try:
            result = _check_process(["ps", "aux"], pipe_grep="scheduler.py")
            if result["running"]:
                return jsonify({"lines": [
                    "Scheduler is running.",
                    "Log file will populate as routines execute.",
                    "",
                    "If started before this update, restart with Stop → Start",
                    "to enable log capture.",
                ]})
        except Exception:
            pass

        return jsonify({"lines": ["Scheduler is not running. Click Start to launch it."]})

    elif service_id in ("discord-channel", "imessage"):
        screen_name = service_id
        label = "Discord channel" if service_id == "discord-channel" else "iMessage channel"
        try:
            result = _check_process(["screen", "-list"], pipe_grep=screen_name)
            if result["running"]:
                return jsonify({"lines": [
                    f"{label} is running.",
                    "Logs are available in the screen session.",
                    f"Attach with: make {screen_name}-attach",
                    "",
                    f"Screen: {result['detail']}",
                ]})
        except Exception:
            pass
        return jsonify({"lines": [f"{label} is not running. Click Start to launch it."]})

    return jsonify({"error": "Unknown service"}), 400


@bp.route("/api/services/<service_id>/stop", methods=["POST"])
def stop_service(service_id):
    cmd_args = STOP_CMDS.get(service_id)
    if not cmd_args:
        return jsonify({"error": f"Unknown service: {service_id}"}), 400
    try:
        subprocess.run(cmd_args, timeout=5, env=_build_env(), stderr=subprocess.DEVNULL)
        return jsonify({"status": "stopped", "id": service_id})
    except Exception as e:
        log.error("Failed to stop service %s: %s\n%s", service_id, e, traceback.format_exc())
        return jsonify({"error": str(e), "detail": traceback.format_exc()}), 500
