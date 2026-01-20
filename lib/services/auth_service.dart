import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthService {
  static const FlutterSecureStorage _storage = FlutterSecureStorage();

  static const String _tokenKey = "auth_token";
  static const String _userIdKey = "user_id";
  static const String _usernameKey = "username";
  static const String _emailKey = "email";
  static const String _roleKey = "role";

  // ✅ Save user session (Persistent login)
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

  // ✅ Get token
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

  // ✅ Persistent login (until logout)
  static Future<bool> isSessionValid() async {
    final token = await getToken();
    return token != null && token.isNotEmpty;
  }

  // ✅ This was missing (Fix for your error)
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

  // ✅ Logout clears everything
  static Future<void> logout() async {
    await _storage.deleteAll();
  }
}
