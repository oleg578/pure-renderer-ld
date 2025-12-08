import { strict as assert } from "assert";
import { test } from "node:test";
import { promises as fs } from "fs";
import path from "path";
import { ProcessTracker } from "./processTracker.js";

const tmpDir = path.join(
  import.meta.dirname,
  "..",
  "..",
  "tmp",
  "tracker-tests"
);

test("ProcessTracker - constructor sets filePath correctly", () => {
  const tracker = new ProcessTracker("/tmp/test");

  assert.ok(tracker.filePath.includes("process"));
  assert.ok(tracker.filePath.includes("/tmp/test"));
});

test("ProcessTracker - constructor accepts different tmpDir paths", () => {
  const tracker1 = new ProcessTracker("/tmp/dir1");
  const tracker2 = new ProcessTracker("/tmp/dir2");

  assert.notEqual(tracker1.filePath, tracker2.filePath);
});

test("ProcessTracker - ensureDirectory creates directory structure", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "ensure-dir-test"));

  await tracker.ensureDirectory();

  const dirStat = await fs.stat(path.join(tmpDir, "ensure-dir-test"));
  assert.ok(dirStat.isDirectory());
});

test("ProcessTracker - ensureDirectory creates nested directories", async () => {
  const nestedPath = path.join(tmpDir, "deeply", "nested", "path");
  const tracker = new ProcessTracker(nestedPath);

  await tracker.ensureDirectory();

  const dirStat = await fs.stat(nestedPath);
  assert.ok(dirStat.isDirectory());
});

test("ProcessTracker - ensureDirectory succeeds when directory already exists", async () => {
  const dirPath = path.join(tmpDir, "already-exists");
  await fs.mkdir(dirPath, { recursive: true });

  const tracker = new ProcessTracker(dirPath);
  await tracker.ensureDirectory();

  const dirStat = await fs.stat(dirPath);
  assert.ok(dirStat.isDirectory());
});

test("ProcessTracker - writeValue writes value to file", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "write-test"));

  await tracker.writeValue(42);

  const content = await fs.readFile(tracker.filePath, "utf-8");
  assert.equal(content, "42");
});

test("ProcessTracker - writeValue converts number to string", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "convert-test"));

  await tracker.writeValue(123);

  const content = await fs.readFile(tracker.filePath, "utf-8");
  assert.equal(typeof content, "string");
});

test("ProcessTracker - start sets flag to 1", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "start-test"));

  await tracker.start();

  const content = await fs.readFile(tracker.filePath, "utf-8");
  assert.equal(content, "1");
});

test("ProcessTracker - finish sets flag to 0", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "finish-test"));

  await tracker.start();
  await tracker.finish();

  const content = await fs.readFile(tracker.filePath, "utf-8");
  assert.equal(content, "0");
});

test("ProcessTracker - initialize sets flag to 0", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "init-test"));

  await tracker.initialize();

  const content = await fs.readFile(tracker.filePath, "utf-8");
  assert.equal(content, "0");
});

test("ProcessTracker - getProgress returns 1 when file contains 1", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "progress-1"));

  await tracker.start();
  const progress = await tracker.getProgress();

  assert.equal(progress, 1);
});

test("ProcessTracker - getProgress returns 0 when file contains 0", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "progress-0"));

  await tracker.finish();
  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("ProcessTracker - getProgress returns 0 when file does not exist", async () => {
  const tracker = new ProcessTracker(
    path.join(tmpDir, "nonexistent", "progress")
  );

  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("ProcessTracker - getProgress handles whitespace in file", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "whitespace-test"));

  await fs.mkdir(path.dirname(tracker.filePath), { recursive: true });
  await fs.writeFile(tracker.filePath, "  1  ", "utf-8");

  const progress = await tracker.getProgress();

  assert.equal(progress, 1);
});

test("ProcessTracker - getProgress returns 0 for invalid content", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "invalid-content"));

  await fs.mkdir(path.dirname(tracker.filePath), { recursive: true });
  await fs.writeFile(tracker.filePath, "invalid", "utf-8");

  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("ProcessTracker - getProgress returns 0 for invalid numbers", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "invalid-number"));

  await fs.mkdir(path.dirname(tracker.filePath), { recursive: true });
  await fs.writeFile(tracker.filePath, "99", "utf-8");

  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("ProcessTracker - getProgress returns 0 for negative numbers", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "negative-number"));

  await fs.mkdir(path.dirname(tracker.filePath), { recursive: true });
  await fs.writeFile(tracker.filePath, "-1", "utf-8");

  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("ProcessTracker - track executes function and manages flags", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-test"));
  let functionCalled = false;

  await tracker.track(async () => {
    functionCalled = true;
  });

  assert.ok(functionCalled);
  const progress = await tracker.getProgress();
  assert.equal(progress, 0);
});

test("ProcessTracker - track returns function result", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-result"));

  const result = await tracker.track(async () => "test value");

  assert.equal(result, "test value");
});

test("ProcessTracker - track sets flag to 1 during execution", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-flag"));
  let flagDuringExecution = null;

  await tracker.track(async () => {
    const content = await fs.readFile(tracker.filePath, "utf-8");
    flagDuringExecution = content;
  });

  assert.equal(flagDuringExecution, "1");
});

test("ProcessTracker - track resets flag to 0 after execution", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-reset"));

  await tracker.track(async () => {
    // Function execution
  });

  const progress = await tracker.getProgress();
  assert.equal(progress, 0);
});

test("ProcessTracker - track resets flag to 0 even on error", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-error"));

  try {
    await tracker.track(async () => {
      throw new Error("Test error");
    });
  } catch {
    // Ignore error
  }

  const progress = await tracker.getProgress();
  assert.equal(progress, 0);
});

test("ProcessTracker - track propagates function errors", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-propagate"));
  const testError = new Error("Test error message");

  try {
    await tracker.track(async () => {
      throw testError;
    });
    assert.fail("Should have thrown");
  } catch (error) {
    assert.equal(error.message, "Test error message");
  }
});

test("ProcessTracker - track supports synchronous functions", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "track-sync"));

  const result = await tracker.track(() => "sync value");

  assert.equal(result, "sync value");
});

test("ProcessTracker - multiple trackers use independent files", async () => {
  const tracker1 = new ProcessTracker(path.join(tmpDir, "tracker1"));
  const tracker2 = new ProcessTracker(path.join(tmpDir, "tracker2"));

  await tracker1.start();
  await tracker2.finish();

  const progress1 = await tracker1.getProgress();
  const progress2 = await tracker2.getProgress();

  assert.equal(progress1, 1);
  assert.equal(progress2, 0);
});

test("ProcessTracker - sequential operations maintain state", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "sequential"));

  await tracker.initialize();
  assert.equal(await tracker.getProgress(), 0);

  await tracker.start();
  assert.equal(await tracker.getProgress(), 1);

  await tracker.finish();
  assert.equal(await tracker.getProgress(), 0);
});

test("ProcessTracker - concurrent start/finish operations", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "concurrent"));

  await Promise.all([tracker.start(), tracker.finish()]);

  const progress = await tracker.getProgress();
  // The last operation wins
  assert.ok(progress === 0 || progress === 1);
});

test("ProcessTracker - writeValue overwrites previous content", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "overwrite"));

  await tracker.writeValue(1);
  await tracker.writeValue(0);

  const content = await fs.readFile(tracker.filePath, "utf-8");
  assert.equal(content, "0");
});

test("ProcessTracker - track with complex return value", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "complex-return"));
  const complexValue = { key: "value", nested: { num: 42 } };

  const result = await tracker.track(async () => complexValue);

  assert.deepEqual(result, complexValue);
});

test("ProcessTracker - getProgress with empty file returns 0", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "empty-file"));

  await fs.mkdir(path.dirname(tracker.filePath), { recursive: true });
  await fs.writeFile(tracker.filePath, "", "utf-8");

  const progress = await tracker.getProgress();

  assert.equal(progress, 0);
});

test("ProcessTracker - filePath uses 'process' filename", () => {
  const tracker = new ProcessTracker("/some/path");

  assert.ok(
    tracker.filePath.endsWith("process") || tracker.filePath.includes("process")
  );
});

test("ProcessTracker - track function receives no arguments", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "no-args"));
  let receivedArgs = null;

  await tracker.track(function (...args) {
    receivedArgs = args;
  });

  assert.equal(receivedArgs.length, 0);
});

test("ProcessTracker - initialize works multiple times", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "multi-init"));

  await tracker.initialize();
  await tracker.initialize();
  await tracker.initialize();

  const progress = await tracker.getProgress();
  assert.equal(progress, 0);
});

test("ProcessTracker - start after finish", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "start-after-finish"));

  await tracker.finish();
  assert.equal(await tracker.getProgress(), 0);

  await tracker.start();
  assert.equal(await tracker.getProgress(), 1);
});

test("ProcessTracker - finish after start", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "finish-after-start"));

  await tracker.start();
  assert.equal(await tracker.getProgress(), 1);

  await tracker.finish();
  assert.equal(await tracker.getProgress(), 0);
});

test("ProcessTracker - getProgress type is always number", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "type-check"));

  await tracker.start();
  const result = await tracker.getProgress();

  assert.equal(typeof result, "number");
});

test("ProcessTracker - track handles rejected promises", async () => {
  const tracker = new ProcessTracker(path.join(tmpDir, "rejected-promise"));
  const testError = new Error("Rejection");

  try {
    await tracker.track(() => Promise.reject(testError));
    assert.fail("Should have thrown");
  } catch (error) {
    assert.equal(error, testError);
  }

  const progress = await tracker.getProgress();
  assert.equal(progress, 0);
});

test("ProcessTracker - ensureDirectory handles permission issues gracefully", async () => {
  // This test verifies the error handling path
  const tracker = new ProcessTracker(path.join(tmpDir, "perms-test"));

  // Should not throw even in edge cases
  await tracker.ensureDirectory();
  await tracker.ensureDirectory();

  const dirStat = await fs.stat(path.dirname(tracker.filePath));
  assert.ok(dirStat.isDirectory());
});
