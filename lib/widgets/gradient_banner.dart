import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A gradient banner widget matching web frontend's welcome banner
/// Usage:
/// ```dart
/// GradientBanner(
///   title: "Welcome, Admin",
///   subtitle: "Super Admin Dashboard - Overview of all operations",
/// )
/// ```
class GradientBanner extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Gradient? gradient;
  final EdgeInsets? padding;
  final double borderRadius;

  const GradientBanner({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.gradient,
    this.padding,
    this.borderRadius = AppTheme.radiusLg,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding ?? const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: gradient ?? AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white.withOpacity(0.85),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// A stats banner that displays multiple stats in a row
/// Usage:
/// ```dart
/// StatsBanner(
///   stats: [
///     BannerStat(label: "Total", value: "156", icon: Icons.folder),
///     BannerStat(label: "Pending", value: "24", icon: Icons.pending),
///   ],
/// )
/// ```
class StatsBanner extends StatelessWidget {
  final List<BannerStat> stats;
  final Gradient? gradient;
  final Widget? action;

  const StatsBanner({
    super.key,
    required this.stats,
    this.gradient,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: gradient ?? AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: stats.map((stat) => _buildStatItem(stat)).toList(),
          ),
          if (action != null) ...[
            const SizedBox(height: 16),
            action!,
          ],
        ],
      ),
    );
  }

  Widget _buildStatItem(BannerStat stat) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (stat.icon != null)
          Icon(
            stat.icon,
            size: 22,
            color: stat.iconColor ?? Colors.white70,
          ),
        if (stat.icon != null) const SizedBox(height: 4),
        Text(
          stat.value,
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          stat.label,
          style: TextStyle(
            fontSize: 11,
            color: Colors.white.withOpacity(0.7),
          ),
        ),
      ],
    );
  }
}

class BannerStat {
  final String label;
  final String value;
  final IconData? icon;
  final Color? iconColor;

  const BannerStat({
    required this.label,
    required this.value,
    this.icon,
    this.iconColor,
  });
}

/// A section header with optional action button
class SectionHeader extends StatelessWidget {
  final String title;
  final IconData? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? trailing;

  const SectionHeader({
    super.key,
    required this.title,
    this.icon,
    this.actionLabel,
    this.onAction,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18, color: AppTheme.primaryIndigo),
            const SizedBox(width: 8),
          ],
          Text(
            title,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.primaryIndigo,
              letterSpacing: 0.3,
            ),
          ),
          const Spacer(),
          if (trailing != null)
            trailing!
          else if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.primaryIndigo,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                minimumSize: const Size(0, 32),
              ),
              child: Text(
                actionLabel!,
                style: const TextStyle(fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
}
