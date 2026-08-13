import 'package:flutter/cupertino.dart';
import 'package:flutter/widgets.dart';

import '../theme/app_theme.dart';

/// Branded loading indicator: the app icon with a gentle fade, over a standard
/// activity spinner.
///
/// The icon is deliberately NOT rotated or spun — the app icon is a portrait
/// photograph, and spinning a face reads as broken rather than busy. The
/// motion cue is carried by the spinner underneath; the logo only breathes.
///
/// Built from `package:flutter/widgets.dart` primitives so it renders
/// identically under `MaterialApp` and `CupertinoApp`.
class OmsLoader extends StatefulWidget {
  /// Edge length of the logo square.
  final double size;

  /// Optional line shown beneath the spinner (e.g. "Loading grievances…").
  final String? message;

  const OmsLoader({super.key, this.size = 72, this.message});

  @override
  State<OmsLoader> createState() => _OmsLoaderState();
}

class _OmsLoaderState extends State<OmsLoader>
    with SingleTickerProviderStateMixin {
  // Created in initState, NOT as a `late final` field initializer. In a box too
  // short for the logo, build() returns the bare spinner without ever touching
  // the animation — so a lazy field stays uninitialised until dispose() reads
  // it, and initialising it there calls createTicker() on an already
  // deactivated element. That throws before dispose() can run, stranding a
  // repeating controller that then pins the whole app at 60fps forever.
  late final AnimationController _controller;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _fade = Tween<double>(begin: 0.55, end: 1.0)
        .animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Some of these loaders sit in short card sections rather than a full
        // page. Where the logo + spinner + label would not fit, fall back to a
        // plain spinner instead of overflowing the box.
        final needed = widget.size + 20 + 22 + (widget.message != null ? 32 : 0);
        if (constraints.hasBoundedHeight && constraints.maxHeight < needed) {
          return const Center(child: CupertinoActivityIndicator());
        }
        return _buildFull();
      },
    );
  }

  Widget _buildFull() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: _fade,
            child: Container(
              width: widget.size,
              height: widget.size,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(widget.size * 0.24),
                boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
              ),
              clipBehavior: Clip.antiAlias,
              child: Image.asset(
                'assets/icon/icon.png',
                fit: BoxFit.cover,
                // If the asset ever goes missing the loader must still render
                // rather than throwing inside a loading state.
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const CupertinoActivityIndicator(radius: 11),
          if (widget.message != null) ...[
            const SizedBox(height: 12),
            Text(
              widget.message!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                inherit: false,
                fontSize: 14,
                color: AppTheme.muted,
                decoration: TextDecoration.none,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
