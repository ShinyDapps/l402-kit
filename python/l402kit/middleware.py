import functools
from typing import Callable
from .types import LightningProvider
from .verify import verify_token
from .replay import check_and_mark_preimage


def l402_required(price_sats: int, lightning: LightningProvider):
    """
    Decorator for FastAPI and Flask routes.

    FastAPI:
        @app.get("/premium")
        @l402_required(price_sats=100, lightning=blink)
        async def premium(): ...

    Flask:
        @app.route("/premium")
        @l402_required(price_sats=100, lightning=blink)
        def premium(): ...
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def fastapi_wrapper(*args, **kwargs):
            # FastAPI: request comes via kwargs or dependency injection
            request = kwargs.get("request")
            if request is None:
                # Try to find Request in args
                from fastapi import Request
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is not None:
                auth = request.headers.get("authorization", "")
                if auth.startswith("L402 "):
                    token = auth[5:]
                    if verify_token(token):
                        macaroon, preimage = token.rsplit(":", 1)
                        if check_and_mark_preimage(preimage):
                            return await func(*args, **kwargs)
                        else:
                            from fastapi.responses import JSONResponse
                            return JSONResponse({"error": "Token already used"}, status_code=401)

                invoice = await lightning.create_invoice(price_sats)
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    {
                        "error": "Payment Required",
                        "price_sats": price_sats,
                        "invoice": invoice.payment_request,
                        "macaroon": invoice.macaroon,
                    },
                    status_code=402,
                    headers={
                        "WWW-Authenticate": f'L402 macaroon="{invoice.macaroon}", invoice="{invoice.payment_request}"'
                    },
                )

            return await func(*args, **kwargs)

        @functools.wraps(func)
        def flask_wrapper(*args, **kwargs):
            from flask import request, jsonify, make_response
            import asyncio

            auth = request.headers.get("Authorization", "")
            if auth.startswith("L402 "):
                token = auth[5:]
                if verify_token(token):
                    macaroon, preimage = token.rsplit(":", 1)
                    if check_and_mark_preimage(preimage):
                        return func(*args, **kwargs)
                    else:
                        return jsonify({"error": "Token already used"}), 401

            # asyncio.run() fails when called from inside a running event loop
            # (e.g. Gunicorn + gevent/eventlet workers, pytest-asyncio). Detect
            # and fall back to a fresh thread with its own loop.
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None
            if loop and loop.is_running():
                import concurrent.futures, threading
                result_box: list = [None]
                exc_box: list = [None]
                def _run() -> None:
                    new_loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(new_loop)
                    try:
                        result_box[0] = new_loop.run_until_complete(lightning.create_invoice(price_sats))
                    except Exception as e:
                        exc_box[0] = e
                    finally:
                        new_loop.close()
                t = threading.Thread(target=_run, daemon=True)
                t.start()
                t.join()
                if exc_box[0]:
                    raise exc_box[0]
                invoice = result_box[0]
            else:
                invoice = asyncio.run(lightning.create_invoice(price_sats))
            resp = make_response(
                jsonify({
                    "error": "Payment Required",
                    "price_sats": price_sats,
                    "invoice": invoice.payment_request,
                    "macaroon": invoice.macaroon,
                }),
                402,
            )
            resp.headers["WWW-Authenticate"] = (
                f'L402 macaroon="{invoice.macaroon}", invoice="{invoice.payment_request}"'
            )
            return resp

        import asyncio
        import inspect
        if inspect.iscoroutinefunction(func):
            return fastapi_wrapper
        return flask_wrapper

    return decorator
