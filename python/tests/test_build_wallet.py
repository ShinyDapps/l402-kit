"""
TDD — l402kit.wallets.build_wallet

Port of TS src/agent/wallets/index.ts → buildWallet(env).
Auto-detects wallet from env dict. Priority:
  1. BLINK_API_KEY + BLINK_WALLET_ID → BlinkWallet
  2. ALBY_TOKEN                       → AlbyWallet
  3. raise ValueError with helpful message
"""
import pytest


def test_build_wallet_blink_when_both_keys_present():
    from l402kit.wallets import BlinkWallet, build_wallet
    w = build_wallet({"BLINK_API_KEY": "k", "BLINK_WALLET_ID": "w"})
    assert isinstance(w, BlinkWallet)


def test_build_wallet_alby_when_only_alby_token():
    from l402kit.wallets import AlbyWallet, build_wallet
    w = build_wallet({"ALBY_TOKEN": "t"})
    assert isinstance(w, AlbyWallet)


def test_build_wallet_prefers_blink_over_alby():
    """If both available, Blink wins (lower fees, primary integration)."""
    from l402kit.wallets import BlinkWallet, build_wallet
    w = build_wallet({"BLINK_API_KEY": "k", "BLINK_WALLET_ID": "w", "ALBY_TOKEN": "t"})
    assert isinstance(w, BlinkWallet)


def test_build_wallet_raises_when_nothing_set():
    from l402kit.wallets import build_wallet
    with pytest.raises(ValueError, match="BLINK_API_KEY"):
        build_wallet({})


def test_build_wallet_raises_when_blink_partial():
    from l402kit.wallets import build_wallet
    # Only API key without wallet id → not enough
    with pytest.raises(ValueError):
        build_wallet({"BLINK_API_KEY": "k"})


def test_build_wallet_defaults_to_os_environ_when_no_arg():
    """No-arg call should read from os.environ."""
    import os
    from l402kit.wallets import AlbyWallet, build_wallet

    os.environ.pop("BLINK_API_KEY", None)
    os.environ.pop("BLINK_WALLET_ID", None)
    os.environ["ALBY_TOKEN"] = "from-environ"
    try:
        w = build_wallet()
        assert isinstance(w, AlbyWallet)
    finally:
        del os.environ["ALBY_TOKEN"]
