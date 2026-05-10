import 'package:flutter/cupertino.dart';
import '../../theme/app_theme.dart';

/// Solid purple gradient page header that replaces [CupertinoNavigationBar].
/// Immune to the iOS 26 "Liquid Glass" transparent nav bar effect.
///
/// Usage — simple back + title:
///   OmsPageHeader(title: "My Page")
///
/// Usage — custom trailing:
///   OmsPageHeader(title: "My Page", trailing: Icon(...))
///
/// Usage — custom leading (e.g. hamburger menu, no back):
///   OmsPageHeader(title: "Dashboard", leading: myMenuButton, showBack: false)
class OmsPageHeader extends StatelessWidget {
  final String title;
  final Widget? subtitle;
  final Widget? trailing;
  final Widget? leading;
  final bool showBack;
  final VoidCallback? onBack;

  const OmsPageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.leading,
    this.showBack = true,
    this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final Widget leftWidget;
    if (leading != null) {
      leftWidget = leading!;
    } else if (showBack) {
      leftWidget = CupertinoButton(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        onPressed: onBack ?? () => Navigator.pop(context),
        child: const Icon(CupertinoIcons.chevron_left,
            color: CupertinoColors.white, size: 22),
      );
    } else {
      leftWidget = const SizedBox(width: 44);
    }

    final Widget rightWidget = trailing ?? const SizedBox(width: 44);

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primaryIndigo, Color(0xFF4F46E5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 8, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              leftWidget,
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        inherit: false,
                        color: CupertinoColors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        decoration: TextDecoration.none,
                        letterSpacing: -0.4,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      subtitle!,
                    ],
                  ],
                ),
              ),
              rightWidget,
            ],
          ),
        ),
      ),
    );
  }
}
