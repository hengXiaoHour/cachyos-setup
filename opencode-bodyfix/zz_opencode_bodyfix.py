"""Workaround for opencode.ai relay regression (~2026-08-23 22:19 UTC+7).

The Zen/Go relay returned 401 ModelError 'Model  is not supported' when a
chat/completions JSON body contains "messages" BEFORE "model" -- which is
exactly how openai-python >= 2.x serializes every request. Reordering so
"model" is the first key makes requests pass again (verified live).
OpenCode rolled a fix out ~2026-08-23 23:00 +0700 but their edge was still
flapping afterwards; this shim stays as insurance and no-ops when the relay
behaves.

Auto-imported in every interpreter of this venv via zz_opencode_bodyfix.pth.
Never raises; only touches POST JSON bodies to opencode.ai hosts.
Set ZZ_DEBUG=1 to log send failures to /tmp/opencode/zz_send.log.
"""
import json as _json

_patched = False


def _maybe_reorder(request):
    try:
        host = request.url.host or ""
        if not (host == "opencode.ai" or host.endswith(".opencode.ai")):
            return request
        if request.method != "POST":
            return request
        if "application/json" not in (request.headers.get("content-type") or ""):
            return request
        data = _json.loads(request.content)
        if not isinstance(data, dict) or "model" not in data:
            return request
        if next(iter(data), None) == "model":
            return request
        ordered = {"model": data["model"]}
        for k, v in data.items():
            if k != "model":
                ordered[k] = v
        import httpx

        rebuilt = httpx.Request(
            request.method,
            request.url,
            params=request.url.params,
            content=_json.dumps(ordered, separators=(",", ":")).encode(),
            headers=request.headers,
        )
        rebuilt.extensions.update(request.extensions)
        return rebuilt
    except Exception:
        return request


def _install():
    global _patched
    if _patched:
        return
    try:
        import httpx

        if getattr(httpx.Client.send, "_zz_bodyfix", False):
            _patched = True
            return

        _orig_send = httpx.Client.send

        def _send(self, request, *args, **kwargs):
            import os as _os

            _req = _maybe_reorder(request)
            try:
                return _orig_send(self, _req, *args, **kwargs)
            except Exception as e:
                if _os.environ.get("ZZ_DEBUG"):
                    with open("/tmp/opencode/zz_send.log", "a") as f:
                        f.write(
                            "SEND-FAIL %s%s %s.%s: %s\n"
                            % (
                                getattr(_req.url, "host", "?"),
                                getattr(_req.url, "path", ""),
                                type(e).__module__,
                                type(e).__name__,
                                e,
                            )
                        )
                raise

        _send._zz_bodyfix = True
        httpx.Client.send = _send

        try:
            _orig_asend = httpx.AsyncClient.send

            async def _asend(self, request, *args, **kwargs):
                return await _orig_asend(self, _maybe_reorder(request), *args, **kwargs)

            _asend._zz_bodyfix = True
            httpx.AsyncClient.send = _asend
        except Exception:
            pass
        _patched = True
    except Exception:
        pass


_install()
