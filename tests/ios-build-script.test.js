import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("unsigned build keeps compiler exit status and saves diagnostics without producing an IPA", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "pulso-ios-script-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const ios = join(folder, "native", "ios"),
    bin = join(folder, "bin");
  await mkdir(ios, { recursive: true });
  await mkdir(bin);
  await copyFile(
    new URL("../native/ios/build-unsigned.sh", import.meta.url),
    join(ios, "build-unsigned.sh"),
  );
  await writeFile(join(ios, "Package.resolved"), "{}");
  await writeFile(join(bin, "uname"), '#!/bin/sh\nprintf "Darwin\\n"\n', {
    mode: 0o755,
  });
  await writeFile(join(bin, "xcodegen"), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  await writeFile(
    join(bin, "xcodebuild"),
    '#!/bin/sh\nif [ "$1" = "-resolvePackageDependencies" ]; then echo "resolved test package"; exit 0; fi\necho "ScreenBridge.swift:40: error: synthetic compiler failure" >&2\nexit 65\n',
    { mode: 0o755 },
  );
  const result = spawnSync("bash", [join(ios, "build-unsigned.sh")], {
    env: {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      PULSO_BUNDLE_ID: "dev.pulso.test.screen",
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 65, result.stderr);
  assert.match(
    await readFile(join(folder, "native", "build", "archive.log"), "utf8"),
    /error: synthetic compiler failure/,
  );
  assert.match(
    await readFile(join(folder, "native", "build", "resolve.log"), "utf8"),
    /resolved test package/,
  );
  await assert.rejects(
    access(join(folder, "native", "build", "PulsoScreen-unsigned.ipa")),
  );
});
