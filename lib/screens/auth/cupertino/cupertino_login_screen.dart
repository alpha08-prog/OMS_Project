import 'dart:convert';

import 'package:flutter/cupertino.dart';

import '../../../services/auth_service.dart';
import '../../../services/http_service.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../home/cupertino/cupertino_home_screen.dart';
import '../login_screen.dart' show SmoothCurveClipper;

class CupertinoLoginScreen extends StatefulWidget {
  const CupertinoLoginScreen({super.key});

  @override
  State<CupertinoLoginScreen> createState() => _CupertinoLoginScreenState();
}

class _CupertinoLoginScreenState extends State<CupertinoLoginScreen> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _submitting = false;
  bool _hidePassword = true;
  bool _rememberMe = true;

  String? _emailError;
  String? _passwordError;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // ================= VALIDATION =================
  bool _validate() {
    bool valid = true;

    if (_emailController.text.trim().isEmpty) {
      _emailError = 'Email required';
      valid = false;
    } else {
      _emailError = null;
    }

    if (_passwordController.text.length < 6) {
      _passwordError = 'Minimum 6 characters';
      valid = false;
    } else {
      _passwordError = null;
    }

    setState(() {});
    return valid;
  }

  // ================= REAL LOGIN =================
  Future<void> _submit() async {
    if (!_validate()) return;

    setState(() => _submitting = true);

    try {
      final res = await HttpService.post("/api/auth/login", {
        "identifier": _emailController.text.trim(),
        "password": _passwordController.text,
      });

      final Map<String, dynamic> json = jsonDecode(res.body);

      if (res.statusCode == 200 && json["success"] == true) {
        final data = json["data"];

        final token = data?["token"];
        final user = data?["user"];

        if (token == null || user == null) {
          _showToast("Invalid server response (token/user missing)");
          return;
        }

        final String userName =
            user["name"] ?? _emailController.text.split('@')[0];

        final String role = user["role"] ?? "STAFF";

        await AuthService.saveUserSession(
          token: token,
          userId: user["id"],
          username: userName,
          email: user["email"] ?? _emailController.text.trim(),
          role: role,
        );
        await AuthService.setRememberMe(_rememberMe);

        if (!mounted) return;

        Navigator.pushReplacement(
          context,
          CupertinoPageRoute(
            builder: (_) => CupertinoHomeScreen(
              userName: userName,
              role: role,
            ),
          ),
        );
      } else {
        final msg = json["message"] ?? "Invalid credentials";
        _showToast(msg);
      }
    } catch (e) {
      _showToast("Server error / No internet connection");
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showToast(String msg) {
    CupertinoToast.show(context, msg, isError: true);
  }

  // ================= HEADER =================
  Widget _headerSection() {
    return ClipPath(
      clipper: SmoothCurveClipper(),
      child: Container(
        height: 300,
        width: double.infinity,
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: AssetImage("assets/images/top_image.jpg"),
            fit: BoxFit.cover,
          ),
        ),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 60, 20, 30),
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x44000000), Color(0x88000000)],
            ),
          ),
          child: const Column(
            mainAxisAlignment: MainAxisAlignment.end,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                "Pralhad Joshi",
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: CupertinoColors.white,
                ),
              ),
              SizedBox(height: 6),
              Text(
                "Union Minister of Consumer Affairs, Food and Public Distribution &\n"
                "Member of Parliament \u2013 Dharwad Constituency",
                style: TextStyle(
                  fontSize: 13.5,
                  color: Color(0xB3FFFFFF),
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ================= LOGIN CARD =================
  Widget _loginCard(bool isWeb) {
    return Container(
      width: isWeb ? 460 : double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 24, 16, 32),
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: CupertinoColors.black.withOpacity(0.08),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          const Text(
            "Welcome Back",
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 24),

          // Email field
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CupertinoTextField(
                controller: _emailController,
                placeholder: "Email Address",
                prefix: const Padding(
                  padding: EdgeInsets.only(left: 12),
                  child: Icon(CupertinoIcons.mail,
                      color: CupertinoColors.systemGrey, size: 20),
                ),
                keyboardType: TextInputType.emailAddress,
                padding:
                    const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _emailError != null
                        ? CupertinoColors.destructiveRed
                        : CupertinoColors.systemGrey4,
                  ),
                ),
              ),
              if (_emailError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 8),
                  child: Text(
                    _emailError!,
                    style: const TextStyle(
                        color: CupertinoColors.destructiveRed, fontSize: 12),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 16),

          // Password field
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CupertinoTextField(
                controller: _passwordController,
                placeholder: "Password",
                obscureText: _hidePassword,
                prefix: const Padding(
                  padding: EdgeInsets.only(left: 12),
                  child: Icon(CupertinoIcons.lock,
                      color: CupertinoColors.systemGrey, size: 20),
                ),
                suffix: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () =>
                        setState(() => _hidePassword = !_hidePassword),
                    child: Icon(
                      _hidePassword
                          ? CupertinoIcons.eye_slash
                          : CupertinoIcons.eye,
                      color: CupertinoColors.systemGrey,
                      size: 20,
                    ),
                  ),
                ),
                padding:
                    const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: _passwordError != null
                        ? CupertinoColors.destructiveRed
                        : CupertinoColors.systemGrey4,
                  ),
                ),
              ),
              if (_passwordError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 8),
                  child: Text(
                    _passwordError!,
                    style: const TextStyle(
                        color: CupertinoColors.destructiveRed, fontSize: 12),
                  ),
                ),
            ],
          ),

          const SizedBox(height: 12),

          // Remember Me switch
          Row(
            children: [
              SizedBox(
                height: 28,
                child: CupertinoSwitch(
                  value: _rememberMe,
                  onChanged: (v) => setState(() => _rememberMe = v),
                  activeTrackColor: const Color(0xFF2563EB),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () => setState(() => _rememberMe = !_rememberMe),
                child: const Text(
                  "Remember Me",
                  style: TextStyle(fontSize: 14, color: CupertinoColors.black),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // Login button
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
                      "Login",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),

        ],
      ),
    );
  }

  // ================= BUILD =================
  @override
  Widget build(BuildContext context) {
    final isWeb = MediaQuery.of(context).size.width > 600;

    return CupertinoPageScaffold(
      backgroundColor: const Color(0xFFF3F4F8),
      child: SingleChildScrollView(
        child: Column(
          children: [
            _headerSection(),
            _loginCard(isWeb),
          ],
        ),
      ),
    );
  }
}
