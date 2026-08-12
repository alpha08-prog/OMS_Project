import 'dart:convert';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class HttpService {
  // Backend base URL. Override at build time with:
  //   flutter run --dart-define=OMS_API_URL=https://your-prod-host
  // Default points at the development backend.
  static const String baseUrl = String.fromEnvironment(
    'OMS_API_URL',
    defaultValue: 'https://omsvackend-50040756292.catalystappsail.in',
  );

  /// Set by `main.dart` to clear the session and route back to login when
  /// any backend call returns 401. Stays null in tests/isolated use.
  static Future<void> Function()? onUnauthorized;

  static Future<Map<String, String>> _headers() async {
    final token = await AuthService.getToken();
    return {
      "Content-Type": "application/json",
      if (token != null && token.isNotEmpty) "Authorization": "Bearer $token",
    };
  }

  /// If the response is 401, fire the global unauthorized handler so the
  /// app can clear its session and bounce to login. The original response
  /// is still returned to the caller.
  static Future<http.Response> _checkAuth(http.Response res) async {
    if (res.statusCode == 401 && onUnauthorized != null) {
      await onUnauthorized!();
    }
    return res;
  }

  static Future<http.Response> get(String endpoint) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return _checkAuth(await http.get(url, headers: headers));
  }

  static Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return _checkAuth(await http.post(url, headers: headers, body: jsonEncode(body)));
  }

  static Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return _checkAuth(await http.put(url, headers: headers, body: jsonEncode(body)));
  }

  static Future<http.Response> patch(String endpoint, Map<String, dynamic> body) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return _checkAuth(await http.patch(url, headers: headers, body: jsonEncode(body)));
  }

  static Future<http.Response> delete(String endpoint) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return _checkAuth(await http.delete(url, headers: headers));
  }

  /// Download file as bytes (for PDF downloads)
  static Future<http.Response> downloadFile(String endpoint) async {
    final token = await AuthService.getToken();
    final url = Uri.parse("$baseUrl$endpoint");
    return _checkAuth(await http.get(url, headers: {
      if (token != null && token.isNotEmpty) "Authorization": "Bearer $token",
    }));
  }
}
