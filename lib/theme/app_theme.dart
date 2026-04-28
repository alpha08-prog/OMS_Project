import 'package:flutter/material.dart';

/// OMS App Theme - Government UI Design System
/// Inspired by frontend_web design patterns
class AppTheme {
  AppTheme._();

  // ============================================
  // COLOR PALETTE - Government UI Theme
  // ============================================

  // Primary - Indigo (Authority/Professional)
  static const Color primaryIndigo = Color(0xFF4338CA);
  static const Color primaryIndigoLight = Color(0xFF6366F1);
  static const Color primaryIndigoDark = Color(0xFF3730A3);
  static const Color primaryIndigo50 = Color(0xFFEEF2FF);
  static const Color primaryIndigo100 = Color(0xFFE0E7FF);
  static const Color primaryIndigo900 = Color(0xFF1E1B4B);

  // Secondary - Saffron/Amber (Indian Government Theme)
  static const Color saffron = Color(0xFFF59E0B);
  static const Color saffronLight = Color(0xFFFBBF24);
  static const Color saffronSoft = Color(0xFFFEF3C7);
  static const Color saffronDark = Color(0xFFD97706);

  // Success - Emerald Green
  static const Color successGreen = Color(0xFF16A34A);
  static const Color successGreenLight = Color(0xFF10B981);
  static const Color successGreen50 = Color(0xFFECFDF5);
  static const Color successGreen100 = Color(0xFFD1FAE5);

  // Warning - Amber
  static const Color warningAmber = Color(0xFFF59E0B);
  static const Color warningAmber50 = Color(0xFFFFFBEB);
  static const Color warningAmber100 = Color(0xFFFEF3C7);

  // Destructive - Red
  static const Color destructiveRed = Color(0xFFEF4444);
  static const Color destructiveRed50 = Color(0xFFFEF2F2);
  static const Color destructiveRed100 = Color(0xFFFEE2E2);

  // Pink (Birthday Theme)
  static const Color birthdayPink = Color(0xFFEC4899);
  static const Color birthdayPink50 = Color(0xFFFDF2F8);
  static const Color birthdayPink100 = Color(0xFFFCE7F3);

  // Neutrals
  static const Color background = Color(0xFFF8FAFC);
  static const Color backgroundAlt = Color(0xFFF1F5F9);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE2E8F0);
  static const Color muted = Color(0xFF64748B);
  static const Color mutedForeground = Color(0xFF94A3B8);
  static const Color foreground = Color(0xFF0F172A);

  // ============================================
  // GRADIENTS
  // ============================================

  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryIndigo, primaryIndigoLight],
  );

  static const LinearGradient saffronGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [saffron, saffronLight],
  );

  static const LinearGradient successGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF059669), successGreenLight],
  );

  static const LinearGradient warningGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [saffron, Color(0xFFFBBF24)],
  );

  static const LinearGradient destructiveGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFDC2626), destructiveRed],
  );

  static const LinearGradient pinkGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFDB2777), birthdayPink],
  );

  static const LinearGradient backgroundGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF8FAFC), primaryIndigo50, saffronSoft],
  );

  // ============================================
  // SPACING & RADIUS
  // ============================================

  static const double radiusSm = 8.0;
  static const double radiusMd = 12.0;
  static const double radiusLg = 16.0;
  static const double radiusXl = 20.0;
  static const double radius2xl = 24.0;

  static const double spacingXs = 4.0;
  static const double spacingSm = 8.0;
  static const double spacingMd = 12.0;
  static const double spacingLg = 16.0;
  static const double spacingXl = 20.0;
  static const double spacing2xl = 24.0;
  static const double spacing3xl = 32.0;

  // ============================================
  // SHADOWS
  // ============================================

  static List<BoxShadow> get shadowSm => [
        BoxShadow(
          color: Colors.black.withOpacity(0.05),
          blurRadius: 4,
          offset: const Offset(0, 1),
        ),
      ];

  static List<BoxShadow> get shadowMd => [
        BoxShadow(
          color: Colors.black.withOpacity(0.08),
          blurRadius: 8,
          offset: const Offset(0, 4),
        ),
      ];

  static List<BoxShadow> get shadowLg => [
        BoxShadow(
          color: Colors.black.withOpacity(0.1),
          blurRadius: 16,
          offset: const Offset(0, 8),
        ),
      ];

  static List<BoxShadow> shadowColored(Color color) => [
        BoxShadow(
          color: color.withOpacity(0.3),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ];

  // ============================================
  // TEXT STYLES
  // ============================================

  static const TextStyle headingXl = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: foreground,
    height: 1.2,
  );

  static const TextStyle headingLg = TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.bold,
    color: foreground,
    height: 1.2,
  );

  static const TextStyle headingMd = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w600,
    color: foreground,
    height: 1.3,
  );

  static const TextStyle headingSm = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: foreground,
    height: 1.4,
  );

  static const TextStyle bodyLg = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.normal,
    color: foreground,
    height: 1.5,
  );

  static const TextStyle bodyMd = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.normal,
    color: foreground,
    height: 1.5,
  );

  static const TextStyle bodySm = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.normal,
    color: muted,
    height: 1.4,
  );

  static const TextStyle labelLg = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: foreground,
    height: 1.4,
  );

  static const TextStyle labelMd = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: muted,
    height: 1.4,
  );

  static const TextStyle labelSm = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w500,
    color: mutedForeground,
    height: 1.4,
    letterSpacing: 0.5,
  );

  // ============================================
  // DECORATIONS
  // ============================================

  static BoxDecoration cardDecoration({
    Color? color,
    double radius = radiusLg,
    List<BoxShadow>? shadow,
    Border? border,
  }) {
    return BoxDecoration(
      color: color ?? surface,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: shadow ?? shadowSm,
      border: border,
    );
  }

  static BoxDecoration gradientCardDecoration({
    required Gradient gradient,
    double radius = radiusLg,
    List<BoxShadow>? shadow,
  }) {
    return BoxDecoration(
      gradient: gradient,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: shadow ?? shadowMd,
    );
  }

  static BoxDecoration inputDecoration({
    Color? fillColor,
    Color? borderColor,
    double radius = radiusMd,
  }) {
    return BoxDecoration(
      color: fillColor ?? backgroundAlt,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: borderColor ?? border),
    );
  }

  // ============================================
  // INPUT DECORATION
  // ============================================

  static InputDecoration inputFieldDecoration({
    required String label,
    String? hint,
    IconData? prefixIcon,
    Widget? suffix,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: prefixIcon != null
          ? Icon(prefixIcon, color: muted, size: 20)
          : null,
      suffix: suffix,
      filled: true,
      fillColor: backgroundAlt,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: const BorderSide(color: primaryIndigo, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusMd),
        borderSide: const BorderSide(color: destructiveRed),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: labelMd,
      hintStyle: bodySm.copyWith(color: mutedForeground),
    );
  }

  // ============================================
  // BUTTON STYLES
  // ============================================

  static ButtonStyle primaryButton({double radius = radiusMd}) {
    return ElevatedButton.styleFrom(
      backgroundColor: primaryIndigo,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
      ),
      elevation: 0,
    );
  }

  static ButtonStyle successButton({double radius = radiusMd}) {
    return ElevatedButton.styleFrom(
      backgroundColor: successGreen,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
      ),
      elevation: 0,
    );
  }

  static ButtonStyle warningButton({double radius = radiusMd}) {
    return ElevatedButton.styleFrom(
      backgroundColor: saffron,
      foregroundColor: Colors.black,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
      ),
      elevation: 0,
    );
  }

  static ButtonStyle destructiveButton({double radius = radiusMd}) {
    return ElevatedButton.styleFrom(
      backgroundColor: destructiveRed,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
      ),
      elevation: 0,
    );
  }

  static ButtonStyle outlineButton({
    Color? borderColor,
    Color? foregroundColor,
    double radius = radiusMd,
  }) {
    return OutlinedButton.styleFrom(
      foregroundColor: foregroundColor ?? primaryIndigo,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radius),
      ),
      side: BorderSide(color: borderColor ?? primaryIndigo),
    );
  }

  // ============================================
  // THEME DATA
  // ============================================

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: primaryIndigo,
      scaffoldBackgroundColor: const Color(0xFF121212),
      colorScheme: const ColorScheme.dark(
        primary: primaryIndigoLight,
        primaryContainer: Color(0xFF1E1B4B),
        secondary: saffron,
        secondaryContainer: Color(0xFF3D2800),
        surface: Color(0xFF1E1E1E),
        error: destructiveRed,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: Colors.white,
        onError: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF1E1E2E),
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: primaryButton(),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: outlineButton(),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF2A2A2A),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: primaryIndigoLight,
        foregroundColor: Colors.white,
        elevation: 4,
      ),
      dividerTheme: const DividerThemeData(
        color: Color(0xFF333333),
        thickness: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: const Color(0xFF2A2A2A),
        selectedColor: primaryIndigo,
        labelStyle: labelMd.copyWith(color: Colors.white70),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSm),
        ),
      ),
    );
  }

  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: primaryIndigo,
      scaffoldBackgroundColor: background,
      colorScheme: const ColorScheme.light(
        primary: primaryIndigo,
        primaryContainer: primaryIndigo50,
        secondary: saffron,
        secondaryContainer: saffronSoft,
        surface: surface,
        error: destructiveRed,
        onPrimary: Colors.white,
        onSecondary: Colors.black,
        onSurface: foreground,
        onError: Colors.white,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: primaryIndigo,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
      // cardTheme: CardTheme(
      //   color: surface,
      //   elevation: 0,
      //   shape: RoundedRectangleBorder(
      //     borderRadius: BorderRadius.circular(radiusLg),
      //   ),
      // ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: primaryButton(),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: outlineButton(),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: backgroundAlt,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMd),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      // tabBarTheme: const TabBarTheme(
      //   labelColor: Colors.white,
      //   unselectedLabelColor: Colors.white70,
      //   indicatorColor: Colors.white,
      //   indicatorSize: TabBarIndicatorSize.tab,
      //   labelStyle: TextStyle(fontWeight: FontWeight.w600),
      // ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: primaryIndigo,
        foregroundColor: Colors.white,
        elevation: 4,
      ),
      dividerTheme: const DividerThemeData(
        color: border,
        thickness: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: backgroundAlt,
        selectedColor: primaryIndigo50,
        labelStyle: labelMd,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSm),
        ),
      ),
    );
  }
}

// ============================================
// WIDGET EXTENSIONS
// ============================================

extension WidgetExtensions on Widget {
  /// Wrap widget with a card decoration
  Widget withCard({
    EdgeInsets? padding,
    EdgeInsets? margin,
    Color? color,
    double radius = AppTheme.radiusLg,
  }) {
    return Container(
      padding: padding,
      margin: margin,
      decoration: AppTheme.cardDecoration(color: color, radius: radius),
      child: this,
    );
  }

  /// Wrap widget with a gradient card
  Widget withGradientCard({
    required Gradient gradient,
    EdgeInsets? padding,
    EdgeInsets? margin,
    double radius = AppTheme.radiusLg,
  }) {
    return Container(
      padding: padding,
      margin: margin,
      decoration: AppTheme.gradientCardDecoration(
        gradient: gradient,
        radius: radius,
      ),
      child: this,
    );
  }
}
