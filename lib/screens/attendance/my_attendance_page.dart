import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/attendance_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';

/// Staff "My Attendance": today's status card + Half Day / Leave apply form +
/// paginated history table. Mirrors the deployed web UX (screenshots from
/// 2026-05-21) and hits /api/attendance via [AttendanceService].
class MyAttendancePage extends StatefulWidget {
  const MyAttendancePage({super.key});

  @override
  State<MyAttendancePage> createState() => _MyAttendancePageState();
}

enum _ApplyTab { halfDay, leave }

class _MyAttendancePageState extends State<MyAttendancePage> {
  AttendanceRecord? _today;
  bool _loadingToday = true;
  bool _markingPresent = false;
  bool _checkingOut = false;

  // Apply form
  _ApplyTab _applyTab = _ApplyTab.leave;
  DateTime? _fromDate;
  DateTime? _toDate;
  final _reasonController = TextEditingController();
  bool _applying = false;

  // History
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
      _snack('Could not load today: $e');
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
      _snack('Could not load history: $e');
    }
  }

  Future<void> _markPresent() async {
    setState(() => _markingPresent = true);
    try {
      final rec = await AttendanceService.mark(status: AttendanceStatus.present);
      if (!mounted) return;
      setState(() {
        _today = rec;
        _markingPresent = false;
      });
      _snack('Marked present for today');
      await _fetchHistory(reset: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _markingPresent = false);
      _snack('$e');
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
      _snack('Checked out for the day');
      await _fetchHistory(reset: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _checkingOut = false);
      _snack('$e');
    }
  }

  Future<void> _applyHalfDayOrLeave() async {
    if (_fromDate == null) {
      _snack('Please pick a From date');
      return;
    }
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      _snack('Reason is required');
      return;
    }

    setState(() => _applying = true);
    try {
      if (_applyTab == _ApplyTab.leave) {
        // Multi-day leave (or single day when To is blank).
        final start = _isoFmt.format(_fromDate!);
        final end = _toDate != null ? _isoFmt.format(_toDate!) : start;
        final result = await AttendanceService.markLeaveRange(
          startDate: start,
          endDate: end,
          reason: reason,
        );
        final count = (result['count'] as int?) ?? 0;
        final skipped = (result['skipped'] as List?)?.length ?? 0;
        _snack(count > 0
            ? 'Leave applied for $count day${count == 1 ? '' : 's'}${skipped > 0 ? ' ($skipped skipped)' : ''}'
            : 'No new leave days marked');
      } else {
        // Half Day is single-day; backend rejects multi-day half-days.
        await AttendanceService.mark(
          status: AttendanceStatus.halfDay,
          reason: reason,
          date: _isoFmt.format(_fromDate!),
        );
        _snack('Half Day applied');
      }
      _reasonController.clear();
      setState(() {
        _toDate = null;
        _applying = false;
      });
      await Future.wait([_fetchToday(), _fetchHistory(reset: true)]);
    } catch (e) {
      if (!mounted) return;
      setState(() => _applying = false);
      _snack('$e');
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
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
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('My Attendance'),
        backgroundColor: AppTheme.primaryIndigo,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(Icons.download),
            onPressed: _history.isEmpty ? null : _exportCsv,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshAll,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'My Attendance',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryIndigo,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "Mark today's attendance or plan a half day / leave for any upcoming date.",
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            _buildTodayCard(),
            const SizedBox(height: 16),
            _buildApplyCard(),
            const SizedBox(height: 16),
            _buildHistoryCard(),
          ],
        ),
      ),
    );
  }

  Widget _buildTodayCard() {
    final today = _today;
    final todayIso = _isoFmt.format(DateTime.now());
    final alreadyPresent = today?.status == AttendanceStatus.present;
    final alreadyMarked = today != null;
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
              const Icon(Icons.check_circle,
                  color: AppTheme.successGreen, size: 20),
              const SizedBox(width: 8),
              Text(
                'Today — $todayIso',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: AppTheme.foreground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_loadingToday)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            Row(
              children: [
                _statusPill(today?.status),
                const Spacer(),
                if (today?.markedAt != null)
                  Text(
                    'Marked at ${_formatMarkedAt(today!.markedAt!)}',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade600,
                    ),
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
                child: ElevatedButton.icon(
                  onPressed:
                      (_markingPresent || alreadyMarked) ? null : _markPresent,
                  icon: _markingPresent
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation(Colors.white),
                          ),
                        )
                      : const Icon(Icons.check_circle_outline),
                  label: Text(
                    alreadyPresent
                        ? 'Marked present'
                        : alreadyMarked
                            ? 'Marked ${today.status.label.toLowerCase()}'
                            : 'Mark me present (today)',
                    textAlign: TextAlign.center,
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: alreadyMarked
                        ? AppTheme.successGreenLight
                        : AppTheme.successGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    disabledBackgroundColor: AppTheme.successGreenLight,
                    disabledForegroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed:
                      (_checkingOut || !canCheckOut) ? null : _checkOut,
                  icon: _checkingOut
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor:
                                AlwaysStoppedAnimation(AppTheme.destructiveRed),
                          ),
                        )
                      : const Icon(Icons.logout, size: 18),
                  label: Text(
                    alreadyCheckedOut ? 'Checked out' : 'Check out (leaving)',
                    textAlign: TextAlign.center,
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.destructiveRed,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(
                      color: canCheckOut
                          ? AppTheme.destructiveRed
                          : AppTheme.border,
                    ),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
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
              Icon(Icons.calendar_month_outlined,
                  color: AppTheme.primaryIndigo, size: 20),
              SizedBox(width: 8),
              Text(
                'Apply Half Day or Leave',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 15,
                  color: AppTheme.foreground,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'For today or any upcoming date.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
          ),
          const SizedBox(height: 14),
          // Tab toggle
          Container(
            decoration: BoxDecoration(
              color: AppTheme.backgroundAlt,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                _tabButton(_ApplyTab.halfDay, 'Half Day',
                    Icons.access_time_outlined),
                _tabButton(_ApplyTab.leave, 'Leave',
                    Icons.event_busy_outlined),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // Date pickers
          Row(
            children: [
              Expanded(
                child: _dateField(
                  label: 'From date',
                  hint: 'Today or any future date.',
                  value: _fromDate,
                  onPick: (d) => setState(() {
                    _fromDate = d;
                    if (_toDate != null && _toDate!.isBefore(d)) _toDate = null;
                  }),
                ),
              ),
              if (_applyTab == _ApplyTab.leave) ...[
                const SizedBox(width: 12),
                Expanded(
                  child: _dateField(
                    label: 'To date (optional)',
                    hint: 'Leave blank for single day. Max 90 days.',
                    value: _toDate,
                    onPick: (d) => setState(() => _toDate = d),
                    minDate: _fromDate,
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
          TextField(
            controller: _reasonController,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'e.g. Family function, medical, etc.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _applying ? null : _applyHalfDayOrLeave,
              icon: _applying
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation(Colors.white),
                      ),
                    )
                  : Icon(_applyTab == _ApplyTab.leave
                      ? Icons.event_busy
                      : Icons.access_time),
              label: Text(
                _applyTab == _ApplyTab.leave ? 'Apply Leave' : 'Apply Half Day',
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryIndigo,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tabButton(_ApplyTab tab, String label, IconData icon) {
    final selected = _applyTab == tab;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() {
          _applyTab = tab;
          if (tab == _ApplyTab.halfDay) _toDate = null;
        }),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppTheme.primaryIndigo : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 16,
                  color: selected ? Colors.white : AppTheme.muted),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : AppTheme.foreground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dateField({
    required String label,
    required String hint,
    required DateTime? value,
    required ValueChanged<DateTime> onPick,
    DateTime? minDate,
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
        InkWell(
          onTap: () async {
            final now = DateTime.now();
            final picked = await showDatePicker(
              context: context,
              initialDate: value ?? minDate ?? now,
              firstDate: minDate ?? now,
              lastDate: now.add(const Duration(days: 365)),
            );
            if (picked != null) onPick(picked);
          },
          child: InputDecorator(
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              suffixIcon: Icon(Icons.calendar_today, size: 18),
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            ),
            child: Text(
              value == null ? 'dd-mm-yyyy' : _displayDateFmt.format(value),
              style: TextStyle(
                color: value == null
                    ? Colors.grey.shade500
                    : AppTheme.foreground,
              ),
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
              color: AppTheme.foreground,
            ),
          ),
          const SizedBox(height: 12),
          if (_loadingHistory)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else if (_history.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No attendance records yet',
                  style:
                      TextStyle(fontSize: 13, color: Colors.grey.shade500),
                ),
              ),
            )
          else
            Column(
              children: [
                for (final r in _history) _historyRow(r),
              ],
            ),
          if (_nextCursor != null && !_loadingHistory) ...[
            const SizedBox(height: 12),
            Center(
              child: TextButton.icon(
                onPressed:
                    _loadingMore ? null : () => _fetchHistory(reset: false),
                icon: _loadingMore
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child:
                            CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.expand_more, size: 16),
                label:
                    Text(_loadingMore ? 'Loading...' : 'Load older entries'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _historyRow(AttendanceRecord r) {
    final reason = (r.reason ?? '').isEmpty ? '—' : r.reason!;
    final markedAt =
        r.markedAt == null ? '—' : _formatMarkedAt(r.markedAt!);
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
                    color: AppTheme.foreground,
                  ),
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

  // Status pill styling matches the web — green for Present, amber for Half
  // Day, blue for Leave, red for Absent.
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
          color: fg,
        ),
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
