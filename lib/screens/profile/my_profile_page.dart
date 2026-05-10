import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/user_profile.dart';
import '../../services/profile_service.dart';
import '../../theme/app_theme.dart';

class MyProfilePage extends StatefulWidget {
  const MyProfilePage({super.key});

  @override
  State<MyProfilePage> createState() => _MyProfilePageState();
}

class _MyProfilePageState extends State<MyProfilePage> {
  static const double _wideBreakpoint = 720;

  bool _loading = true;
  String? _loadError;
  UserProfile? _profile;

  // Password form
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showCurrent = false;
  bool _showNew = false;
  bool _showConfirm = false;
  bool _submitting = false;
  String? _confirmError;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _newCtrl.addListener(() => setState(() {}));
    _confirmCtrl.addListener(() {
      if (_confirmError != null) setState(() => _confirmError = null);
    });
  }

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    final res = await ProfileService.getMyProfile();
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (res.ok && res.data != null) {
        _profile = res.data;
      } else {
        _loadError = res.message ?? 'Failed to load profile';
      }
    });
  }

  // Returns failing-rule hint(s) to show under the new-password input.
  // Empty list means all rules pass (hint hides).
  List<String> _passwordHints(String pw) {
    if (pw.isEmpty || pw.length < 8) {
      return const ['Minimum 8 characters.'];
    }
    final missing = <String>[];
    if (!RegExp(r'[A-Z]').hasMatch(pw)) missing.add('uppercase letter');
    if (!RegExp(r'[a-z]').hasMatch(pw)) missing.add('lowercase letter');
    if (!RegExp(r'\d').hasMatch(pw)) missing.add('digit');
    if (!RegExp(r'[^A-Za-z0-9]').hasMatch(pw)) missing.add('special character');
    if (missing.isEmpty) return const [];
    return ['Must contain ${missing.join(', ')}.'];
  }

  bool get _passwordValid =>
      _newCtrl.text.length >= 8 && _passwordHints(_newCtrl.text).isEmpty;

  void _resetForm() {
    _currentCtrl.clear();
    _newCtrl.clear();
    _confirmCtrl.clear();
    setState(() {
      _showCurrent = false;
      _showNew = false;
      _showConfirm = false;
      _confirmError = null;
    });
  }

  Future<void> _submitPassword() async {
    final cur = _currentCtrl.text;
    final newer = _newCtrl.text;
    final confirm = _confirmCtrl.text;

    if (cur.isEmpty) {
      _snack('Current password is required');
      return;
    }
    if (!_passwordValid) {
      _snack('New password does not meet the requirements');
      return;
    }
    if (newer != confirm) {
      setState(() => _confirmError = "Passwords don't match");
      return;
    }

    setState(() => _submitting = true);
    final res = await ProfileService.changePassword(
      currentPassword: cur,
      newPassword: newer,
    );
    if (!mounted) return;
    setState(() => _submitting = false);

    if (res.ok) {
      _snack(res.message ?? 'Password updated', success: true);
      _resetForm();
      // Refresh profile so policy.used reflects the new count.
      if (res.policy != null && _profile != null) {
        setState(() {
          _profile = UserProfile(
            id: _profile!.id,
            name: _profile!.name,
            email: _profile!.email,
            phone: _profile!.phone,
            role: _profile!.role,
            isActive: _profile!.isActive,
            passwordPolicy: res.policy,
          );
        });
      } else {
        await _loadProfile();
      }
    } else {
      _snack(res.message ?? 'Failed to update password');
    }
  }

  void _snack(String msg, {bool success = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor:
            success ? AppTheme.successGreen : AppTheme.destructiveRed,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('My Profile'),
        backgroundColor: AppTheme.primaryIndigo,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.primaryIndigo))
          : _loadError != null
              ? _buildErrorState()
              : _buildContent(),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline,
              size: 56, color: AppTheme.destructiveRed.withOpacity(0.7)),
          const SizedBox(height: 12),
          Text(_loadError ?? 'Something went wrong',
              style: AppTheme.bodyMd, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadProfile,
            style: AppTheme.primaryButton(),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    final p = _profile!;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1100),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildPageHeader(),
              const SizedBox(height: 20),
              _buildIdentityCard(p),
              const SizedBox(height: 16),
              _buildAccountInfoCard(p),
              const SizedBox(height: 16),
              _buildChangePasswordCard(p),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPageHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'My Profile',
          style: AppTheme.headingXl.copyWith(color: AppTheme.primaryIndigoDark),
        ),
        const SizedBox(height: 4),
        Text(
          'View your account information and change your password.',
          style: AppTheme.bodyMd.copyWith(color: AppTheme.muted),
        ),
      ],
    );
  }

  Widget _buildIdentityCard(UserProfile p) {
    final initial =
        (p.name.isNotEmpty ? p.name[0] : '?').toUpperCase();
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: AppTheme.cardDecoration(
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              color: AppTheme.primaryIndigo,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.name.isEmpty ? 'User' : p.name,
                  style: AppTheme.headingMd
                      .copyWith(color: AppTheme.primaryIndigoDark),
                ),
                const SizedBox(height: 2),
                Text(
                  p.email,
                  style: AppTheme.bodySm.copyWith(color: AppTheme.muted),
                ),
              ],
            ),
          ),
          _buildRoleBadge(p.role),
        ],
      ),
    );
  }

  Widget _buildRoleBadge(String role) {
    Color bg;
    Color fg;
    switch (role) {
      case 'ADMIN':
        bg = AppTheme.primaryIndigo50;
        fg = AppTheme.primaryIndigoDark;
        break;
      case 'SUPER_ADMIN':
        bg = AppTheme.warningAmber50;
        fg = AppTheme.saffronDark;
        break;
      case 'STAFF':
      default:
        bg = AppTheme.successGreen100;
        fg = const Color(0xFF065F46);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.shield_outlined, size: 14, color: fg),
          const SizedBox(width: 6),
          Text(
            role,
            style: TextStyle(
              color: fg,
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAccountInfoCard(UserProfile p) {
    return _sectionCard(
      icon: Icons.person_outline,
      title: 'Account Information',
      children: [
        _twoColumn(
          [
            _readOnlyField(
                icon: Icons.person_outline, label: 'Name', value: p.name),
            _readOnlyField(
                icon: Icons.mail_outline, label: 'Email', value: p.email),
          ],
          [
            _readOnlyField(
                icon: Icons.phone_outlined,
                label: 'Contact Number',
                value: p.phone ?? '—'),
            _readOnlyField(
                icon: Icons.shield_outlined, label: 'Role', value: p.role),
          ],
        ),
        const SizedBox(height: 16),
        _infoBanner(
          'Name, email, contact number, and role are managed by your administrator. Contact your administrator if any of these need to change.',
        ),
      ],
    );
  }

  Widget _buildChangePasswordCard(UserProfile p) {
    final policy = p.passwordPolicy;
    return _sectionCard(
      icon: Icons.vpn_key_outlined,
      title: 'Change Password',
      children: [
        if (policy != null) _policyBanner(policy),
        const SizedBox(height: 20),
        _passwordLabel('Current Password'),
        const SizedBox(height: 6),
        _passwordField(
          controller: _currentCtrl,
          show: _showCurrent,
          onToggle: () => setState(() => _showCurrent = !_showCurrent),
        ),
        const SizedBox(height: 18),
        LayoutBuilder(builder: (ctx, c) {
          final wide = c.maxWidth >= _wideBreakpoint - 100;
          if (wide) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: _newPasswordColumn()),
                const SizedBox(width: 16),
                Expanded(child: _confirmPasswordColumn()),
              ],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _newPasswordColumn(),
              const SizedBox(height: 18),
              _confirmPasswordColumn(),
            ],
          );
        }),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            OutlinedButton(
              onPressed: _submitting ? null : _resetForm,
              style: OutlinedButton.styleFrom(
                padding:
                    const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                ),
                side: const BorderSide(color: AppTheme.border),
                foregroundColor: AppTheme.foreground,
              ),
              child: const Text('Reset',
                  style: TextStyle(fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: 12),
            ElevatedButton(
              onPressed: _submitting ? null : _submitPassword,
              style: AppTheme.primaryButton(),
              child: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : const Text('Update Password',
                      style: TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 14)),
            ),
          ],
        ),
      ],
    );
  }

  Widget _newPasswordColumn() {
    final hints = _passwordHints(_newCtrl.text);
    final isError = _newCtrl.text.isNotEmpty && _newCtrl.text.length >= 8;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _passwordLabel('New Password'),
        const SizedBox(height: 6),
        _passwordField(
          controller: _newCtrl,
          show: _showNew,
          onToggle: () => setState(() => _showNew = !_showNew),
        ),
        if (hints.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            hints.first,
            style: TextStyle(
              fontSize: 12,
              color: isError ? AppTheme.destructiveRed : AppTheme.muted,
              fontWeight: isError ? FontWeight.w500 : FontWeight.normal,
            ),
          ),
        ],
      ],
    );
  }

  Widget _confirmPasswordColumn() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _passwordLabel('Confirm New Password'),
        const SizedBox(height: 6),
        _passwordField(
          controller: _confirmCtrl,
          show: _showConfirm,
          onToggle: () => setState(() => _showConfirm = !_showConfirm),
          errorText: _confirmError,
        ),
      ],
    );
  }

  // ───────────────────────── shared widgets ─────────────────────────

  Widget _sectionCard({
    required IconData icon,
    required String title,
    required List<Widget> children,
  }) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: AppTheme.cardDecoration(
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: AppTheme.primaryIndigo),
              const SizedBox(width: 8),
              Text(
                title,
                style: AppTheme.headingSm.copyWith(fontSize: 17),
              ),
            ],
          ),
          const SizedBox(height: 20),
          ...children,
        ],
      ),
    );
  }

  Widget _twoColumn(List<Widget> left, List<Widget> right) {
    return LayoutBuilder(builder: (ctx, c) {
      final wide = c.maxWidth >= _wideBreakpoint - 100;
      if (wide) {
        final rows = <Widget>[];
        final pairs =
            left.length > right.length ? left.length : right.length;
        for (var i = 0; i < pairs; i++) {
          rows.add(Padding(
            padding: EdgeInsets.only(top: i == 0 ? 0 : 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: i < left.length ? left[i] : const SizedBox()),
                const SizedBox(width: 16),
                Expanded(
                    child: i < right.length ? right[i] : const SizedBox()),
              ],
            ),
          ));
        }
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: rows);
      }
      // Stack vertically on narrow.
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final w in [...left, ...right])
            Padding(padding: const EdgeInsets.only(bottom: 16), child: w),
        ],
      );
    });
  }

  Widget _readOnlyField({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 14, color: AppTheme.muted),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.muted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.backgroundAlt,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            border: Border.all(color: AppTheme.border),
          ),
          child: Text(
            value,
            style: AppTheme.bodyMd.copyWith(color: AppTheme.muted),
          ),
        ),
      ],
    );
  }

  Widget _infoBanner(String text) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: AppTheme.primaryIndigo100),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline,
              size: 18, color: AppTheme.primaryIndigo),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: AppTheme.bodySm.copyWith(color: AppTheme.muted),
            ),
          ),
        ],
      ),
    );
  }

  Widget _policyBanner(PasswordPolicy policy) {
    final fmt = DateFormat('dd MMM yyyy');
    final resetText = fmt.format(policy.resetsAt.toLocal());
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: AppTheme.primaryIndigo100),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline,
              size: 18, color: AppTheme.primaryIndigo),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${policy.used} of ${policy.allowed} password changes used this month',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.primaryIndigoDark,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Resets on $resetText.',
                  style: AppTheme.bodySm.copyWith(color: AppTheme.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _passwordLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w700,
        color: AppTheme.foreground,
      ),
    );
  }

  Widget _passwordField({
    required TextEditingController controller,
    required bool show,
    required VoidCallback onToggle,
    String? errorText,
  }) {
    return TextField(
      controller: controller,
      obscureText: !show,
      decoration: InputDecoration(
        filled: true,
        fillColor: AppTheme.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          borderSide: const BorderSide(color: AppTheme.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          borderSide:
              const BorderSide(color: AppTheme.primaryIndigo, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          borderSide: const BorderSide(color: AppTheme.destructiveRed),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusMd),
          borderSide:
              const BorderSide(color: AppTheme.destructiveRed, width: 1.5),
        ),
        errorText: errorText,
        suffixIcon: IconButton(
          icon: Icon(
            show ? Icons.visibility_off_outlined : Icons.visibility_outlined,
            color: AppTheme.muted,
            size: 20,
          ),
          onPressed: onToggle,
        ),
      ),
    );
  }
}
