import 'dart:convert';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

class HttpService {
  // ✅ Change here for Production
  static const String baseUrl = "http://13.60.214.88:5000";

  static Future<Map<String, String>> _headers() async {
    final token = await AuthService.getToken();
    return {
      "Content-Type": "application/json",
      if (token != null && token.isNotEmpty) "Authorization": "Bearer $token",
    };
  }

  static Future<http.Response> get(String endpoint) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return await http.get(url, headers: headers);
  }

  static Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return await http.post(url, headers: headers, body: jsonEncode(body));
  }

  static Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return await http.put(url, headers: headers, body: jsonEncode(body));
  }

  static Future<http.Response> patch(String endpoint, Map<String, dynamic> body) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return await http.patch(url, headers: headers, body: jsonEncode(body));
  }

  static Future<http.Response> delete(String endpoint) async {
    final headers = await _headers();
    final url = Uri.parse("$baseUrl$endpoint");
    return await http.delete(url, headers: headers);
  }
}
