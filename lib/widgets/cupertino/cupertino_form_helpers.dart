import 'package:flutter/cupertino.dart';
import '../../theme/app_theme.dart';

/// Helper utilities for Cupertino form elements
class CupertinoFormHelpers {
  /// Shows a CupertinoPicker in a modal popup for dropdown replacement
  static void showPicker({
    required BuildContext context,
    required List<String> items,
    required String currentValue,
    required ValueChanged<String> onSelected,
    String? title,
  }) {
    int initialIndex = items.indexOf(currentValue);
    if (initialIndex < 0) initialIndex = 0;
    String selectedValue = items[initialIndex];

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        height: 300,
        color: CupertinoColors.systemBackground.resolveFrom(ctx),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    child: const Text('Cancel'),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                  if (title != null)
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    child: const Text('Done'),
                    onPressed: () {
                      onSelected(selectedValue);
                      Navigator.pop(ctx);
                    },
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: CupertinoPicker(
                scrollController:
                    FixedExtentScrollController(initialItem: initialIndex),
                itemExtent: 36,
                onSelectedItemChanged: (index) {
                  selectedValue = items[index];
                },
                children: items
                    .map((item) => Center(
                          child: Text(item, style: const TextStyle(fontSize: 16)),
                        ))
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Shows a date picker in a modal popup
  static void showDatePicker({
    required BuildContext context,
    required DateTime initialDate,
    required ValueChanged<DateTime> onDateSelected,
    DateTime? minimumDate,
    DateTime? maximumDate,
  }) {
    DateTime selectedDate = initialDate;

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        height: 300,
        color: CupertinoColors.systemBackground.resolveFrom(ctx),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    child: const Text('Cancel'),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    child: const Text('Done'),
                    onPressed: () {
                      onDateSelected(selectedDate);
                      Navigator.pop(ctx);
                    },
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: CupertinoDatePicker(
                initialDateTime: initialDate,
                minimumDate: minimumDate,
                maximumDate: maximumDate,
                mode: CupertinoDatePickerMode.date,
                onDateTimeChanged: (date) => selectedDate = date,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Styled CupertinoTextField matching app design
  static Widget textField({
    required TextEditingController controller,
    required String placeholder,
    IconData? prefixIcon,
    Widget? suffix,
    bool obscureText = false,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
    int maxLines = 1,
  }) {
    return CupertinoTextField(
      controller: controller,
      placeholder: placeholder,
      obscureText: obscureText,
      keyboardType: keyboardType,
      maxLines: maxLines,
      prefix: prefixIcon != null
          ? Padding(
              padding: const EdgeInsets.only(left: 12),
              child: Icon(prefixIcon, color: AppTheme.muted, size: 20),
            )
          : null,
      suffix: suffix != null
          ? Padding(
              padding: const EdgeInsets.only(right: 8),
              child: suffix,
            )
          : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppTheme.backgroundAlt,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: AppTheme.border),
      ),
      style: const TextStyle(fontSize: 15),
    );
  }
}

/// Divider widget for Cupertino contexts (since there's no built-in Cupertino Divider)
class Divider extends StatelessWidget {
  final double height;
  final Color? color;

  const Divider({super.key, this.height = 1, this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      color: color ?? AppTheme.border,
    );
  }
}
