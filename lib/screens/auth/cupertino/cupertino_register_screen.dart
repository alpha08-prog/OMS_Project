import 'dart:convert';

import 'package:flutter/cupertino.dart';
import 'package:flutter/gestures.dart';

import '../../../services/http_service.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import 'cupertino_login_screen.dart';

class CupertinoRegisterScreen extends StatefulWidget {
  const CupertinoRegisterScreen({super.key});

  @override
  State<CupertinoRegisterScreen> createState() =>
      _CupertinoRegisterScreenState();
}

class _CupertinoRegisterScreenState extends State<CupertinoRegisterScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();
  final TextEditingController _countryCodeController =
      TextEditingController(text: '+91');
  final TextEditingController _mobileController = TextEditingController();

  bool _agree = false;
  bool _submitting = false;
  bool _hidePassword = true;
  bool _hideConfirmPassword = true;

  // Validation error strings
  String? _nameError;
  String? _emailError;
  String? _passwordError;
  String? _confirmPasswordError;
  String? _countryCodeError;
  String? _mobileError;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _countryCodeController.dispose();
    _mobileController.dispose();
    super.dispose();
  }

  // ================= VALIDATION =================
  bool _validate() {
    bool valid = true;

    _nameError = (_nameController.text.trim().isEmpty) ? 'Required' : null;
    if (_nameError != null) valid = false;

    _emailError = (_emailController.text.trim().isEmpty ||
            !_emailController.text.contains('@'))
        ? 'Enter valid email'
        : null;
    if (_emailError != null) valid = false;

    _passwordError =
        (_passwordController.text.length < 6) ? 'Min 6 characters' : null;
    if (_passwordError != null) valid = false;

    _confirmPasswordError =
        (_confirmPasswordController.text.isEmpty) ? 'Required' : null;
    if (_confirmPasswordError != null) valid = false;

    _countryCodeError =
        (_countryCodeController.text.isEmpty) ? 'Required' : null;
    if (_countryCodeError != null) valid = false;

    _mobileError =
        (_mobileController.text.length < 7) ? 'Invalid' : null;
    if (_mobileError != null) valid = false;

    setState(() {});
    return valid;
  }

  // ================= SUBMIT =================
  Future<void> _submit() async {
    if (!_validate()) return;

    if (!_agree) {
      CupertinoToast.show(
          context, 'Please agree to Terms and Conditions', isError: true);
      return;
    }

    if (_passwordController.text.trim() !=
        _confirmPasswordController.text.trim()) {
      CupertinoToast.show(context, 'Passwords do not match', isError: true);
      return;
    }

    setState(() => _submitting = true);

    try {
      final registerResponse = await HttpService.post(
        "/api/auth/register",
        {
          "username": _nameController.text.trim(),
          "email": _emailController.text.trim(),
          "password": _passwordController.text.trim(),
        },
      );

      setState(() => _submitting = false);

      if (registerResponse.statusCode == 201) {
        CupertinoToast.show(context, 'Registration successful!');

        if (mounted) {
          // OTP navigation placeholder (commented out like original)
          // Navigator.push(
          //   context,
          //   CupertinoPageRoute(
          //     builder: (context) => CupertinoOtpScreen(email: _emailController.text.trim()),
          //   ),
          // );
        }
      } else {
        final error = jsonDecode(registerResponse.body);
        CupertinoToast.show(
            context, error['message'] ?? 'Registration failed',
            isError: true);
      }
    } catch (e) {
      setState(() => _submitting = false);
      CupertinoToast.show(context, 'Something went wrong: $e', isError: true);
    }
  }

  // ================= INPUT FIELD =================
  Widget _inputField({
    required TextEditingController controller,
    required String placeholder,
    required IconData icon,
    bool obscure = false,
    TextInputType type = TextInputType.text,
    String? error,
    VoidCallback? onToggle,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          placeholder: placeholder,
          obscureText: obscure,
          keyboardType: type,
          prefix: Padding(
            padding: const EdgeInsets.only(left: 12),
            child: Icon(icon, color: CupertinoColors.systemGrey, size: 20),
          ),
          suffix: onToggle != null
              ? Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: onToggle,
                    child: Icon(
                      obscure
                          ? CupertinoIcons.eye_slash
                          : CupertinoIcons.eye,
                      color: CupertinoColors.systemGrey,
                      size: 20,
                    ),
                  ),
                )
              : null,
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 8),
            child: Text(
              error,
              style: const TextStyle(
                  color: CupertinoColors.destructiveRed, fontSize: 12),
            ),
          ),
      ],
    );
  }

  // ================= BUILD =================
  @override
  Widget build(BuildContext context) {
    final isWeb = MediaQuery.of(context).size.width > 600;

    return CupertinoPageScaffold(
      backgroundColor: const Color(0xFFF3F4F8),
      child: Center(
        child: SingleChildScrollView(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: isWeb ? 480 : double.infinity,
            padding: const EdgeInsets.all(28),
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: CupertinoColors.black.withOpacity(0.08),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Column(
              children: [
                const SizedBox(height: 16),
                const Text(
                  "Create Account",
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 6),
                const Text(
                  "Register to continue",
                  style: TextStyle(fontSize: 15, color: CupertinoColors.systemGrey),
                ),
                const SizedBox(height: 28),

                _inputField(
                  controller: _nameController,
                  placeholder: "Full Name",
                  icon: CupertinoIcons.person,
                  error: _nameError,
                ),

                const SizedBox(height: 16),

                _inputField(
                  controller: _emailController,
                  placeholder: "Email Address",
                  icon: CupertinoIcons.mail,
                  type: TextInputType.emailAddress,
                  error: _emailError,
                ),

                const SizedBox(height: 16),

                _inputField(
                  controller: _passwordController,
                  placeholder: "Password",
                  icon: CupertinoIcons.lock,
                  obscure: _hidePassword,
                  error: _passwordError,
                  onToggle: () =>
                      setState(() => _hidePassword = !_hidePassword),
                ),

                const SizedBox(height: 16),

                _inputField(
                  controller: _confirmPasswordController,
                  placeholder: "Confirm Password",
                  icon: CupertinoIcons.lock_rotation,
                  obscure: _hideConfirmPassword,
                  error: _confirmPasswordError,
                  onToggle: () => setState(
                      () => _hideConfirmPassword = !_hideConfirmPassword),
                ),

                const SizedBox(height: 16),

                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: _inputField(
                        controller: _countryCodeController,
                        placeholder: "Code",
                        icon: CupertinoIcons.flag,
                        type: TextInputType.phone,
                        error: _countryCodeError,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 7,
                      child: _inputField(
                        controller: _mobileController,
                        placeholder: "Mobile Number",
                        icon: CupertinoIcons.phone,
                        type: TextInputType.phone,
                        error: _mobileError,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),

                // Terms agreement with CupertinoSwitch
                Row(
                  children: [
                    SizedBox(
                      height: 28,
                      child: CupertinoSwitch(
                        value: _agree,
                        onChanged: (v) => setState(() => _agree = v),
                        activeTrackColor: const Color(0xFF2563EB),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: RichText(
                        text: const TextSpan(
                          text: "I agree to the ",
                          style: TextStyle(color: CupertinoColors.black),
                          children: [
                            TextSpan(
                              text: "Terms & Conditions",
                              style: TextStyle(
                                color: CupertinoColors.activeBlue,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 22),

                // Sign Up button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: CupertinoButton.filled(
                    borderRadius: BorderRadius.circular(14),
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const CupertinoActivityIndicator(
                            color: CupertinoColors.white)
                        : const Text(
                            "Sign Up",
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: 18),

                RichText(
                  text: TextSpan(
                    text: "Already have an account? ",
                    style: const TextStyle(color: CupertinoColors.black),
                    children: [
                      TextSpan(
                        text: "Login",
                        style: const TextStyle(
                          color: CupertinoColors.activeBlue,
                          fontWeight: FontWeight.w600,
                        ),
                        recognizer: TapGestureRecognizer()
                          ..onTap = () {
                            Navigator.push(
                              context,
                              CupertinoPageRoute(
                                builder: (_) => const CupertinoLoginScreen(),
                              ),
                            );
                          },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
