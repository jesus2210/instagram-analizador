import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../native/ios/", import.meta.url);
test("iOS project embeds both required ReplayKit extensions without requiring paid entitlements", async () => {
  const spec = JSON.parse(
    await readFile(new URL("project.json", root), "utf8"),
  );
  const targets = spec.targets;
  assert.deepEqual(
    targets.PulsoScreen.dependencies
      .filter((d) => d.target)
      .map((d) => d.target)
      .sort(),
    ["PulsoBroadcast", "PulsoSetup"],
  );
  const upload = targets.PulsoBroadcast.info.properties.NSExtension;
  const setup = targets.PulsoSetup.info.properties.NSExtension;
  assert.equal(
    upload.NSExtensionPointIdentifier,
    "com.apple.broadcast-services-upload",
  );
  assert.equal(
    upload.RPBroadcastProcessMode,
    "RPBroadcastProcessModeSampleBuffer",
  );
  assert.ok(!upload.NSExtensionAttributes?.RPBroadcastProcessMode);
  assert.equal(
    setup.NSExtensionAttributes.NSExtensionActivationRule.NSExtensionActivationSupportsReplayKitStreaming,
    true,
  );
  assert.equal(
    setup.NSExtensionAttributes.RPBroadcastUploadExtension,
    targets.PulsoBroadcast.settings.base.PRODUCT_BUNDLE_IDENTIFIER,
  );
  assert.equal(
    setup.NSExtensionPointIdentifier,
    "com.apple.broadcast-services-setupui",
  );
  assert.ok(
    !JSON.stringify(spec).includes("com.apple.security.application-groups"),
  );
  assert.ok(!JSON.stringify(spec).includes("CODE_SIGN_ENTITLEMENTS"));
  assert.equal(
    targets.PulsoBroadcast.dependencies.find((d) => d.package === "WebRTC")
      .embed,
    false,
  );
  // Package products are linked through SwiftPM. Explicit embedding creates
  // a Copy Files entry for bare "WebRTC", which is not a framework path.
  const hostPackage = targets.PulsoScreen.dependencies.find(
    (d) => d.package === "WebRTC",
  );
  assert.equal(hostPackage.product, "WebRTC");
  assert.equal(hostPackage.embed, false);
  const pin = JSON.parse(
    await readFile(new URL("Package.resolved", root), "utf8"),
  ).pins[0];
  assert.equal(pin.state.version, spec.packages.WebRTC.exactVersion);
  assert.match(pin.state.revision, /^[a-f0-9]{40}$/);
});
test("native uploader consumes only screen frames and has no camera, microphone or background clipboard capture", async () => {
  const handler = await readFile(
    new URL("Broadcast/SampleHandler.swift", root),
    "utf8",
  );
  const bridge = await readFile(
    new URL("Broadcast/ScreenBridge.swift", root),
    "utf8",
  );
  assert.ok(handler.includes("guard sampleBufferType == .video"));
  assert.ok(!handler.includes("AVCaptureSession"));
  assert.ok(!bridge.includes("AVCaptureSession"));
  assert.ok(!bridge.includes("UIPasteboard"));
  assert.ok(handler.includes('setupInfo?["pairingURL"]'));
  assert.ok(bridge.includes('"source": "screen"'));
  assert.ok(bridge.includes('"supported": false'));
});
