import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Colors, Material;
import 'package:intl/intl.dart';

import '../../../services/attendance_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/oms_loader.dart';

class CupertinoMyAttendancePage extends StatefulWidget {
  const CupertinoMyAttendancePage({super.key});

  @override
  State<CupertinoMyAttendancePage> createState() =>
      _CupertinoMyAttendancePageState();
}

enum _ApplyTab { halfDay, leave }

class _CupertinoMyAttendancePageState extends State<CupertinoMyAttendancePage> {
  AttendanceRecord? _today;
  bool _loadingToday = true;
  bool _markingPresent = false;
  bool _checkingOut = false;

  _ApplyTab _applyTab = _ApplyTab.leave;
  DateTime? _fromDate;
  DateTime? _toDate;
  final _reasonController = TextEditingController();
  bool _applying = false;

  final List<AttendanceRecord> _history = [];
  bool _loadingHistory = true;
  bool _loadingMore = false;
  String? _nextCursor;

  static final DateFormat _isoFmt = DateFormat('yyyy-MM-dd');
  static final DateFormat _displayDateFmt = DateFormat('dd-MM-yyyy');
  static final DateFormat _markedAtFmt = DateFormat('M/d/yyyy, h:mm:ss a');

  @override
  void initState() {
    super.initState();
    _fromDate = DateTime.now();
    _refreshAll();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _refreshAll() async {
    await Future.wait([_fetchToday(), _fetchHistory(reset: true)]);
  }

  Future<void> _fetchToday() async {
    setState(() => _loadingToday = true);
    try {
      final today = await AttendanceService.getMyToday();
      if (!mounted) return;
      setState(() {
        _today = today;
        _loadingToday = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingToday = false);
      CupertinoToast.show(context, 'Could not load today: $e', isError: true);
    }
  }

  Future<void> _fetchHistory({bool reset = false}) async {
    setState(() {
      if (reset) {
        _history.clear();
        _nextCursor = null;
        _loadingHistory = true;
      } else {
        _loadingMore = true;
      }
    });
    try {
      final page = await AttendanceService.getMyHistory(
        cursor: reset ? null : _nextCursor,
        limit: 50,
      );
      if (!mounted) return;
      setState(() {
        _history.addAll(page.rows);
        _nextCursor = page.nextCursor;
        _loadingHistory = false;
        _loadingMore = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingHistory = false;
        _loadingMore = false;
      });
      CupertinoToast.show(context, 'Could not load history: $e', isError: true);
    }
  }

  Future<void> _markPresent() async {
    setState(() => _markingPresent = true);
    try {
      final rec =
          await AttendanceService.mark(status: AttendanceStatus.present);
      if (!mounted) return;
      setState(() {
        _today = rec;
        _markingPresent = false;
      });
      CupertinoToast.show(context, 'Marked present for today');
      await _fetchHistory(reset: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _markingPresent = false);
      CupertinoToast.show(context, '$e', isError: true);
    }
  }

  Future<void> _checkOut() async {
    setState(() => _checkingOut = true);
    try {
      final rec = await AttendanceService.checkOut();
      if (!mounted) return;
      setState(() {
        _today = rec;
        _checkingOut = false;
      });
      CupertinoToast.show(context, 'Checked out for the day');
      await _fetchHistory(reset: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _checkingOut = false);
      CupertinoToast.show(context, '$e', isError: true);
    }
  }

  Future<void> _applyHalfDayOrLeave() async {
    if (_fromDate == null) {
      CupertinoToast.show(context, 'Please pick a From date', isError: true);
      return;
    }
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      CupertinoToast.show(context, 'Reason is required', isError: true);
      return;
    }

    setState(() => _applying = true);
    try {
      if (_applyTab == _ApplyTab.leave) {
        final start = _isoFmt.format(_fromDate!);
        final end = _toDate != null ? _isoFmt.format(_toDate!) : start;
        final result = await AttendanceService.markLeaveRange(
          startDate: start,
          endDate: end,
          reason: reason,
        );
        final count = (result['count'] as int?) ?? 0;
        final skipped = (result['skipped'] as List?)?.length ?? 0;
        if (!mounted) return;
        CupertinoToast.show(
          context,
          count > 0
              ? 'Leave applied for $count day${count == 1 ? '' : 's'}${skipped > 0 ? ' ($skipped skipped)' : ''}'
              : 'No new leave days marked',
        );
      } else {
        await AttendanceService.mark(
          status: AttendanceStatus.halfDay,
          reason: reason,
          date: _isoFmt.format(_fromDate!),
        );
        if (!mounted) return;
        CupertinoToast.show(context, 'Half Day applied');
      }
      _reasonController.clear();
      if (!mounted) return;
      setState(() {
        _toDate = null;
        _applying = false;
      });
      await Future.wait([_fetchToday(), _fetchHistory(reset: true)]);
    } catch (e) {
      if (!mounted) return;
      setState(() => _applying = false);
      CupertinoToast.show(context, '$e', isError: true);
    }
  }

  Future<void> _pickDate(bool isFrom) async {
    final now = DateTime.now();
    final minDate = isFrom ? now : (_fromDate ?? now);
    final maxDate = now.add(const Duration(days: 365));
    final initial = (isFrom ? _fromDate : _toDate) ?? minDate;

    DateTime tempPicked = initial.isBefore(minDate) ? minDate : initial;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Container(
        height: 280,
        color: AppTheme.surface,
        child: Column(
          children: [
            SizedBox(
              height: 44,
              child: Row(
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Cancel'),
                  ),
                  const Spacer(),
                  CupertinoButton(
                    onPressed: () {
                      setState(() {
                        if (isFrom) {
                          _fromDate = tempPicked;
                          if (_toDate != null && _toDate!.isBefore(tempPicked))
                            _toDate = null;
                        } else {
                          _toDate = tempPicked;
                        }
                      });
                      Navigator.pop(ctx);
                    },
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: CupertinoDatePicker(
                mode: CupertinoDatePickerMode.date,
                initialDateTime: tempPicked,
                minimumDate: minDate,
                maximumDate: maxDate,
                onDateTimeChanged: (d) => tempPicked = d,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'my_attendance',
      headers: const ['Date', 'Status', 'Reason', 'Marked At'],
      rows: _history
          .map((r) => [
                r.date,
                r.status.label,
                r.reason ?? '',
                r.markedAt == null ? '' : _formatMarkedAt(r.markedAt!),
              ])
          .toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: 'My Attendance',
            trailing: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _history.isEmpty ? null : _exportCsv,
              child: const Icon(CupertinoIcons.arrow_down_doc,
                  size: 22, color: CupertinoColors.white),
            ),
          ),
          Expanded(
            child: CustomScrollView(
              slivers: [
                CupertinoSliverRefreshControl(onRefresh: _refreshAll),
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      // The page header already reads "My Attendance";
                      // repeating it here just duplicated the title.
                      Text(
                        "Mark today's attendance or plan a half day / leave for any upcoming date.",
                        style: TextStyle(
                            fontSize: 13, color: Colors.grey.shade600),
                      ),
                      const SizedBox(height: 16),
                      _buildTodayCard(),
                      const SizedBox(height: 16),
                      _buildApplyCard(),
                      const SizedBox(height: 16),
                      _buildHistoryCard(),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTodayCard() {
    final today = _today;
    final todayIso = _isoFmt.format(DateTime.now());
    final alreadyMarked = today != null;
    final alreadyPresent = today?.status == AttendanceStatus.present;
    // Check-out is only valid once you're present/half-day for the day and
    // haven't already stamped a departure. Leave days can't be checked out of.
    final workedToday = today?.status == AttendanceStatus.present ||
        today?.status == AttendanceStatus.halfDay;
    final alreadyCheckedOut =
        (today?.checkOutAt != null && today!.checkOutAt!.isNotEmpty);
    final canCheckOut = workedToday && !alreadyCheckedOut;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(CupertinoIcons.check_mark_circled,
                  color: AppTheme.successGreen, size: 20),
              const SizedBox(width: 8),
              Text(
                'Today — $todayIso',
                style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: AppTheme.foreground),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingToday)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: OmsLoader(size: 56),
            )
          else
            Row(
              children: [
                _statusPill(today?.status),
                const Spacer(),
                if (today?.markedAt != null)
                  Text(
                    'Marked at ${_formatMarkedAt(today!.markedAt!)}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                  ),
              ],
            ),
          if (alreadyCheckedOut) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                'Checked out at ${_formatMarkedAt(today.checkOutAt!)}',
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.destructiveRed,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: CupertinoButton.filled(
                  onPressed:
                      (_markingPresent || alreadyMarked) ? null : _markPresent,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  borderRadius: BorderRadius.circular(10),
                  child: _markingPresent
                      ? const CupertinoActivityIndicator(color: Colors.white)
                      : Text(
                          alreadyPresent
                              ? 'Marked present'
                              : alreadyMarked
                                  ? 'Marked ${today.status.label.toLowerCase()}'
                                  : 'Mark me present',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 14),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: CupertinoButton(
                  onPressed: (_checkingOut || !canCheckOut) ? null : _checkOut,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  borderRadius: BorderRadius.circular(10),
                  color: AppTheme.destructiveRed100,
                  disabledColor: AppTheme.backgroundAlt,
                  child: _checkingOut
                      ? const CupertinoActivityIndicator(
                          color: AppTheme.destructiveRed)
                      : Text(
                          alreadyCheckedOut
                              ? 'Checked out'
                              : 'Check out (leaving)',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                            color: canCheckOut
                                ? AppTheme.destructiveRed
                                : AppTheme.muted,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildApplyCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(CupertinoIcons.calendar,
                  color: AppTheme.primaryIndigo, size: 20),
              SizedBox(width: 8),
              Text(
                'Apply Half Day or Leave',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: AppTheme.foreground),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'For today or any upcoming date.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 14),
          CupertinoSlidingSegmentedControl<_ApplyTab>(
            groupValue: _applyTab,
            children: const {
              _ApplyTab.halfDay: Padding(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Text('Half Day',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
              _ApplyTab.leave: Padding(
                padding: EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Text('Leave',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
            },
            onValueChanged: (v) {
              if (v == null) return;
              setState(() {
                _applyTab = v;
                if (v == _ApplyTab.halfDay) _toDate = null;
              });
            },
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _dateField(
                  label: 'From date',
                  hint: 'Today or any future date.',
                  value: _fromDate,
                  onTap: () => _pickDate(true),
                ),
              ),
              if (_applyTab == _ApplyTab.leave) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: _dateField(
                    label: 'To date (optional)',
                    hint: 'Leave blank for single day. Max 90 days.',
                    value: _toDate,
                    onTap: () => _pickDate(false),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Reason (required)',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.foreground),
          ),
          const SizedBox(height: 6),
          // CupertinoTextField needs Material ancestor for cursor on some
          // platforms; wrap in Material(transparent) for safety.
          Material(
            color: Colors.transparent,
            child: CupertinoTextField(
              controller: _reasonController,
              minLines: 3,
              maxLines: 5,
              placeholder: 'e.g. Family function, medical, etc.',
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppTheme.border),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: CupertinoButton.filled(
              onPressed: _applying ? null : _applyHalfDayOrLeave,
              padding: const EdgeInsets.symmetric(vertical: 14),
              borderRadius: BorderRadius.circular(10),
              child: _applying
                  ? const CupertinoActivityIndicator(color: Colors.white)
                  : Text(
                      _applyTab == _ApplyTab.leave
                          ? 'Apply Leave'
                          : 'Apply Half Day',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 14),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dateField({
    required String label,
    required String hint,
    required DateTime? value,
    required VoidCallback onTap,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppTheme.foreground),
        ),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppTheme.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value == null
                        ? 'dd-mm-yyyy'
                        : _displayDateFmt.format(value),
                    style: TextStyle(
                      color: value == null
                          ? Colors.grey.shade500
                          : AppTheme.foreground,
                    ),
                  ),
                ),
                const Icon(CupertinoIcons.calendar,
                    size: 18, color: AppTheme.muted),
              ],
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(hint, style: TextStyle(fontSize: 10, color: Colors.grey.shade600)),
      ],
    );
  }

  Widget _buildHistoryCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'My History',
            style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 15,
                color: AppTheme.foreground),
          ),
          const SizedBox(height: 12),
          if (_loadingHistory)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: OmsLoader(size: 56),
            )
          else if (_history.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No attendance records yet',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
                ),
              ),
            )
          else
            Column(children: [for (final r in _history) _historyRow(r)]),
          if (_nextCursor != null && !_loadingHistory) ...[
            const SizedBox(height: 12),
            Center(
              child: CupertinoButton(
                onPressed:
                    _loadingMore ? null : () => _fetchHistory(reset: false),
                child: _loadingMore
                    ? const CupertinoActivityIndicator()
                    : const Text('Load older entries'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _historyRow(AttendanceRecord r) {
    final reason = (r.reason ?? '').isEmpty ? '—' : r.reason!;
    final markedAt = r.markedAt == null ? '—' : _formatMarkedAt(r.markedAt!);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  r.date,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.foreground),
                ),
              ),
              const SizedBox(width: 8),
              _statusPill(r.status, compact: true),
              const SizedBox(width: 8),
              Text(
                markedAt,
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            reason,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
          ),
        ],
      ),
    );
  }

  Widget _statusPill(AttendanceStatus? status, {bool compact = false}) {
    final (bg, fg, label) = _statusStyle(status);
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10, vertical: compact ? 3 : 5),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(
        label,
        style: TextStyle(
            fontSize: compact ? 10 : 11,
            fontWeight: FontWeight.w700,
            color: fg),
      ),
    );
  }

  (Color, Color, String) _statusStyle(AttendanceStatus? s) {
    switch (s) {
      case AttendanceStatus.present:
        return (AppTheme.successGreen100, AppTheme.successGreen, 'Present');
      case AttendanceStatus.halfDay:
        return (AppTheme.warningAmber100, AppTheme.saffronDark, 'Half Day');
      case AttendanceStatus.leave:
        return (AppTheme.primaryIndigo100, AppTheme.primaryIndigo, 'Leave');
      case AttendanceStatus.absent:
        return (AppTheme.destructiveRed100, AppTheme.destructiveRed, 'Absent');
      case null:
        return (AppTheme.backgroundAlt, AppTheme.muted, 'Not marked');
    }
  }

  BoxDecoration _cardDecoration() => BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      );

  String _formatMarkedAt(String iso) {
    try {
      return _markedAtFmt.format(DateTime.parse(iso).toLocal());
    } catch (_) {
      return iso;
    }
  }
}
