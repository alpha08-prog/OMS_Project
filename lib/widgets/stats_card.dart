import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// StatsCard variants matching web frontend design
enum StatsCardVariant {
  defaultCard,
  primary,
  success,
  warning,
  destructive,
}

/// A stats card widget matching the web frontend design
/// Usage:
/// ```dart
/// StatsCard(
///   title: "Total Grievances",
///   value: "156",
///   icon: Icons.description,
///   variant: StatsCardVariant.primary,
/// )
/// ```
class StatsCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final StatsCardVariant variant;
  final double? trend;
  final bool trendPositive;
  final VoidCallback? onTap;

  const StatsCard({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    this.variant = StatsCardVariant.defaultCard,
    this.trend,
    this.trendPositive = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isColored = variant != StatsCardVariant.defaultCard;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: isColored ? _getGradient() : null,
          color: isColored ? null : AppTheme.surface,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          border: isColored ? null : Border.all(color: AppTheme.border),
          boxShadow: isColored
              ? AppTheme.shadowColored(_getPrimaryColor())
              : AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            // Left content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: isColored
                          ? Colors.white.withOpacity(0.9)
                          : AppTheme.muted,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: isColored ? Colors.white : AppTheme.foreground,
                      height: 1,
                    ),
                  ),
                  if (trend != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          trendPositive
                              ? Icons.trending_up
                              : Icons.trending_down,
                          size: 14,
                          color: isColored
                              ? Colors.white.withOpacity(0.9)
                              : (trendPositive
                                  ? AppTheme.successGreen
                                  : AppTheme.destructiveRed),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          "${trend!.abs()}% vs last week",
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: isColored
                                ? Colors.white.withOpacity(0.85)
                                : (trendPositive
                                    ? AppTheme.successGreen
                                    : AppTheme.destructiveRed),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),

            // Right icon
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isColored
                    ? Colors.white.withOpacity(0.2)
                    : AppTheme.primaryIndigo.withOpacity(0.1),
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
              ),
              child: Icon(
                icon,
                size: 24,
                color: isColored ? Colors.white : AppTheme.primaryIndigo,
              ),
            ),
          ],
        ),
      ),
    );
  }

  LinearGradient _getGradient() {
    switch (variant) {
      case StatsCardVariant.primary:
        return AppTheme.primaryGradient;
      case StatsCardVariant.success:
        return AppTheme.successGradient;
      case StatsCardVariant.warning:
        return AppTheme.warningGradient;
      case StatsCardVariant.destructive:
        return AppTheme.destructiveGradient;
      default:
        return AppTheme.primaryGradient;
    }
  }

  Color _getPrimaryColor() {
    switch (variant) {
      case StatsCardVariant.primary:
        return AppTheme.primaryIndigo;
      case StatsCardVariant.success:
        return AppTheme.successGreen;
      case StatsCardVariant.warning:
        return AppTheme.saffron;
      case StatsCardVariant.destructive:
        return AppTheme.destructiveRed;
      default:
        return AppTheme.primaryIndigo;
    }
  }
}

/// A compact stats item for inline display
class StatsItem extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;
  final Color? iconColor;

  const StatsItem({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(
            icon,
            size: 20,
            color: iconColor ?? Colors.white70,
          ),
          const SizedBox(height: 4),
        ],
        Text(
          value,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: Colors.white.withOpacity(0.7),
          ),
        ),
      ],
    );
  }
}
