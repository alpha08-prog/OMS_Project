import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class PlatformUtils {
  static bool _debugForceCupertino = false;

  /// Set to true during development to test Cupertino UI on Android
  static void debugSetCupertino(bool value) {
    assert(() {
      _debugForceCupertino = value;
      return true;
    }());
  }

  static bool get isIOS {
    if (kIsWeb) return false;
    return Platform.isIOS;
  }

  static bool get isCupertino => _debugForceCupertino || isIOS;
  static bool get isMaterial => !isCupertino;
}
