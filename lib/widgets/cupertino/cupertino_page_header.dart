import 'package:flutter/cupertino.dart';
import '../../theme/app_theme.dart';
import '../oms_back_button.dart';

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

/// Height of the header's action row. 44 matches the iOS tap-target/nav-bar
/// convention and the height of the CupertinoButtons in the side slots.
const double _barHeight = 44;

/// Taller variant used when a [OmsPageHeader.subtitle] line is present.
const double _barHeightWithSubtitle = 64;

class OmsPageHeader extends StatelessWidget {
  final String title;
  final Widget? subtitle;
  final Widget? trailing;
  final Widget? leading;
  final bool showBack;
  final VoidCallback? onBack;
  final List<Color>? gradientColors;

  const OmsPageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.leading,
    this.showBack = true,
    this.onBack,
    this.gradientColors,
  });

  @override
  Widget build(BuildContext context) {
    // Only offer "back" when there is somewhere to go back to. Several of these
    // pages are used both as a pushed route AND as the root of a bottom-tab
    // navigator; popping a root route empties the navigator and leaves a blank
    // screen, so the chevron is hidden unless a custom `onBack` is supplied.
    final bool canGoBack =
        showBack && (onBack != null || Navigator.of(context).canPop());

    final Widget leftWidget;
    if (leading != null) {
      leftWidget = leading!;
    } else if (canGoBack) {
      // Shared with the Material-only screens' app bar so the back affordance
      // is identical across the whole app.
      leftWidget = OmsBackButton(onPressed: onBack);
    } else {
      leftWidget = const SizedBox(width: 44);
    }

    final Widget rightWidget = trailing ?? const SizedBox(width: 44);

    final Widget middle = Column(
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
    );

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gradientColors ??
              const [AppTheme.primaryIndigo, Color(0xFF4F46E5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          // Symmetric horizontal padding: with left 4 / right 8 the content box
          // centre sat 2pt left of the bar centre, so the title was never quite
          // centred even once the side slots were balanced.
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 10),
          // The title is centred against the FULL header width rather than the
          // space left over between leading and trailing. In a plain Row a
          // trailing group of 2-4 action icons is far wider than the 44pt
          // leading slot, which visibly shoved every title off-centre.
          //
          // NavigationToolbar does the right thing here: it centres the middle
          // when it fits and otherwise clamps it beside the actions instead of
          // letting the two overlap. It needs a bounded height though — this
          // header sits in a Column with unbounded height and the toolbar
          // tries to fill its parent — so the bar is given an explicit height,
          // which a navigation bar should have anyway. With a subtitle the row
          // grows to fit the extra line.
          child: SizedBox(
            height: subtitle == null ? _barHeight : _barHeightWithSubtitle,
            child: NavigationToolbar(
              leading: leftWidget,
              middle: middle,
              trailing: rightWidget,
              centerMiddle: true,
              middleSpacing: 8,
            ),
          ),
        ),
      ),
    );
  }
}
