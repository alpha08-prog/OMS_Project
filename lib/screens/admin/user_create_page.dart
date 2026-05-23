import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class UserCreatePage extends StatefulWidget {
  const UserCreatePage({super.key});

  @override
  State<UserCreatePage> createState() => _UserCreatePageState();
}

class _UserCreatePageState extends State<UserCreatePage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  String? _selectedRole;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _submitting = false;

  static const List<Map<String, String>> _roles = [
    {'value': 'STAFF', 'label': 'Staff'},
    {'value': 'ADMIN', 'label': 'Admin'},
    {'value': 'SUPER_ADMIN', 'label': 'Super Admin'},
  ];

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _resetForm() {
    _formKey.currentState?.reset();
    _nameController.clear();
    _emailController.clear();
    _phoneController.clear();
    _passwordController.clear();
    _confirmPasswordController.clear();
    setState(() {
      _selectedRole = null;
      _obscurePassword = true;
      _obscureConfirmPassword = true;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedRole == null) {
      _showSnackBar("Please select a role", isSuccess: false);
      return;
    }

    setState(() => _submitting = true);

    try {
      final body = <String, dynamic>{
        'name': _nameController.text.trim(),
        'email': _emailController.text.trim(),
        'password': _passwordController.text,
        'role': _selectedRole,
      };
      final phone = _phoneController.text.trim();
      if (phone.isNotEmpty) body['phone'] = phone;

      final res = await HttpService.post("/api/auth/users", body);

      if (!mounted) return;

      if (res.statusCode == 200 || res.statusCode == 201) {
        _showSnackBar("User created successfully", isSuccess: true);
        Navigator.pop(context, true);
      } else {
        _showSnackBar(_parseError(res.body), isSuccess: false);
      }
    } catch (_) {
      if (!mounted) return;
      _showSnackBar("Network error. Please try again.", isSuccess: false);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _parseError(String body) {
    try {
      final decoded = jsonDecode(body);
      return decoded["message"] ?? "Failed to create user";
    } catch (_) {
      return "Failed to create user";
    }
  }

  void _showSnackBar(String message, {required bool isSuccess}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              isSuccess ? Icons.check_circle : Icons.error,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor:
            isSuccess ? AppTheme.successGreen : AppTheme.destructiveRed,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        margin: const EdgeInsets.all(16),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("Create User"),
        backgroundColor: AppTheme.primaryIndigo,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildHeader(),
            const SizedBox(height: 16),
            _buildFormCard(),
            const SizedBox(height: 16),
            _buildButtonsRow(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Create User",
            style: AppTheme.headingLg.copyWith(
              color: AppTheme.primaryIndigo,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Provision a new account. The user will be told their password "
            "and can rotate it from their profile after first login.",
            style: AppTheme.bodySm.copyWith(color: AppTheme.muted),
          ),
        ],
      ),
    );
  }

  Widget _buildFormCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.person_add_alt_1,
                  color: AppTheme.primaryIndigo, size: 22),
              const SizedBox(width: 8),
              Text(
                "Account Details",
                style: AppTheme.headingSm.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _label("Full Name *"),
          const SizedBox(height: 6),
          TextFormField(
            controller: _nameController,
            decoration: _inputDecoration(hintText: "Shri. ..."),
            validator: (v) =>
                (v == null || v.trim().isEmpty) ? "Name is required" : null,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          _label("Email *"),
          const SizedBox(height: 6),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: _inputDecoration(hintText: "user@example.com"),
            validator: (v) {
              final text = v?.trim() ?? "";
              if (text.isEmpty) return "Email is required";
              final emailRegex =
                  RegExp(r"^[\w\.\-+]+@[\w\-]+\.[\w\-\.]+$");
              if (!emailRegex.hasMatch(text)) return "Enter a valid email";
              return null;
            },
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          _label("Phone (10 digits, optional)"),
          const SizedBox(height: 6),
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: _inputDecoration(hintText: "9876543210", counter: ""),
            validator: (v) {
              final text = v?.trim() ?? "";
              if (text.isEmpty) return null;
              if (text.length != 10) return "Phone must be 10 digits";
              return null;
            },
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          _label("Role *"),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            value: _selectedRole,
            isExpanded: true,
            hint: const Text("Select a role"),
            decoration: _inputDecoration(),
            items: _roles
                .map((r) => DropdownMenuItem(
                      value: r['value'],
                      child: Text(r['label']!),
                    ))
                .toList(),
            onChanged: (v) => setState(() => _selectedRole = v),
            validator: (v) => v == null ? "Role is required" : null,
          ),
          const SizedBox(height: 16),
          _label("Initial Password *"),
          const SizedBox(height: 6),
          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            decoration: _inputDecoration(
              hintText: "Min. 8 characters",
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: AppTheme.muted,
                ),
                onPressed: () =>
                    setState(() => _obscurePassword = !_obscurePassword),
              ),
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return "Password is required";
              if (v.length < 8) return "Password must be at least 8 characters";
              return null;
            },
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 16),
          _label("Confirm Password *"),
          const SizedBox(height: 6),
          TextFormField(
            controller: _confirmPasswordController,
            obscureText: _obscureConfirmPassword,
            decoration: _inputDecoration(
              hintText: "Re-enter the password",
              suffixIcon: IconButton(
                icon: Icon(
                  _obscureConfirmPassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: AppTheme.muted,
                ),
                onPressed: () => setState(() =>
                    _obscureConfirmPassword = !_obscureConfirmPassword),
              ),
            ),
            validator: (v) {
              if (v == null || v.isEmpty) return "Please confirm the password";
              if (v != _passwordController.text) {
                return "Passwords do not match";
              }
              return null;
            },
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 16),
          _buildInfoBanner(),
        ],
      ),
    );
  }

  Widget _buildInfoBanner() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline,
              color: AppTheme.primaryIndigo, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              "The password you type here is what the user will log in with. "
              "The server stores only a one-way bcrypt hash; once you leave "
              "this page after creation, the plaintext is not retrievable. "
              "Make sure you write it down or copy it before navigating away.",
              style: AppTheme.bodySm.copyWith(
                color: AppTheme.primaryIndigo,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildButtonsRow() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        OutlinedButton(
          onPressed: _submitting ? null : _resetForm,
          style: OutlinedButton.styleFrom(
            foregroundColor: AppTheme.foreground,
            side: BorderSide(color: Colors.grey.shade300),
            padding:
                const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
          child: const Text("Reset"),
        ),
        const SizedBox(width: 12),
        ElevatedButton(
          onPressed: _submitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryIndigo,
            foregroundColor: Colors.white,
            padding:
                const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
            elevation: 0,
          ),
          child: _submitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation(Colors.white),
                  ),
                )
              : const Text(
                  "Create User",
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
        ),
      ],
    );
  }

  Widget _label(String text) {
    return Text(
      text,
      style: AppTheme.bodySm.copyWith(
        fontWeight: FontWeight.w600,
        color: AppTheme.foreground,
      ),
    );
  }

  InputDecoration _inputDecoration({
    String? hintText,
    Widget? suffixIcon,
    String? counter,
  }) {
    return InputDecoration(
      hintText: hintText,
      hintStyle: AppTheme.bodySm.copyWith(color: AppTheme.mutedForeground),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide:
            const BorderSide(color: AppTheme.primaryIndigo, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppTheme.destructiveRed),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide:
            const BorderSide(color: AppTheme.destructiveRed, width: 1.5),
      ),
      suffixIcon: suffixIcon,
      counterText: counter,
    );
  }
}
