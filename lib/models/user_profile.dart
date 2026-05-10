class PasswordPolicy {
  final int used;
  final int allowed;
  final String windowMonth;
  final DateTime resetsAt;

  const PasswordPolicy({
    required this.used,
    required this.allowed,
    required this.windowMonth,
    required this.resetsAt,
  });

  int get remaining => (allowed - used).clamp(0, allowed);

  factory PasswordPolicy.fromJson(Map<String, dynamic> json) {
    return PasswordPolicy(
      used: (json['used'] as num?)?.toInt() ?? 0,
      allowed: (json['allowed'] as num?)?.toInt() ?? 0,
      windowMonth: (json['windowMonth'] ?? '').toString(),
      resetsAt: DateTime.tryParse((json['resetsAt'] ?? '').toString()) ??
          DateTime.now(),
    );
  }
}

class UserProfile {
  final String id;
  final String name;
  final String email;
  final String? phone;
  final String role;
  final bool isActive;
  final PasswordPolicy? passwordPolicy;

  const UserProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    required this.isActive,
    required this.passwordPolicy,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      phone: json['phone']?.toString(),
      role: (json['role'] ?? 'STAFF').toString(),
      isActive: json['isActive'] is bool
          ? json['isActive'] as bool
          : json['isActive']?.toString().toLowerCase() == 'true',
      passwordPolicy: json['passwordPolicy'] is Map<String, dynamic>
          ? PasswordPolicy.fromJson(
              json['passwordPolicy'] as Map<String, dynamic>)
          : null,
    );
  }
}
