import 'package:flutter/material.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'services/auth_service.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Anki Clone',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
        useMaterial3: true,
      ),
      home: const AuthCheck(),
    );
  }
}

class AuthCheck extends StatefulWidget {
  const AuthCheck({super.key});

  @override
  State<AuthCheck> createState() => _AuthCheckState();
}

class _AuthCheckState extends State<AuthCheck> {
  bool _isChecking = true;
  bool _isLoggedIn = false;

  String _userName = '';
  String _role = 'STAFF'; // default

  @override
  void initState() {
    super.initState();
    _checkLoginStatus();
  }

  Future<void> _checkLoginStatus() async {
    try {
      final token = await AuthService.getToken();
      final valid = await AuthService.isSessionValid();

      // ✅ Login valid only if token exists and session valid
      if (token != null && token.isNotEmpty && valid) {
        // ✅ Get user data from storage
        final userData = await AuthService.getUserData();

        setState(() {
          _isLoggedIn = true;
          _userName = userData['username'] ?? "User";
          _role = userData['role'] ?? "STAFF";
          _isChecking = false;
        });
      } else {
        // ✅ Token missing/invalid => clear session
        await AuthService.logout();
        setState(() {
          _isLoggedIn = false;
          _isChecking = false;
        });
      }
    } catch (e) {
      // ✅ On error, go login
      setState(() {
        _isLoggedIn = false;
        _isChecking = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isChecking) {
      return Scaffold(
        backgroundColor: const Color(0xFFF6F7FB),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset("assets/images/image.png", height: 80),
              const SizedBox(height: 24),
              const CircularProgressIndicator(),
              const SizedBox(height: 16),
              const Text("Loading..."),
            ],
          ),
        ),
      );
    }

    if (_isLoggedIn) {
      // ✅ Now pass role also
      return HomeScreen(
        userName: _userName,
        role: _role,
      );
    } else {
      return const LoginScreen();
    }
  }
}
