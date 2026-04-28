import 'dart:convert';
import 'package:flutter/cupertino.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';

class CupertinoChangePasswordPage extends StatefulWidget {
  const CupertinoChangePasswordPage({super.key});

  @override
  State<CupertinoChangePasswordPage> createState() =>
      _CupertinoChangePasswordPageState();
}

class _CupertinoChangePasswordPageState
    extends State<CupertinoChangePasswordPage> {
  final _currentPasswordCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();

  bool _submitting = false;
  bool _showCurrent = false;
  bool _showNew = false;
  bool _showConfirm = false;

  String? _currentError;
  String? _newError;
  String? _confirmError;

  @override
  void dispose() {
    _currentPasswordCtrl.dispose();
    _newPasswordCtrl.dispose();
    _confirmPasswordCtrl.dispose();
    super.dispose();
  }

  double _passwordStrength(String password) {
    if (password.isEmpty) return 0;
    double strength = 0;
    if (password.length >= 8) strength += 0.25;
    if (RegExp(r'[A-Z]').hasMatch(password)) strength += 0.25;
    if (RegExp(r'[0-9]').hasMatch(password)) strength += 0.25;
    if (RegExp(r'[!@#$%^&*(),.?":{}|<>]').hasMatch(password)) {
      strength += 0.25;
    }
    return strength;
  }

  Color _strengthColor(double strength) {
    if (strength <= 0.25) return CupertinoColors.destructiveRed;
    if (strength <= 0.5) return CupertinoColors.activeOrange;
    if (strength <= 0.75) return const Color(0xFFEAB308);
    return CupertinoColors.activeGreen;
  }

  String _strengthLabel(double strength) {
    if (strength <= 0.25) return "Weak";
    if (strength <= 0.5) return "Fair";
    if (strength <= 0.75) return "Good";
    return "Strong";
  }

  bool _validate() {
    bool valid = true;
    _currentError = null;
    _newError = null;
    _confirmError = null;

    if (_currentPasswordCtrl.text.isEmpty) {
      _currentError = "Current password is required";
      valid = false;
    }

    final newPwd = _newPasswordCtrl.text;
    if (newPwd.isEmpty) {
      _newError = "New password is required";
      valid = false;
    } else if (newPwd.length < 8) {
      _newError = "Min 8 characters";
      valid = false;
    } else if (!RegExp(r'[A-Z]').hasMatch(newPwd)) {
      _newError = "Need uppercase letter";
      valid = false;
    } else if (!RegExp(r'[0-9]').hasMatch(newPwd)) {
      _newError = "Need a number";
      valid = false;
    } else if (!RegExp(r'[!@#$%^&*(),.?":{}|<>]').hasMatch(newPwd)) {
      _newError = "Need special character";
      valid = false;
    }

    if (_confirmPasswordCtrl.text.isEmpty) {
      _confirmError = "Confirm your password";
      valid = false;
    } else if (_confirmPasswordCtrl.text != _newPasswordCtrl.text) {
      _confirmError = "Passwords don't match";
      valid = false;
    }

    setState(() {});
    return valid;
  }

  Future<void> _submit() async {
    if (!_validate()) return;

    setState(() => _submitting = true);

    try {
      final res = await HttpService.put("/api/auth/password", {
        "currentPassword": _currentPasswordCtrl.text,
        "newPassword": _newPasswordCtrl.text,
      });

      if (res.statusCode == 200) {
        if (!mounted) return;
        CupertinoToast.show(context, "Password changed successfully");
        Navigator.pop(context);
      } else {
        String msg = "Failed";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (e) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final newPassword = _newPasswordCtrl.text;
    final strength = _passwordStrength(newPassword);

    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        middle: const Text("Change Password"),
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
      ),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: AppTheme.shadowSm,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Current Password
                  CupertinoTextField(
                    controller: _currentPasswordCtrl,
                    obscureText: !_showCurrent,
                    placeholder: "Current Password *",
                    prefix: Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Icon(CupertinoIcons.lock,
                          color: AppTheme.muted, size: 20),
                    ),
                    suffix: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () =>
                            setState(() => _showCurrent = !_showCurrent),
                        child: Icon(
                          _showCurrent
                              ? CupertinoIcons.eye_slash
                              : CupertinoIcons.eye,
                          color: AppTheme.muted,
                          size: 20,
                        ),
                      ),
                    ),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      border: Border.all(color: AppTheme.border),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  if (_currentError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(_currentError!,
                          style: const TextStyle(
                              color: CupertinoColors.destructiveRed,
                              fontSize: 12)),
                    ),
                  const SizedBox(height: 16),

                  // New Password
                  CupertinoTextField(
                    controller: _newPasswordCtrl,
                    obscureText: !_showNew,
                    placeholder: "New Password *",
                    prefix: Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Icon(CupertinoIcons.lock_fill,
                          color: AppTheme.muted, size: 20),
                    ),
                    suffix: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () => setState(() => _showNew = !_showNew),
                        child: Icon(
                          _showNew
                              ? CupertinoIcons.eye_slash
                              : CupertinoIcons.eye,
                          color: AppTheme.muted,
                          size: 20,
                        ),
                      ),
                    ),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      border: Border.all(color: AppTheme.border),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  if (_newError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(_newError!,
                          style: const TextStyle(
                              color: CupertinoColors.destructiveRed,
                              fontSize: 12)),
                    ),
                  if (newPassword.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: SizedBox(
                        height: 6,
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            return Stack(
                              children: [
                                Container(
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: CupertinoColors.systemGrey5,
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                                Container(
                                  height: 6,
                                  width: constraints.maxWidth * strength,
                                  decoration: BoxDecoration(
                                    color: _strengthColor(strength),
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Password Strength: ${_strengthLabel(strength)}",
                      style: TextStyle(
                          fontSize: 12,
                          color: _strengthColor(strength),
                          fontWeight: FontWeight.w600),
                    ),
                  ],
                  const SizedBox(height: 16),

                  // Confirm Password
                  CupertinoTextField(
                    controller: _confirmPasswordCtrl,
                    obscureText: !_showConfirm,
                    placeholder: "Confirm New Password *",
                    prefix: Padding(
                      padding: const EdgeInsets.only(left: 12),
                      child: Icon(CupertinoIcons.lock_rotation,
                          color: AppTheme.muted, size: 20),
                    ),
                    suffix: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () =>
                            setState(() => _showConfirm = !_showConfirm),
                        child: Icon(
                          _showConfirm
                              ? CupertinoIcons.eye_slash
                              : CupertinoIcons.eye,
                          color: AppTheme.muted,
                          size: 20,
                        ),
                      ),
                    ),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      border: Border.all(color: AppTheme.border),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  if (_confirmError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(_confirmError!,
                          style: const TextStyle(
                              color: CupertinoColors.destructiveRed,
                              fontSize: 12)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : const Text("Change Password",
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
