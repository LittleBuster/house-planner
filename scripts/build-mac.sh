#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
app_path="${1:-build/ДомПлан.app}"
mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources/Web" build
swiftc native/App.swift -O -target arm64-apple-macosx13.0 -framework AppKit -framework WebKit -o "$app_path/Contents/MacOS/DomPlan"
cp dist/index.html dist/main.js dist/main.css "$app_path/Contents/Resources/Web/"
cp THIRD-PARTY-NOTICES.txt "$app_path/Contents/Resources/"
if [ -f native/AppIcon.icns ]; then cp native/AppIcon.icns "$app_path/Contents/Resources/"; fi
cat > "$app_path/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>ДомПлан</string>
<key>CFBundleDisplayName</key><string>ДомПлан</string>
<key>CFBundleExecutable</key><string>DomPlan</string>
<key>CFBundleIdentifier</key><string>local.domplan.editor</string>
<key>CFBundleVersion</key><string>44</string>
<key>CFBundleShortVersionString</key><string>0.43</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSHumanReadableCopyright</key><string>ДомПлан 0.43 — локальный редактор дома</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app_path"
echo "Готово: $app_path"
