import assert from "node:assert/strict";
import { faviconSrc, linkHost, normalizeLinkUrl } from "./link-url.js";

assert.equal(normalizeLinkUrl("maplestory.nexon.com").value, "https://maplestory.nexon.com/");
assert.equal(normalizeLinkUrl("  https://example.com/a  ").value, "https://example.com/a");
assert.equal(normalizeLinkUrl("http://127.0.0.1:5500/path").value, "http://127.0.0.1:5500/path");
assert.match(normalizeLinkUrl("").error, /주소/);
assert.match(normalizeLinkUrl("javascript:alert(1)").error, /http/);
assert.match(normalizeLinkUrl("notaurl").error, /형식/);
assert.match(normalizeLinkUrl("https://example.com/a b").error, /공백/);

assert.equal(faviconSrc("https://github.com/foo"), "https://www.google.com/s2/favicons?domain=github.com&sz=64");
assert.equal(faviconSrc("http://127.0.0.1:5500/path"), "https://www.google.com/s2/favicons?domain=127.0.0.1&sz=64");
assert.equal(faviconSrc("javascript:alert(1)"), "");
assert.equal(faviconSrc(""), "");
assert.equal(linkHost("https://www.maple.land/path"), "maple.land");
assert.equal(linkHost("https://mapleland.gg/"), "mapleland.gg");
assert.equal(linkHost("notaurl"), "");
