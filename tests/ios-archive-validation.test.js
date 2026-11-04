import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const validator = fileURLToPath(new URL("../native/ios/validate-archive.py", import.meta.url));
const validUpload = {
  CFBundleIdentifier: "dev.pulso.test.broadcast",
  NSExtension: {
    NSExtensionPointIdentifier: "com.apple.broadcast-services-upload",
    RPBroadcastProcessMode: "RPBroadcastProcessModeSampleBuffer",
  },
};
const validSetup = {
  CFBundleIdentifier: "dev.pulso.test.setup",
  NSExtension: {
    NSExtensionPointIdentifier: "com.apple.broadcast-services-setupui",
    NSExtensionAttributes: {
      RPBroadcastUploadExtension: "dev.pulso.test.broadcast",
      NSExtensionActivationRule: {
        NSExtensionActivationSupportsReplayKitStreaming: true,
      },
    },
  },
};
// Serialize only the strings, booleans and dictionaries used in these manifests.
function plist(value) {
  if (value === true) return "<true/>";
  if (typeof value === "string") return `<string>${value}</string>`;
  return `<dict>${Object.entries(value).map(([key, item]) => `<key>${key}</key>${plist(item)}`).join("")}</dict>`;
}

for (const scenario of ["valid", "misplaced-mode", "wrong-association", "missing-activation"]) {
  test(`archived ReplayKit metadata: ${scenario}`, async (t) => {
    const app = await mkdtemp(join(tmpdir(), "pulso-archive-"));
    t.after(() => rm(app, { recursive: true, force: true }));
    const upload = structuredClone(validUpload);
    const setup = structuredClone(validSetup);
    if (scenario === "misplaced-mode") {
      upload.NSExtension.NSExtensionAttributes = {
        RPBroadcastProcessMode: upload.NSExtension.RPBroadcastProcessMode,
      };
      delete upload.NSExtension.RPBroadcastProcessMode;
    }
    if (scenario === "wrong-association") setup.NSExtension.NSExtensionAttributes.RPBroadcastUploadExtension += ".changed";
    if (scenario === "missing-activation") delete setup.NSExtension.NSExtensionAttributes.NSExtensionActivationRule;
    for (const [name, manifest] of [["Upload", upload], ["Setup", setup]]) {
      const folder = join(app, "PlugIns", `${name}.appex`);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "Info.plist"), `<?xml version="1.0"?><plist version="1.0">${plist(manifest)}</plist>`);
    }
    const result = spawnSync("python3", [validator, app], { encoding: "utf8" });
    assert.equal(result.status, scenario === "valid" ? 0 : 1, result.stderr);
    if (scenario !== "valid") assert.match(result.stderr, /Configuración de ReplayKit inválida/);
  });
}
