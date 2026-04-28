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
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppTheme.foreground,
          ),
          navLargeTitleTextStyle: TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.bold,
            color: AppTheme.foreground,
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
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: CupertinoColors.white,
          ),
          navLargeTitleTextStyle: TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.bold,
            color: CupertinoColors.white,
          ),
        ),
      );

  static CupertinoThemeData themeFor(bool isDark) =>
      isDark ? darkTheme : lightTheme;
}
