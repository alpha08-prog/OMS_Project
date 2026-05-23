import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/cupertino/cupertino_login_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/home/cupertino/cupertino_home_screen.dart';
import 'services/auth_service.dart';
import 'services/http_service.dart';
import 'services/theme_service.dart';
import 'theme/app_theme.dart';
import 'theme/cupertino_theme.dart';
import 'utils/platform_utils.dart';

// Global theme service instance
final ThemeService themeService = ThemeService();

// Root navigator so non-widget code (HTTP 401 handler) can push routes.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Lock the entire app to portrait so layouts stay consistent across devices
  // and rotation can never break a row/column arrangement.
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // When any backend call returns 401, drop the session and bounce to login.
  HttpService.onUnauthorized = () async {
    await AuthService.logout();
    final navigator = rootNavigatorKey.currentState;
    if (navigator == null) return;
    navigator.pushAndRemoveUntil(
      PlatformUtils.isCupertino
          ? CupertinoPageRoute(builder: (_) => const CupertinoLoginScreen())
          : MaterialPageRoute(builder: (_) => const LoginScreen()),
      (route) => false,
    );
  };
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
    // Android 14+ enforces edge-to-edge: by default the app draws BEHIND the
    // bottom system-navigation bar (3-button / gesture pill area), which
    // looks like content "spilling into" the nav buttons. Painting the system
    // nav bar in a solid app-matching color stops that visual bleed without
    // disabling edge-to-edge entirely.
    final isDark = themeService.isDark;
    final overlayStyle = SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: isDark ? Colors.black : Colors.white,
      systemNavigationBarIconBrightness:
          isDark ? Brightness.light : Brightness.dark,
      systemNavigationBarDividerColor: Colors.transparent,
    );

    // Global SafeArea wrapper: applied at the app root via `builder` so EVERY
    // navigated route gets bottom inset for the Android system nav bar
    // automatically — bottoms of scrollables, custom bottom navs, fixed
    // Submit buttons, etc. all sit ABOVE the 3-button / gesture pill area.
    // `top: false` because AppBars / status bar handle the top themselves.
    Widget wrapInSafeArea(BuildContext _, Widget? child) {
      return SafeArea(
        top: false,
        bottom: true,
        child: child ?? const SizedBox.shrink(),
      );
    }

    final app = PlatformUtils.isCupertino
        ? CupertinoApp(
            title: 'OMS - Office Management',
            debugShowCheckedModeBanner: false,
            navigatorKey: rootNavigatorKey,
            theme: CupertinoAppTheme.themeFor(themeService.isDark),
            home: const AuthCheck(),
            builder: wrapInSafeArea,
          )
        : MaterialApp(
            title: 'OMS - Office Management',
            debugShowCheckedModeBanner: false,
            navigatorKey: rootNavigatorKey,
            theme: AppTheme.lightTheme,
            darkTheme: AppTheme.darkTheme,
            themeMode: themeService.themeMode,
            home: const AuthCheck(),
            builder: wrapInSafeArea,
          );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: app,
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
