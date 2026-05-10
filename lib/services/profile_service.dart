import 'dart:convert';

import '../models/user_profile.dart';
import 'http_service.dart';

class ProfileResult<T> {
  final bool ok;
  final T? data;
  final String? message;
  final int statusCode;
  final PasswordPolicy? policy;

  const ProfileResult({
    required this.ok,
    required this.statusCode,
    this.data,
    this.message,
    this.policy,
  });
}

class ProfileService {
  static Future<ProfileResult<UserProfile>> getMyProfile() async {
    try {
      final res = await HttpService.get('/api/auth/me');
      final body = _safeDecode(res.body);
      if (res.statusCode == 200 && body['data'] is Map<String, dynamic>) {
        return ProfileResult(
          ok: true,
          statusCode: res.statusCode,
          data: UserProfile.fromJson(body['data'] as Map<String, dynamic>),
          message: body['message']?.toString(),
        );
      }
      return ProfileResult(
        ok: false,
        statusCode: res.statusCode,
        message: body['message']?.toString() ?? 'Failed to load profile',
      );
    } catch (e) {
      return ProfileResult(
        ok: false,
        statusCode: 0,
        message: 'Network error. Please check your connection.',
      );
    }
  }

  static Future<ProfileResult<void>> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final res = await HttpService.put('/api/auth/password', {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      });
      final body = _safeDecode(res.body);
      PasswordPolicy? policy;
      final policyJson = (body['data'] is Map<String, dynamic>)
          ? (body['data']['passwordPolicy'] ?? body['data'])
          : null;
      if (policyJson is Map<String, dynamic>) {
        try {
          policy = PasswordPolicy.fromJson(policyJson);
        } catch (_) {/* ignore */}
      }
      if (res.statusCode == 200) {
        return ProfileResult(
          ok: true,
          statusCode: res.statusCode,
          message: body['message']?.toString() ?? 'Password updated',
          policy: policy,
        );
      }
      return ProfileResult(
        ok: false,
        statusCode: res.statusCode,
        message: body['message']?.toString() ?? 'Failed to update password',
        policy: policy,
      );
    } catch (e) {
      return ProfileResult(
        ok: false,
        statusCode: 0,
        message: 'Network error. Please check your connection.',
      );
    }
  }

  static Map<String, dynamic> _safeDecode(String body) {
    try {
      final v = jsonDecode(body);
      return v is Map<String, dynamic> ? v : <String, dynamic>{};
    } catch (_) {
      return <String, dynamic>{};
    }
  }
}
