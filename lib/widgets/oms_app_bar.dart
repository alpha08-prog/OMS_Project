import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'oms_back_button.dart';

/// Material [AppBar] styled to match [OmsPageHeader].
///
/// A handful of screens (All Tasks, Forwarded to Me, Meetings, Activity Log,
/// Add Person) are Material-only but reachable from the iOS menu. They used a
/// flat indigo AppBar with a left-aligned title and Material's default `←`
/// arrow, so navigating from a Cupertino screen into one of them visibly
/// changed the bar and the back button. This reproduces the gradient, the
/// centred bold title and the shared [OmsBackButton].
PreferredSizeWidget omsAppBar(
  BuildContext context, {
  required String title,
  List<Widget>? actions,
  PreferredSizeWidget? bottom,
  VoidCallback? onBack,
}) {
  return AppBar(
    // The shared back control replaces Material's arrow; it renders an empty
    // slot when there is nothing to pop.
    automaticallyImplyLeading: false,
    leading: OmsBackButton.isAvailable(context, onPressed: onBack)
        ? OmsBackButton(onPressed: onBack)
        : null,
    leadingWidth: 52,
    centerTitle: true,
    title: Text(
      title,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.bold,
        letterSpacing: -0.4,
      ),
    ),
    backgroundColor: Colors.transparent,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    iconTheme: const IconThemeData(color: Colors.white),
    actionsIconTheme: const IconThemeData(color: Colors.white),
    // Container, not DecoratedBox: a childless DecoratedBox collapses to zero
    // size, so the gradient never painted and the bar rendered white-on-white.
    // A childless Container expands to fill the flexibleSpace instead.
    flexibleSpace: Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primaryIndigo, Color(0xFF4F46E5)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
    ),
    actions: actions,
    bottom: bottom,
  );
}
