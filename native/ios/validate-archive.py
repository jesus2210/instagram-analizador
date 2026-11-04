#!/usr/bin/env python3
"""Check ReplayKit metadata in the archived app before packaging an IPA."""
import pathlib
import plistlib
import sys


def validate(app):
    manifests = []
    for path in (app / "PlugIns").glob("*.appex/Info.plist"):
        with path.open("rb") as stream:
            manifests.append(plistlib.load(stream))
    uploads = [m for m in manifests if m.get("NSExtension", {}).get("NSExtensionPointIdentifier") == "com.apple.broadcast-services-upload"]
    setups = [m for m in manifests if m.get("NSExtension", {}).get("NSExtensionPointIdentifier") == "com.apple.broadcast-services-setupui"]
    if len(uploads) != 1 or len(setups) != 1:
        raise ValueError("El archivo debe contener una extensión de subida y una de configuración.")
    upload, setup = uploads[0], setups[0]
    if upload["NSExtension"].get("RPBroadcastProcessMode") != "RPBroadcastProcessModeSampleBuffer":
        raise ValueError("RPBroadcastProcessMode debe estar directamente en NSExtension, con modo SampleBuffer.")
    attributes = setup["NSExtension"].get("NSExtensionAttributes", {})
    upload_id = upload.get("CFBundleIdentifier")
    if not upload_id or attributes.get("RPBroadcastUploadExtension") != upload_id:
        raise ValueError("La configuración no apunta al identificador de la extensión de subida del archivo.")
    if attributes.get("NSExtensionActivationRule", {}).get("NSExtensionActivationSupportsReplayKitStreaming") is not True:
        raise ValueError("Falta la activación de ReplayKit Streaming en la extensión de configuración.")


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Uso: validate-archive.py PulsoScreen.app")
        validate(pathlib.Path(sys.argv[1]))
    except (ValueError, OSError, plistlib.InvalidFileException) as error:
        sys.exit(f"Configuración de ReplayKit inválida: {error}")
    print("ReplayKit: metadatos del archivo comprobados antes de crear el IPA.")
