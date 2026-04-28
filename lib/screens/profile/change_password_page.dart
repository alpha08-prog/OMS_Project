import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class ChangePasswordPage extends StatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  State<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends State<ChangePasswordPage> {
  final _formKey = GlobalKey<FormState>();

  final _currentPasswordCtrl = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPasswordCtrl = TextEditingController();

  bool _submitting = false;
  bool _showCurrent = false;
  bool _showNew = false;
  bool _showConfirm = false;

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
    if (RegExp(r'[!@#$%^&*(),.?":{}|<>]').hasMatch(password)) strength += 0.25;
    return strength;
  }

  Color _strengthColor(double strength) {
    if (strength <= 0.25) return Colors.red;
    if (strength <= 0.5) return Colors.orange;
    if (strength <= 0.75) return Colors.yellow.shade700;
    return Colors.green;
  }

  String _strengthLabel(double strength) {
    if (strength <= 0.25) return "Weak";
    if (strength <= 0.5) return "Fair";
    if (strength <= 0.75) return "Good";
    return "Strong";
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);

    try {
      final res = await HttpService.put("/api/auth/password", {
        "currentPassword": _currentPasswordCtrl.text,
        "newPassword": _newPasswordCtrl.text,
      });

      if (res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Password changed successfully")),
        );
        Navigator.pop(context);
      } else {
        String msg = "Failed";
        try { msg = jsonDecode(res.body)["message"] ?? msg; } catch (_) {}
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final newPassword = _newPasswordCtrl.text;
    final strength = _passwordStrength(newPassword);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("Change Password"),
        backgroundColor: AppTheme.primaryIndigo,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: AppTheme.shadowSm,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextFormField(
                    controller: _currentPasswordCtrl,
                    obscureText: !_showCurrent,
                    decoration: InputDecoration(
                      labelText: "Current Password *",
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: IconButton(
                        icon: Icon(_showCurrent ? Icons.visibility_off : Icons.visibility),
                        onPressed: () => setState(() => _showCurrent = !_showCurrent),
                      ),
                    ),
                    validator: (v) =>
                        (v == null || v.isEmpty) ? "Current password is required" : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _newPasswordCtrl,
                    obscureText: !_showNew,
                    decoration: InputDecoration(
                      labelText: "New Password *",
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.lock),
                      suffixIcon: IconButton(
                        icon: Icon(_showNew ? Icons.visibility_off : Icons.visibility),
                        onPressed: () => setState(() => _showNew = !_showNew),
                      ),
                    ),
                    onChanged: (_) => setState(() {}),
                    validator: (v) {
                      if (v == null || v.isEmpty) return "New password is required";
                      if (v.length < 8) return "Min 8 characters";
                      if (!RegExp(r'[A-Z]').hasMatch(v)) return "Need uppercase letter";
                      if (!RegExp(r'[0-9]').hasMatch(v)) return "Need a number";
                      if (!RegExp(r'[!@#$%^&*(),.?":{}|<>]').hasMatch(v)) return "Need special character";
                      return null;
                    },
                  ),
                  if (newPassword.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: strength,
                        backgroundColor: Colors.grey.shade200,
                        valueColor: AlwaysStoppedAnimation(_strengthColor(strength)),
                        minHeight: 6,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Password Strength: ${_strengthLabel(strength)}",
                      style: TextStyle(fontSize: 12, color: _strengthColor(strength), fontWeight: FontWeight.w600),
                    ),
                  ],
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _confirmPasswordCtrl,
                    obscureText: !_showConfirm,
                    decoration: InputDecoration(
                      labelText: "Confirm New Password *",
                      border: const OutlineInputBorder(),
                      prefixIcon: const Icon(Icons.lock_clock),
                      suffixIcon: IconButton(
                        icon: Icon(_showConfirm ? Icons.visibility_off : Icons.visibility),
                        onPressed: () => setState(() => _showConfirm = !_showConfirm),
                      ),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) return "Confirm your password";
                      if (v != _newPasswordCtrl.text) return "Passwords don't match";
                      return null;
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: AppTheme.primaryButton(),
                child: _submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text("Change Password",
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
