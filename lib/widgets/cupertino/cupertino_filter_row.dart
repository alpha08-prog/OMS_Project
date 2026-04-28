import 'package:flutter/cupertino.dart';
import '../../theme/app_theme.dart';

/// Cupertino version of FilterChipRow using CupertinoSlidingSegmentedControl
class CupertinoFilterRow extends StatelessWidget {
  final List<String> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final Color? selectedColor;

  const CupertinoFilterRow({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.selectedColor,
  });

  @override
  Widget build(BuildContext context) {
    final Map<String, Widget> children = {};
    for (final option in options) {
      children[option] = Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Text(
          option,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: option == selected
                ? CupertinoColors.white
                : AppTheme.foreground,
          ),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: CupertinoSlidingSegmentedControl<String>(
        groupValue: selected,
        children: children,
        thumbColor: selectedColor ?? AppTheme.primaryIndigo,
        backgroundColor: AppTheme.backgroundAlt,
        onValueChanged: (value) {
          if (value != null) onSelected(value);
        },
      ),
    );
  }
}
