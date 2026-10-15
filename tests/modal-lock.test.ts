import { test } from "node:test";
import assert from "node:assert/strict";
import { createModalScrollLock } from "../frontend/src/utils/modalLock.js";

test("nested SOS keeps scrolling locked even if the underlying dialog closes first", () => {
  const style = { overflow: "auto" };
  const acquire = createModalScrollLock(style);
  const parent = acquire();
  const sos = acquire();
  parent(); parent();
  assert.equal(style.overflow, "hidden");
  sos();
  assert.equal(style.overflow, "auto");
  const reopen = acquire(); reopen();
  assert.equal(style.overflow, "auto");
});
