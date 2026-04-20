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
