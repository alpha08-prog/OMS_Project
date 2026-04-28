import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/cupertino/cupertino_login_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/home/cupertino/cupertino_home_screen.dart';
import 'services/auth_service.dart';
import 'services/theme_service.dart';
import 'theme/app_theme.dart';
import 'theme/cupertino_theme.dart';
import 'utils/platform_utils.dart';

// Global theme service instance
final ThemeService themeService = ThemeService();

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    themeService.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    if (PlatformUtils.isCupertino) {
      return CupertinoApp(
        title: 'OMS - Office Management',
        debugShowCheckedModeBanner: false,
        theme: CupertinoAppTheme.themeFor(themeService.isDark),
        home: const AuthCheck(),
      );
    }

    return MaterialApp(
      title: 'OMS - Office Management',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeService.themeMode,
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

      // Login valid only if token exists and session valid
      if (token != null && token.isNotEmpty && valid) {
        // Get user data from storage
        final userData = await AuthService.getUserData();

        setState(() {
          _isLoggedIn = true;
          _userName = userData['username'] ?? "User";
          _role = userData['role'] ?? "STAFF";
          _isChecking = false;
        });
      } else {
        // Token missing/invalid => clear session
        await AuthService.logout();
        setState(() {
          _isLoggedIn = false;
          _isChecking = false;
        });
      }
    } catch (e) {
      // On error, go login
      setState(() {
        _isLoggedIn = false;
        _isChecking = false;
      });
    }
  }

  Widget _buildLoadingWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              gradient: AppTheme.primaryGradient,
              borderRadius: BorderRadius.circular(AppTheme.radiusLg),
              boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
            ),
            child: Center(
              child: Icon(
                PlatformUtils.isCupertino
                    ? CupertinoIcons.building_2_fill
                    : Icons.business,
                size: 40,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 24),
          PlatformUtils.isCupertino
              ? const CupertinoActivityIndicator(radius: 16)
              : const CircularProgressIndicator(color: AppTheme.primaryIndigo),
          const SizedBox(height: 16),
          Text(
            "Loading...",
            style: AppTheme.bodyMd.copyWith(color: AppTheme.muted),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isChecking) {
      if (PlatformUtils.isCupertino) {
        return CupertinoPageScaffold(
          backgroundColor: AppTheme.background,
          child: _buildLoadingWidget(),
        );
      }
      return Scaffold(
        backgroundColor: AppTheme.background,
        body: _buildLoadingWidget(),
      );
    }

    if (_isLoggedIn) {
      if (PlatformUtils.isCupertino) {
        return CupertinoHomeScreen(userName: _userName, role: _role);
      }
      return HomeScreen(userName: _userName, role: _role);
    } else {
      if (PlatformUtils.isCupertino) {
        return const CupertinoLoginScreen();
      }
      return const LoginScreen();
    }
  }
}
