import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

class CupertinoUserCreatePage extends StatefulWidget {
  const CupertinoUserCreatePage({super.key});

  @override
  State<CupertinoUserCreatePage> createState() =>
      _CupertinoUserCreatePageState();
}

class _CupertinoUserCreatePageState extends State<CupertinoUserCreatePage> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  String? _selectedRole;
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _submitting = false;

  String? _nameError;
  String? _emailError;
  String? _phoneError;
  String? _roleError;
  String? _passwordError;
  String? _confirmPasswordError;

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

  String _roleLabel(String value) {
    return _roles.firstWhere((r) => r['value'] == value,
        orElse: () => {'label': value})['label']!;
  }

  bool _validate() {
    bool ok = true;

    if (_nameController.text.trim().isEmpty) {
      _nameError = "Name is required";
      ok = false;
    } else {
      _nameError = null;
    }

    final email = _emailController.text.trim();
    if (email.isEmpty) {
      _emailError = "Email is required";
      ok = false;
    } else if (!RegExp(r"^[\w\.\-+]+@[\w\-]+\.[\w\-\.]+$").hasMatch(email)) {
      _emailError = "Enter a valid email";
      ok = false;
    } else {
      _emailError = null;
    }

    final phone = _phoneController.text.trim();
    if (phone.isNotEmpty && phone.length != 10) {
      _phoneError = "Phone must be 10 digits";
      ok = false;
    } else {
      _phoneError = null;
    }

    if (_selectedRole == null) {
      _roleError = "Role is required";
      ok = false;
    } else {
      _roleError = null;
    }

    if (_passwordController.text.isEmpty) {
      _passwordError = "Password is required";
      ok = false;
    } else if (_passwordController.text.length < 8) {
      _passwordError = "Password must be at least 8 characters";
      ok = false;
    } else {
      _passwordError = null;
    }

    if (_confirmPasswordController.text.isEmpty) {
      _confirmPasswordError = "Please confirm the password";
      ok = false;
    } else if (_confirmPasswordController.text != _passwordController.text) {
      _confirmPasswordError = "Passwords do not match";
      ok = false;
    } else {
      _confirmPasswordError = null;
    }

    setState(() {});
    return ok;
  }

  void _resetForm() {
    _nameController.clear();
    _emailController.clear();
    _phoneController.clear();
    _passwordController.clear();
    _confirmPasswordController.clear();
    setState(() {
      _selectedRole = null;
      _obscurePassword = true;
      _obscureConfirmPassword = true;
      _nameError = null;
      _emailError = null;
      _phoneError = null;
      _roleError = null;
      _passwordError = null;
      _confirmPasswordError = null;
    });
  }

  Future<void> _submit() async {
    if (!_validate()) return;

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
        CupertinoToast.show(context, "User created successfully");
        Navigator.pop(context, true);
      } else {
        CupertinoToast.show(context, _parseError(res.body), isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Network error. Please try again.",
          isError: true);
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

  void _pickRole() {
    final names = _roles.map((r) => r['label']!).toList();
    final currentLabel =
        _selectedRole == null ? names.first : _roleLabel(_selectedRole!);
    CupertinoFormHelpers.showPicker(
      context: context,
      items: names,
      currentValue: currentLabel,
      title: "Select Role",
      onSelected: (label) {
        final entry = _roles.firstWhere((r) => r['label'] == label,
            orElse: () => _roles.first);
        setState(() {
          _selectedRole = entry['value'];
          _roleError = null;
        });
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        middle: const Text(
          "Create User",
          style: TextStyle(color: CupertinoColors.white),
        ),
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        previousPageTitle: "Users",
      ),
      child: SafeArea(
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
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(CupertinoIcons.person_badge_plus,
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
          _textField(
            controller: _nameController,
            placeholder: "Shri. ...",
            error: _nameError,
          ),
          const SizedBox(height: 16),
          _label("Email *"),
          const SizedBox(height: 6),
          _textField(
            controller: _emailController,
            placeholder: "user@example.com",
            keyboardType: TextInputType.emailAddress,
            error: _emailError,
          ),
          const SizedBox(height: 16),
          _label("Phone (10 digits, optional)"),
          const SizedBox(height: 6),
          _textField(
            controller: _phoneController,
            placeholder: "9876543210",
            keyboardType: TextInputType.phone,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            error: _phoneError,
          ),
          const SizedBox(height: 16),
          _label("Role *"),
          const SizedBox(height: 6),
          _rolePicker(),
          if (_roleError != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text(
                _roleError!,
                style: const TextStyle(
                  fontSize: 12,
                  color: CupertinoColors.destructiveRed,
                ),
              ),
            ),
          const SizedBox(height: 16),
          _label("Initial Password *"),
          const SizedBox(height: 6),
          _textField(
            controller: _passwordController,
            placeholder: "Min. 8 characters",
            obscureText: _obscurePassword,
            suffix: GestureDetector(
              onTap: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Icon(
                  _obscurePassword
                      ? CupertinoIcons.eye
                      : CupertinoIcons.eye_slash,
                  color: CupertinoColors.systemGrey,
                  size: 20,
                ),
              ),
            ),
            error: _passwordError,
          ),
          const SizedBox(height: 16),
          _label("Confirm Password *"),
          const SizedBox(height: 6),
          _textField(
            controller: _confirmPasswordController,
            placeholder: "Re-enter the password",
            obscureText: _obscureConfirmPassword,
            suffix: GestureDetector(
              onTap: () => setState(() =>
                  _obscureConfirmPassword = !_obscureConfirmPassword),
              child: Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Icon(
                  _obscureConfirmPassword
                      ? CupertinoIcons.eye
                      : CupertinoIcons.eye_slash,
                  color: CupertinoColors.systemGrey,
                  size: 20,
                ),
              ),
            ),
            error: _confirmPasswordError,
          ),
          const SizedBox(height: 16),
          _buildInfoBanner(),
        ],
      ),
    );
  }

  Widget _rolePicker() {
    final label = _selectedRole == null
        ? "Select a role"
        : _roleLabel(_selectedRole!);
    final isPlaceholder = _selectedRole == null;
    return GestureDetector(
      onTap: _pickRole,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: _roleError != null
                ? CupertinoColors.destructiveRed
                : CupertinoColors.systemGrey4,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  color: isPlaceholder
                      ? CupertinoColors.systemGrey
                      : CupertinoColors.label,
                ),
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 14, color: CupertinoColors.systemGrey),
          ],
        ),
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
          const Icon(CupertinoIcons.info_circle,
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
        CupertinoButton(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          onPressed: _submitting ? null : _resetForm,
          child: const Text(
            "Reset",
            style: TextStyle(
              color: CupertinoColors.label,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: 12),
        CupertinoButton(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          color: AppTheme.primaryIndigo,
          borderRadius: BorderRadius.circular(10),
          onPressed: _submitting ? null : _submit,
          child: _submitting
              ? const CupertinoActivityIndicator(
                  color: CupertinoColors.white)
              : const Text(
                  "Create User",
                  style: TextStyle(
                    color: CupertinoColors.white,
                    fontWeight: FontWeight.w600,
                  ),
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

  Widget _textField({
    required TextEditingController controller,
    required String placeholder,
    TextInputType? keyboardType,
    bool obscureText = false,
    Widget? suffix,
    int? maxLength,
    List<TextInputFormatter>? inputFormatters,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          placeholder: placeholder,
          keyboardType: keyboardType,
          obscureText: obscureText,
          maxLength: maxLength,
          inputFormatters: inputFormatters,
          suffix: suffix,
          padding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: CupertinoColors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
          placeholderStyle: const TextStyle(
            color: CupertinoColors.systemGrey,
            fontSize: 14,
          ),
          style: const TextStyle(fontSize: 14),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              error,
              style: const TextStyle(
                fontSize: 12,
                color: CupertinoColors.destructiveRed,
              ),
            ),
          ),
      ],
    );
  }
}
