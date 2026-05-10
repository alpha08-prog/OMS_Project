import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const String _tokenKey = "auth_token";
  static const String _userIdKey = "user_id";
  static const String _usernameKey = "username";
  static const String _emailKey = "email";
  static const String _roleKey = "role";
  static const String _rememberMeKey = "remember_me";

  // Save user session (Persistent login)
  static Future<void> saveUserSession({
    required String token,
    required dynamic userId,
    required String username,
    required String email,
    required String role,
  }) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _userIdKey, value: userId.toString());
    await _storage.write(key: _usernameKey, value: username);
    await _storage.write(key: _emailKey, value: email);
    await _storage.write(key: _roleKey, value: role);
  }

  static Future<String?> getToken() async {
    return await _storage.read(key: _tokenKey);
  }

  static Future<String?> getUsername() async {
    return await _storage.read(key: _usernameKey);
  }

  static Future<String?> getEmail() async {
    return await _storage.read(key: _emailKey);
  }

  static Future<String?> getRole() async {
    return await _storage.read(key: _roleKey);
  }

  static Future<String?> getUserId() async {
    return await _storage.read(key: _userIdKey);
  }

  // Remember Me
  static Future<void> setRememberMe(bool value) async {
    await _storage.write(key: _rememberMeKey, value: value.toString());
  }

  static Future<bool> getRememberMe() async {
    final val = await _storage.read(key: _rememberMeKey);
    return val != 'false'; // default true
  }

  /// Decode the JWT payload and check the `exp` claim. Returns true if the
  /// token is expired, malformed, or missing an `exp` claim.
  static bool _isTokenExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;

      // base64Url.decode requires padding to a multiple of 4.
      String normalize(String s) {
        final pad = (4 - s.length % 4) % 4;
        return s + ('=' * pad);
      }

      final payloadJson = utf8.decode(base64Url.decode(normalize(parts[1])));
      final payload = json.decode(payloadJson) as Map<String, dynamic>;

      final exp = payload['exp'];
      if (exp is! int) return true;

      final expiry = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
      return DateTime.now().isAfter(expiry);
    } catch (_) {
      // Malformed token -> treat as expired so caller forces re-login.
      return true;
    }
  }

  /// Returns true only when a token is present AND its JWT `exp` claim is
  /// still in the future. Stale tokens are treated as invalid so the app
  /// routes back to login on launch instead of letting the user act on a
  /// dead session.
  static Future<bool> isSessionValid() async {
    final token = await getToken();
    if (token == null || token.isEmpty) return false;
    if (_isTokenExpired(token)) return false;
    return true;
  }

  static Future<Map<String, String>> getUserData() async {
    final username = await getUsername();
    final email = await getEmail();
    final role = await getRole();
    final userId = await getUserId();

    return {
      "userId": userId ?? "",
      "username": username ?? "User",
      "email": email ?? "",
      "role": role ?? "STAFF",
    };
  }

  static Future<void> logout() async {
    await _storage.deleteAll();
  }
}
