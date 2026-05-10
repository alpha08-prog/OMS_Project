import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// A reusable from-to date range filter row.
///
/// Used on every list screen that supports date-bounded filtering. Renders
/// two pill-style date pickers + an optional clear button. Caller owns the
/// state; this widget is purely presentational.
///
/// Pass a [tint] to match the host screen's accent color.
class DateRangeFilter extends StatelessWidget {
  final DateTime? from;
  final DateTime? to;
  final ValueChanged<DateTime?> onFromChanged;
  final ValueChanged<DateTime?> onToChanged;
  final VoidCallback? onClear;
  final Color tint;
  final EdgeInsetsGeometry padding;
  final bool showLabel;

  const DateRangeFilter({
    super.key,
    required this.from,
    required this.to,
    required this.onFromChanged,
    required this.onToChanged,
    this.onClear,
    this.tint = const Color(0xFF92400E),
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    this.showLabel = true,
  });

  static String _fmt(DateTime d) => DateFormat('dd MMM').format(d);

  Future<void> _pick(BuildContext context, bool isFrom) async {
    final initial = isFrom ? (from ?? DateTime.now()) : (to ?? DateTime.now());
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null) return;
    if (isFrom) {
      onFromChanged(picked);
      // If from > to, snap to so the range stays valid.
      if (to != null && picked.isAfter(to!)) onToChanged(picked);
    } else {
      onToChanged(picked);
      if (from != null && picked.isBefore(from!)) onFromChanged(picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasAny = from != null || to != null;
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (showLabel) ...[
            Icon(Icons.date_range, size: 18, color: tint),
            const SizedBox(width: 6),
          ],
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
            const SizedBox(width: 6),
            IconButton(
              tooltip: 'Clear dates',
              icon: const Icon(Icons.close, size: 18),
              padding: EdgeInsets.zero,
              constraints:
                  const BoxConstraints(minWidth: 32, minHeight: 32),
              onPressed: onClear,
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: active ? tint.withOpacity(0.12) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? tint : Colors.black12,
            width: active ? 1.2 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.calendar_today_outlined,
                size: 14, color: active ? tint : Colors.black54),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: active ? tint : Colors.black87,
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

/// Returns true if [created] falls within the inclusive [from..to] range.
/// `null` bounds mean unbounded on that side. The end is treated as the
/// END of that day (23:59:59.999).
bool dateInRange(DateTime? created, {DateTime? from, DateTime? to}) {
  if (created == null) return from == null && to == null;
  if (from != null) {
    final start = DateTime(from.year, from.month, from.day);
    if (created.isBefore(start)) return false;
  }
  if (to != null) {
    final end = DateTime(to.year, to.month, to.day, 23, 59, 59, 999);
    if (created.isAfter(end)) return false;
  }
  return true;
}
