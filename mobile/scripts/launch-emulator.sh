#!/bin/zsh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

AVD_NAME="${1:-TaxInstitutionEmu}"

echo "Starting ${AVD_NAME}…"
emulator -avd "$AVD_NAME" -gpu swiftshader_indirect &

echo "Waiting for device…"
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
  sleep 2
done

echo "Emulator ready:"
adb devices -l
