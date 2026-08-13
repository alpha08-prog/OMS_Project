import 'package:flutter/cupertino.dart';
import 'app_theme.dart';

class CupertinoAppTheme {
  CupertinoAppTheme._();

  static CupertinoThemeData get lightTheme => const CupertinoThemeData(
        brightness: Brightness.light,
        primaryColor: AppTheme.primaryIndigo,
        scaffoldBackgroundColor: AppTheme.background,
        barBackgroundColor: Color(0xF0F8FAFC),
        textTheme: CupertinoTextThemeData(
          primaryColor: AppTheme.primaryIndigo,
          navTitleTextStyle: TextStyle(
            inherit: false,
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppTheme.foreground,
            decoration: TextDecoration.none,
            letterSpacing: -0.4,
          ),
          navLargeTitleTextStyle: TextStyle(
            inherit: false,
            fontSize: 34,
            fontWeight: FontWeight.bold,
            color: AppTheme.foreground,
            decoration: TextDecoration.none,
            letterSpacing: -0.4,
          ),
        ),
      );

  static CupertinoThemeData get darkTheme => const CupertinoThemeData(
        brightness: Brightness.dark,
        primaryColor: AppTheme.primaryIndigoLight,
        scaffoldBackgroundColor: Color(0xFF121212),
        barBackgroundColor: Color(0xF01E1E2E),
        textTheme: CupertinoTextThemeData(
          primaryColor: AppTheme.primaryIndigoLight,
          navTitleTextStyle: TextStyle(
            inherit: false,
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: CupertinoColors.white,
            decoration: TextDecoration.none,
            letterSpacing: -0.4,
          ),
          navLargeTitleTextStyle: TextStyle(
            inherit: false,
            fontSize: 34,
            fontWeight: FontWeight.bold,
            color: CupertinoColors.white,
            decoration: TextDecoration.none,
            letterSpacing: -0.4,
          ),
        ),
      );

  static CupertinoThemeData themeFor(bool isDark) =>
      isDark ? darkTheme : lightTheme;
}
