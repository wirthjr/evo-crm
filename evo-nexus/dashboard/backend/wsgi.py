"""WSGI entrypoint for production dashboard serving."""

from .app import app, start_task_poller

start_task_poller()
