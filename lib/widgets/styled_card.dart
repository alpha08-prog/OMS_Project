import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A styled card widget with consistent design
class StyledCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final EdgeInsets? margin;
  final Color? backgroundColor;
  final Gradient? gradient;
  final double borderRadius;
  final Border? border;
  final VoidCallback? onTap;
  final bool enableHover;

  const StyledCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.backgroundColor,
    this.gradient,
    this.borderRadius = AppTheme.radiusLg,
    this.border,
    this.onTap,
    this.enableHover = true,
  });

  @override
  Widget build(BuildContext context) {
    Widget card = AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      padding: padding ?? const EdgeInsets.all(16),
      margin: margin,
      decoration: BoxDecoration(
        color: gradient == null ? (backgroundColor ?? AppTheme.surface) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(borderRadius),
        border: border,
        boxShadow: AppTheme.shadowSm,
      ),
      child: child,
    );

    if (onTap != null) {
      return InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(borderRadius),
        child: card,
      );
    }

    return card;
  }
}

/// A list item card matching web frontend design
class ListItemCard extends StatelessWidget {
  final Widget leading;
  final String title;
  final String? subtitle;
  final String? description;
  final Widget? trailing;
  final Widget? badge;
  final Widget? footer;
  final VoidCallback? onTap;
  final Color? backgroundColor;
  final Border? border;

  const ListItemCard({
    super.key,
    required this.leading,
    required this.title,
    this.subtitle,
    this.description,
    this.trailing,
    this.badge,
    this.footer,
    this.onTap,
    this.backgroundColor,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    return StyledCard(
      onTap: onTap,
      backgroundColor: backgroundColor,
      border: border,
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              leading,
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            style: AppTheme.headingSm,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (badge != null) badge!,
                      ],
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle!,
                        style: AppTheme.bodyMd.copyWith(color: AppTheme.muted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (description != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        description!,
                        style: AppTheme.bodySm,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: 12),
                trailing!,
              ],
            ],
          ),
          if (footer != null) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            footer!,
          ],
        ],
      ),
    );
  }
}

/// Icon container matching web frontend design
class IconContainer extends StatelessWidget {
  final IconData icon;
  final Color? backgroundColor;
  final Color? iconColor;
  final double size;
  final double iconSize;
  final double borderRadius;

  const IconContainer({
    super.key,
    required this.icon,
    this.backgroundColor,
    this.iconColor,
    this.size = 48,
    this.iconSize = 22,
    this.borderRadius = AppTheme.radiusMd,
  });

  /// Primary indigo icon container
  factory IconContainer.primary({
    required IconData icon,
    double size = 48,
    double iconSize = 22,
  }) {
    return IconContainer(
      icon: icon,
      backgroundColor: AppTheme.primaryIndigo.withOpacity(0.1),
      iconColor: AppTheme.primaryIndigo,
      size: size,
      iconSize: iconSize,
    );
  }

  /// Success green icon container
  factory IconContainer.success({
    required IconData icon,
    double size = 48,
    double iconSize = 22,
  }) {
    return IconContainer(
      icon: icon,
      backgroundColor: AppTheme.successGreen50,
      iconColor: AppTheme.successGreen,
      size: size,
      iconSize: iconSize,
    );
  }

  /// Warning amber icon container
  factory IconContainer.warning({
    required IconData icon,
    double size = 48,
    double iconSize = 22,
  }) {
    return IconContainer(
      icon: icon,
      backgroundColor: AppTheme.warningAmber50,
      iconColor: AppTheme.saffron,
      size: size,
      iconSize: iconSize,
    );
  }

  /// Destructive red icon container
  factory IconContainer.destructive({
    required IconData icon,
    double size = 48,
    double iconSize = 22,
  }) {
    return IconContainer(
      icon: icon,
      backgroundColor: AppTheme.destructiveRed50,
      iconColor: AppTheme.destructiveRed,
      size: size,
      iconSize: iconSize,
    );
  }

  /// Pink birthday icon container
  factory IconContainer.pink({
    required IconData icon,
    double size = 48,
    double iconSize = 22,
  }) {
    return IconContainer(
      icon: icon,
      backgroundColor: AppTheme.birthdayPink50,
      iconColor: AppTheme.birthdayPink,
      size: size,
      iconSize: iconSize,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: backgroundColor ?? AppTheme.primaryIndigo.withOpacity(0.1),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: Center(
        child: Icon(
          icon,
          size: iconSize,
          color: iconColor ?? AppTheme.primaryIndigo,
        ),
      ),
    );
  }
}

/// Status badge matching web frontend design
class StatusBadge extends StatelessWidget {
  final String label;
  final Color? backgroundColor;
  final Color? textColor;
  final IconData? icon;

  const StatusBadge({
    super.key,
    required this.label,
    this.backgroundColor,
    this.textColor,
    this.icon,
  });

  /// Pending/Warning status
  factory StatusBadge.pending({String label = "Pending"}) {
    return StatusBadge(
      label: label,
      backgroundColor: AppTheme.warningAmber50,
      textColor: AppTheme.saffronDark,
    );
  }

  /// Success/Approved status
  factory StatusBadge.success({String label = "Approved"}) {
    return StatusBadge(
      label: label,
      backgroundColor: AppTheme.successGreen50,
      textColor: AppTheme.successGreen,
    );
  }

  /// Destructive/Rejected status
  factory StatusBadge.destructive({String label = "Rejected"}) {
    return StatusBadge(
      label: label,
      backgroundColor: AppTheme.destructiveRed50,
      textColor: AppTheme.destructiveRed,
    );
  }

  /// Primary/Info status
  factory StatusBadge.primary({String label = "Active"}) {
    return StatusBadge(
      label: label,
      backgroundColor: AppTheme.primaryIndigo50,
      textColor: AppTheme.primaryIndigo,
    );
  }

  /// Muted/Default status
  factory StatusBadge.muted({String label = "Closed"}) {
    return StatusBadge(
      label: label,
      backgroundColor: AppTheme.backgroundAlt,
      textColor: AppTheme.muted,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: backgroundColor ?? AppTheme.backgroundAlt,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: textColor),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: textColor ?? AppTheme.muted,
            ),
          ),
        ],
      ),
    );
  }
}

/// Filter chip row matching web frontend design
class FilterChipRow extends StatelessWidget {
  final List<String> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final Color? selectedColor;

  const FilterChipRow({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.selectedColor,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(30),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: options.map((option) {
          final isSelected = option == selected;
          return Expanded(
            child: GestureDetector(
              onTap: () => onSelected(option),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                height: 38,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isSelected
                      ? (selectedColor ?? AppTheme.primaryIndigo)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Text(
                  option,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isSelected ? Colors.white : AppTheme.foreground,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

/// Empty state widget
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 64,
              color: AppTheme.border,
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: AppTheme.headingSm.copyWith(color: AppTheme.muted),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle!,
                style: AppTheme.bodySm,
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
