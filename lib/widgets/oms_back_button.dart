import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';

/// The app's single back control.
///
/// Shared by [OmsPageHeader] (Cupertino screens) and [omsAppBar] (the handful
/// of Material-only screens that are reachable from the iOS menu) so the back
/// affordance is identical everywhere. A bare chevron on the saturated purple
/// bar read as part of the title rather than a control, hence the translucent
/// tile behind it.
///
/// Renders nothing when there is nowhere to go back to — several screens are
/// used both as a pushed route AND as a bottom-tab root, and popping a tab root
/// empties its navigator and leaves a blank screen.
class OmsBackButton extends StatelessWidget {
  final VoidCallback? onPressed;

  const OmsBackButton({super.key, this.onPressed});

  /// Whether a back control would render in this context.
  static bool isAvailable(BuildContext context, {VoidCallback? onPressed}) =>
      onPressed != null || Navigator.of(context).canPop();

  @override
  Widget build(BuildContext context) {
    if (!isAvailable(context, onPressed: onPressed)) {
      return const SizedBox(width: 44);
    }
    return CupertinoButton(
      padding: EdgeInsets.zero,
      minimumSize: const Size(44, 44),
      onPressed: onPressed ?? () => Navigator.pop(context),
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: CupertinoColors.white.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(10),
        ),
        alignment: Alignment.center,
        child: const Icon(CupertinoIcons.chevron_left,
            color: CupertinoColors.white, size: 20),
      ),
    );
  }
}
