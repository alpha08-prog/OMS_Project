import 'package:flutter/cupertino.dart';
import '../../theme/app_theme.dart';

/// Cupertino version of StyledCard — uses GestureDetector instead of InkWell
class CupertinoStyledCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final EdgeInsets? margin;
  final Color? backgroundColor;
  final Gradient? gradient;
  final double borderRadius;
  final Border? border;
  final VoidCallback? onTap;

  const CupertinoStyledCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.backgroundColor,
    this.gradient,
    this.borderRadius = AppTheme.radiusLg,
    this.border,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Widget card = Container(
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
      return GestureDetector(
        onTap: onTap,
        child: card,
      );
    }

    return card;
  }
}
