import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

/// Cupertino mirror of [DateRangeFilter]. Same API, modal sheet picker.
class CupertinoDateRangeFilter extends StatelessWidget {
  final DateTime? from;
  final DateTime? to;
  final ValueChanged<DateTime?> onFromChanged;
  final ValueChanged<DateTime?> onToChanged;
  final VoidCallback? onClear;
  final Color tint;
  final EdgeInsetsGeometry padding;

  const CupertinoDateRangeFilter({
    super.key,
    required this.from,
    required this.to,
    required this.onFromChanged,
    required this.onToChanged,
    this.onClear,
    this.tint = CupertinoColors.activeBlue,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
  });

  static String _fmt(DateTime d) => DateFormat('dd MMM').format(d);

  Future<void> _pick(BuildContext context, bool isFrom) async {
    DateTime tmp = isFrom ? (from ?? DateTime.now()) : (to ?? DateTime.now());
    final result = await showCupertinoModalPopup<DateTime>(
      context: context,
      builder: (ctx) => Container(
        height: 280,
        color: CupertinoColors.systemBackground.resolveFrom(ctx),
        child: SafeArea(
          top: false,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: const Text('Cancel'),
                  ),
                  Text(isFrom ? 'From' : 'To',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  CupertinoButton(
                    onPressed: () => Navigator.of(ctx).pop(tmp),
                    child: const Text('Done'),
                  ),
                ],
              ),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.date,
                  initialDateTime: tmp,
                  minimumDate: DateTime(2020),
                  maximumDate: DateTime.now().add(const Duration(days: 365)),
                  onDateTimeChanged: (d) => tmp = d,
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (result == null) return;
    if (isFrom) {
      onFromChanged(result);
      if (to != null && result.isAfter(to!)) onToChanged(result);
    } else {
      onToChanged(result);
      if (from != null && result.isBefore(from!)) onFromChanged(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasAny = from != null || to != null;
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Icon(CupertinoIcons.calendar, size: 18, color: tint),
          const SizedBox(width: 6),
          Expanded(
            child: _Pill(
              label: from == null ? 'From' : _fmt(from!),
              active: from != null,
              tint: tint,
              onTap: () => _pick(context, true),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _Pill(
              label: to == null ? 'To' : _fmt(to!),
              active: to != null,
              tint: tint,
              onTap: () => _pick(context, false),
            ),
          ),
          if (hasAny && onClear != null) ...[
            const SizedBox(width: 4),
            CupertinoButton(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              minSize: 32,
              onPressed: onClear,
              child: const Icon(CupertinoIcons.clear_circled_solid, size: 18),
            ),
          ],
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final bool active;
  final Color tint;
  final VoidCallback onTap;

  const _Pill({
    required this.label,
    required this.active,
    required this.tint,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active
              ? tint.withOpacity(0.12)
              : CupertinoColors.systemBackground,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? tint : CupertinoColors.systemGrey4,
            width: active ? 1.2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(CupertinoIcons.calendar_today,
                size: 14,
                color: active ? tint : CupertinoColors.secondaryLabel),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: active ? tint : CupertinoColors.label,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w500,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
