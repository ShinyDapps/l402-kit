/**
 * create-l402-app — template generator tests.
 * Pure unit tests: no filesystem, no prompts, no network.
 *
 * Run: node --test test/templates.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tplTsServer,
  tplTsPackageJson,
  tplTsconfig,
  tplEnvTs,
  tplPythonServer,
  tplPythonRequirements,
  tplGoServer,
} from "../lib/templates.js";

// ─── TypeScript server template ───────────────────────────────────────────────

describe("tplTsServer", () => {
  it("contains correct provider import for blink", () => {
    const out = tplTsServer(10, "blink");
    assert.ok(out.includes("BlinkProvider"), "should import BlinkProvider");
    assert.ok(out.includes("BLINK_API_KEY"), "should reference BLINK_API_KEY env var");
    assert.ok(out.includes("BLINK_WALLET_ID"), "should reference BLINK_WALLET_ID env var");
  });

  it("contains correct provider import for alby", () => {
    const out = tplTsServer(21, "alby");
    assert.ok(out.includes("AlbyProvider"), "should import AlbyProvider");
    assert.ok(out.includes("ALBY_TOKEN"), "should reference ALBY_TOKEN env var");
  });

  it("contains correct provider import for opennode", () => {
    const out = tplTsServer(100, "opennode");
    assert.ok(out.includes("OpenNodeProvider"), "should import OpenNodeProvider");
    assert.ok(out.includes("OPENNODE_API_KEY"), "should reference OPENNODE_API_KEY env var");
  });

  it("injects priceSats into generated code", () => {
    const out = tplTsServer(42, "blink");
    assert.ok(out.includes("priceSats: 42"), "should embed priceSats value");
  });

  it("includes /health endpoint", () => {
    const out = tplTsServer(10, "blink");
    assert.ok(out.includes("/health"), "should include health endpoint");
  });

  it("includes express import", () => {
    const out = tplTsServer(10, "blink");
    assert.ok(out.includes(`import express from "express"`));
  });
});

// ─── package.json template ───────────────────────────────────────────────────

describe("tplTsPackageJson", () => {
  it("generates valid JSON", () => {
    const out = tplTsPackageJson("my-api");
    assert.doesNotThrow(() => JSON.parse(out), "should be valid JSON");
  });

  it("uses provided project name", () => {
    const parsed = JSON.parse(tplTsPackageJson("awesome-api"));
    assert.equal(parsed.name, "awesome-api");
  });

  it("includes l402-kit as dependency", () => {
    const parsed = JSON.parse(tplTsPackageJson("test"));
    assert.ok(parsed.dependencies["l402-kit"], "should depend on l402-kit");
  });

  it("includes tsx as devDependency", () => {
    const parsed = JSON.parse(tplTsPackageJson("test"));
    assert.ok(parsed.devDependencies["tsx"]);
  });

  it("has dev script", () => {
    const parsed = JSON.parse(tplTsPackageJson("test"));
    assert.ok(parsed.scripts.dev, "should have dev script");
  });
});

// ─── tsconfig template ───────────────────────────────────────────────────────

describe("tplTsconfig", () => {
  it("generates valid JSON", () => {
    assert.doesNotThrow(() => JSON.parse(tplTsconfig()));
  });

  it("targets ES2022", () => {
    const parsed = JSON.parse(tplTsconfig());
    assert.equal(parsed.compilerOptions.target, "ES2022");
  });

  it("has strict mode enabled", () => {
    const parsed = JSON.parse(tplTsconfig());
    assert.equal(parsed.compilerOptions.strict, true);
  });
});

// ─── .env template ───────────────────────────────────────────────────────────

describe("tplEnvTs", () => {
  it("returns blink env vars for blink provider", () => {
    const out = tplEnvTs("blink");
    assert.ok(out.includes("BLINK_API_KEY"));
    assert.ok(out.includes("BLINK_WALLET_ID"));
  });

  it("returns alby env var for alby provider", () => {
    const out = tplEnvTs("alby");
    assert.ok(out.includes("ALBY_TOKEN"));
  });

  it("returns opennode env var for opennode provider", () => {
    const out = tplEnvTs("opennode");
    assert.ok(out.includes("OPENNODE_API_KEY"));
  });
});

// ─── Python template ─────────────────────────────────────────────────────────

describe("tplPythonServer", () => {
  it("injects priceSats into decorator", () => {
    const out = tplPythonServer(50);
    assert.ok(out.includes("price_sats=50"));
  });

  it("includes FastAPI import", () => {
    const out = tplPythonServer(10);
    assert.ok(out.includes("from fastapi import"));
  });

  it("includes BlinkProvider", () => {
    const out = tplPythonServer(10);
    assert.ok(out.includes("BlinkProvider"));
  });
});

// ─── Python requirements template ────────────────────────────────────────────

describe("tplPythonRequirements", () => {
  it("includes l402kit", () => {
    assert.ok(tplPythonRequirements().includes("l402kit"));
  });

  it("includes fastapi", () => {
    assert.ok(tplPythonRequirements().includes("fastapi"));
  });
});

// ─── Go server template ──────────────────────────────────────────────────────

describe("tplGoServer", () => {
  it("injects priceSats", () => {
    const out = tplGoServer(1);
    assert.ok(out.includes("price_sats"));
  });

  it("includes BlinkProvider call", () => {
    const out = tplGoServer(10);
    assert.ok(out.includes("NewBlinkProvider"));
  });

  it("includes l402kit import", () => {
    const out = tplGoServer(10);
    assert.ok(out.includes("l402-kit/go"));
  });
});
