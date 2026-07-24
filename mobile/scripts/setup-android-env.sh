#!/bin/zsh
# Source this file: source mobile/scripts/setup-android-env.sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

echo "ANDROID_HOME=$ANDROID_HOME"
adb version
